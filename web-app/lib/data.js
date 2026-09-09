// Data-access layer for Performance Pulse. Every function takes a Supabase
// client as its first argument so the same code works from Client Components
// (browser client) and Server Components (server client) alike.
//
// This replaces the original app's single `data` blob + save()/commit()
// pattern: each function here is one focused read or write against Postgres,
// with RLS (see supabase/schema.sql) doing the access control that used to
// be implicit in "it's all in one browser's localStorage."

const NOTIFICATION_CAP = 80;

// ---------------------------------------------------------------- pair -----

// An account can be on any number of pairs (a middle manager, or a manager
// with 2+ reports — see SLACK_TODO.md item 2). Ordered oldest-first so the
// dashboard layout has a stable default ("first pair created") when there's
// no cookie yet.
export async function listMyPairs(supabase, userId) {
  const { data, error } = await supabase
    .from("pairs")
    .select("*")
    .or(`employee_id.eq.${userId},manager_id.eq.${userId}`)
    .is("closed_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getPair(supabase, pairId) {
  const { data, error } = await supabase.from("pairs").select("*").eq("id", pairId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createPair(supabase, myRole, partnerEmail) {
  const { data, error } = await supabase.rpc("create_pair", {
    my_role: myRole,
    partner_email: partnerEmail,
  });
  if (error) throw error;
  return data;
}

// Slack-only equivalent of create_pair's RPC. The RPC resolves "who's doing
// this" from auth.uid(), which only exists in a browser session -- Slack's
// handlers run as the admin client with no such session (see the governance
// note in web-app/CLAUDE.md), so managerId/managerEmail must come from the
// caller's already-verified Slack identity (resolveSlackUser), never from
// anything in the interaction payload itself. Scoped to manager-adds-employee
// only, matching the one real request this exists for (SLACK_TODO.md).
export async function createPairForSlack(admin, managerId, managerEmail, employeeEmail) {
  // The roster importer (createPairFromRoster) enforces one active manager
  // per employee; this path had no equivalent check, so a manager could add
  // someone here who already has a different active manager elsewhere,
  // silently giving that employee two managers at once, found in review
  // 2026-09-05. Checked directly here rather than relying on the DB's
  // (employee_id, manager_id) unique index, which never fires for an
  // employee with no profile yet (employee_id is NULL on every such row,
  // and Postgres treats NULL as distinct from NULL) -- that gap let a
  // manager silently re-add the same not-yet-signed-up person twice,
  // found while testing this same fix.
  const { data: existing, error: existingErr } = await admin.from("pairs").select("id, manager_id").eq("employee_email", employeeEmail).is("closed_at", null);
  if (existingErr) throw existingErr;
  const dup = existing[0];
  if (dup) {
    if (dup.manager_id === managerId) throw new Error("You're already paired with this person.");
    throw new Error("This person already has an active pairing with a different manager. Ask them or HR to close it first.");
  }

  const { data: employeeProfile } = await admin.from("profiles").select("id").eq("email", employeeEmail).maybeSingle();
  const { data, error } = await admin
    .from("pairs")
    .insert({
      manager_id: managerId,
      manager_email: managerEmail,
      employee_id: employeeProfile?.id || null,
      employee_email: employeeEmail,
    })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("You're already paired with this person.");
    throw error;
  }
  return data;
}

// Pure, dependency-free name -> email resolution for the HR roster importer
// (app/api/hr/roster/route.js). Pulled out of the route handler specifically
// so this can be unit-tested without mocking ExcelJS or a real HTTP request
// -- this exact logic is what let the 2026-09-07 incident happen: a re-
// upload with a blank Email cell for an existing real manager ("Melissa
// Weiss") had nothing to fall back on but a freshly-guessed placeholder,
// which createPairFromRoster then wrote over her real, already-linked
// email everywhere she was referenced as a manager.
//
// `allRows`: every row from the CURRENT upload, as {employee, manager, email}
// (email may be "" if the sheet has no Email column or the cell is blank).
// `knownReal`: independently-fetched `pairs` rows where employee_email is
// NOT a placeholder, as {employee_label, employee_email} -- i.e. "people
// this app already knows the real email for, whether or not they're on
// this specific sheet." Sheet data always wins; knownReal only fills a gap
// this sheet itself left, so a legitimate rename/correction in the sheet
// is never overridden by stale history.
export function resolveRosterEmails(allRows, knownReal) {
  const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const nameToEmail = new Map();
  const nameCollisions = new Set();
  for (const { employee, email } of allRows) {
    if (!email) continue;
    const key = norm(employee);
    if (nameToEmail.has(key) && nameToEmail.get(key) !== email) nameCollisions.add(employee);
    nameToEmail.set(key, email);
  }
  for (const row of knownReal || []) {
    if (!row.employee_label) continue;
    const key = norm(row.employee_label);
    if (!nameToEmail.has(key)) nameToEmail.set(key, row.employee_email);
  }
  return { nameToEmail, nameCollisions: [...nameCollisions] };
}

// HR roster import: creates one pair per (employee, manager) row from an
// uploaded org chart, admin-side, since HR is on neither side of most of
// these pairs (unlike createPair/createPairForSlack, which always attach
// the acting user to the new row). The DB's unique index is on
// (employee_id, manager_id) -- Postgres treats NULL <> NULL, so it won't
// catch a re-upload where both sides are still unmatched placeholder
// emails; checked by email pair here instead (Melissa's call, 2026-09-04).
// One active pairing per employee (a re-uploaded roster corrects the
// existing row's manager instead of leaving a stale one in place -- an
// earlier version deduped on the exact (employee_email, manager_email)
// pair, so a row created with a wrong/placeholder manager email before a
// parsing fix was never corrected by a later, fixed re-upload: the newly
// computed row didn't match the old one, so it just inserted a second row
// and left the first, wrong one active, 2026-09-05). Also handles a real
// manager change (employee moved teams): reassigns the existing pairing in
// place rather than leaving the old one open and inserting a second, which
// used to leave the employee showing up under both managers at once
// (found 2026-09-06).
export async function createPairFromRoster(admin, employeeEmail, managerEmail, managerPlaceholder, employeeLabel) {
  // One query covers both the exact-duplicate check and the stale-placeholder
  // self-heal check (both only ever matched non-closed rows for this
  // employee_email) -- two round trips collapsed into one, 2026-09-05.
  const [{ data: existingRows, error: existingErr }, { data: mgr, error: mgrErr }] = await Promise.all([
    admin.from("pairs").select("id, manager_email").eq("employee_email", employeeEmail).is("closed_at", null),
    admin.from("profiles").select("id").eq("email", managerEmail).maybeSingle(),
  ]);
  if (existingErr) throw existingErr;
  if (mgrErr) throw mgrErr;

  if (existingRows.some((r) => r.manager_email === managerEmail)) return { skipped: true };

  // Self-heal ONLY the row that was a placeholder for THIS SAME manager name
  // (matched by the exact placeholder email that name would generate, not
  // "any placeholder") -- an employee can legitimately have a second,
  // different pending manager (dotted-line reporting), and keying this off
  // employee_email alone previously matched and clobbered that unrelated
  // relationship instead of only correcting a stale copy of itself, found
  // live 2026-09-05.
  const stale = managerPlaceholder && existingRows.find((r) => r.manager_email === managerPlaceholder);

  if (stale) {
    const { error } = await admin
      .from("pairs")
      .update({ manager_email: managerEmail, manager_id: mgr?.id || null })
      .eq("id", stale.id);
    if (error) throw error;
    return { skipped: false, updated: true };
  }

  // Reassignment: this employee has exactly one other active pairing, under
  // a genuinely different (non-placeholder) manager -- the roster moved
  // them. Reassign that SAME row rather than closing it and inserting a new
  // one, so every topic/goal/action/feedback tied to its pair_id carries
  // straight over to the new manager (Melissa's explicit call, 2026-09-06:
  // the new manager sees the employee's full history, not a blank slate).
  // Only safe when exactly one existing row -- with two or more (dotted-line
  // reporting, rare but real per Melissa) there's no way to guess which one
  // this roster row means to replace, so that case falls through to
  // inserting a new pairing instead, same as before.
  if (existingRows.length === 1) {
    // Never let a re-upload downgrade a manager who's already known by a
    // real email into a freshly-guessed placeholder. If this roster's Email
    // column is blank (or typo'd) for that manager's name, emailFor() falls
    // back to a placeholder even though the manager is already real and
    // linked -- reassigning to it would silently overwrite every one of
    // their real reports with a fake address, locking the real manager out
    // of their own team. Found live 2026-09-07: a re-upload missing
    // "Melissa Weiss"'s email reassigned all 6 of her real direct reports to
    // melissa.weiss@placeholder.test. Refuse instead of guessing -- the row
    // keeps its current real manager, and the thrown error lands in the
    // upload response's `failed` list so HR sees it and can fix the sheet.
    const currentManagerEmail = existingRows[0].manager_email;
    const isPlaceholder = (email) => email.toLowerCase().endsWith("@placeholder.test");
    if (!isPlaceholder(currentManagerEmail) && isPlaceholder(managerEmail)) {
      throw new Error(`won't replace ${currentManagerEmail} (a real, already-linked manager) with a placeholder -- check the Email column for this manager's row`);
    }
    const { error } = await admin
      .from("pairs")
      .update({ manager_email: managerEmail, manager_id: mgr?.id || null })
      .eq("id", existingRows[0].id);
    if (error) {
      // Mirrors the insert path's own 23505 handling below -- a reassignment
      // can now collide with 0022's partial (employee_id, manager_id) index
      // (e.g. this employee has a second row already linked to the same
      // manager) or 0021's email-pair index. Surface a readable reason
      // instead of the raw Postgres constraint string, found in review
      // 2026-09-07.
      if (error.code === "23505") throw new Error(`this employee already has an active pairing with ${managerEmail}`);
      throw error;
    }
    return { reassigned: true, fromManagerEmail: currentManagerEmail };
  }

  // Only needed on the insert path -- fetched here, not up front, so the
  // exact-duplicate and self-heal branches above never pay for a lookup
  // they don't use, 2026-09-05.
  const { data: emp, error: empErr } = await admin.from("profiles").select("id").eq("email", employeeEmail).maybeSingle();
  if (empErr) throw empErr;

  const { error } = await admin.from("pairs").insert({
    employee_id: emp?.id || null,
    employee_email: employeeEmail,
    manager_id: mgr?.id || null,
    manager_email: managerEmail,
    employee_label: employeeLabel || null,
  });
  if (error) {
    if (error.code === "23505") return { skipped: true };
    throw error;
  }
  return { skipped: false };
}

export async function getProfile(supabase, userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updatePair(supabase, pairId, fields) {
  const { data, error } = await supabase.from("pairs").update(fields).eq("id", pairId).select().single();
  if (error) throw error;
  return data;
}

// "Final wrap up for this conversation" -- ends a pairing, not a single
// meeting (that's saveWrapUp below). Reopenable: closing again later just
// overwrites the note, no history of past closes is kept.
export async function closePair(supabase, pairId, note) {
  return updatePair(supabase, pairId, { closed_at: new Date().toISOString(), closing_note: note || null });
}

export async function reopenPair(supabase, pairId) {
  return updatePair(supabase, pairId, { closed_at: null });
}

// One-click "remove the roster" for HR (Melissa's explicit ask, 2026-09-06):
// closes every currently-open pairing in one query, the same way closePair
// closes one -- still just sets closed_at/closing_note, so every row is
// reopenable individually afterward, same as any other closed pairing.
// Admin-only (service-role client): bypasses the same manager-only
// restriction the org chart's per-row Close button already bypasses, for
// the same reason -- most of these pairings' managers can't sign in to
// close them themselves.
export async function closeAllPairs(admin, note) {
  const { data, error } = await admin
    .from("pairs")
    .update({ closed_at: new Date().toISOString(), closing_note: note || null })
    .is("closed_at", null)
    .select("id");
  if (error) throw error;
  return data.length;
}

export async function listClosedPairs(supabase, userId) {
  const { data, error } = await supabase
    .from("pairs")
    .select("*")
    .or(`employee_id.eq.${userId},manager_id.eq.${userId}`)
    .not("closed_at", "is", null)
    .order("closed_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function updateProfile(supabase, userId, fields) {
  const { data, error } = await supabase.from("profiles").update(fields).eq("id", userId).select().single();
  if (error) throw error;
  return data;
}

// -------------------------------------------------------------- topics -----

export async function listTopics(supabase, pairId) {
  const { data, error } = await supabase
    .from("topics")
    .select("*")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

// `submitted`: set true only for a topic whose creation path is deliberately
// Slack-silent by design (see addFromHardConvo, app/(dashboard)/one-on-one/
// page.js) — it stamps submitted_at at insert time, the same "already
// submitted" backfill used in migration 0009_topic_submit_flag.sql for
// pre-existing rows, so the topic never shows a Submit button and a later
// click can never fire the real Slack DM submitTopic()/topic_submit sends.
// Every other caller leaves this false/omitted and gets the normal
// null-until-explicitly-submitted row.
export async function addTopic(supabase, pairId, { text, why, category, role, name, submitted = false }) {
  const { data, error } = await supabase
    .from("topics")
    .insert({
      pair_id: pairId,
      text,
      why: why || "",
      category,
      created_by_role: role,
      created_by_name: name,
      submitted_at: submitted ? new Date().toISOString() : null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * ctx: { actorName, actorRole, source } — who marked it and from where
 * ("web" or "slack"). Reading the row first is what lets the log record a real
 * old -> new pair, and means callers don't have to pass the pair or the label.
 * Both the website and the Slack interactivity route come through here, so
 * instrumenting this one function covers both surfaces.
 */
export async function setTopicStatus(supabase, id, status, ctx = {}) {
  const { data: before } = await supabase.from("topics").select("pair_id, text, status").eq("id", id).maybeSingle();
  const { error } = await supabase
    .from("topics")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  if (before) {
    await logActivity(supabase, before.pair_id, {
      entity: "topic",
      entityId: id,
      label: before.text,
      oldValue: before.status,
      newValue: status,
      ...ctx,
    });
  }
}

/**
 * Changes a topic's own text/category/why after it's been added — separate
 * from setTopicStatus (state, e.g. Discussed) and setTopicNotes (what came
 * up in conversation). Added so someone who forgets what they originally
 * typed can pull it back up and correct it instead of deleting and
 * re-adding. Same ctx/logging shape as setTopicStatus so both surfaces
 * (website, Slack) share one call site.
 */
export async function updateTopic(supabase, id, { text, why, category }, ctx = {}) {
  const { data: before } = await supabase.from("topics").select("pair_id, text").eq("id", id).maybeSingle();
  const { error } = await supabase
    .from("topics")
    .update({ text, why: why || "", category, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  if (before && before.text !== text) {
    await logActivity(supabase, before.pair_id, {
      entity: "topic",
      entityId: id,
      label: text,
      oldValue: before.text,
      newValue: text,
      ...ctx,
    });
  }
}

export async function setTopicNotes(supabase, id, notes) {
  const { error } = await supabase
    .from("topics")
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTopics(supabase, ids) {
  if (!ids.length) return;
  const { error } = await supabase.from("topics").delete().in("id", ids);
  if (error) throw error;
}

/**
 * The explicit "let them know" action (SLACK_TODO.md item 0) — separate from
 * addTopic/updateTopic, neither of which should ever trigger a ping on their
 * own anymore (Melissa: "Editing or adding a topic is not the submit").
 * Idempotent: returns null (does nothing) if the topic is missing or was
 * already submitted, so a caller can safely skip its own notify() call in
 * that case instead of re-pinging.
 *
 * The "already submitted" check and the write are one atomic
 * update().eq("id", id).is("submitted_at", null) — not a separate SELECT
 * followed by an unconditional update. Two near-simultaneous calls (a
 * client retry, a double-click) can both pass a check-then-act read before
 * either write lands; Postgres can't do that to two UPDATEs racing on the
 * same row, so at most one of them actually sets submitted_at and gets a
 * row back to notify() over — the other gets null here, the same "no-op"
 * result as if the topic had already been submitted, and skips its ping.
 *
 * Ownership: this only takes a topic id, same as setTopicStatus/updateTopic
 * above — it relies on the caller to have verified the row belongs to the
 * right pair first (and, on the Slack side, that the caller is the topic's
 * creator — see topic_submit in route.js; this function deliberately
 * doesn't re-check created_by_role itself, see that handler's comment for
 * why). The website's browser-scoped client gets the pair check for free
 * from RLS; a Slack handler on the admin (service-role) client, which
 * bypasses RLS, MUST check pair_id itself before calling this — see the
 * governance note in CLAUDE.md and how the Slack interactivity route's
 * topic_edit/edit_topic handlers already do this for the same reason.
 *
 * created_by_role is intentionally NOT checked in here either — the
 * website's submitTopicRow (app/(dashboard)/one-on-one/page.js) relies on
 * the UI hiding the Submit button from the non-creator, same pre-existing
 * gap updateTopic has and is already accepted for. Centralizing the role
 * check here was considered (both callers already pass ctx.actorRole),
 * but left alone in this pass to keep this fix scoped to the race
 * condition it was asked to close, and to match topic_submit's Slack-side
 * check staying an external pre-fetch rather than moving in here.
 */
export async function submitTopic(supabase, id, ctx = {}) {
  const { data: submitted, error } = await supabase
    .from("topics")
    .update({ submitted_at: new Date().toISOString() })
    .eq("id", id)
    .is("submitted_at", null)
    .select("pair_id, text")
    .maybeSingle();
  if (error) throw error;
  if (!submitted) return null; // missing, or already submitted (by this call or a concurrent one)
  await logActivity(supabase, submitted.pair_id, {
    entity: "topic",
    entityId: id,
    label: submitted.text,
    field: "submitted",
    oldValue: null,
    newValue: "submitted",
    ...ctx,
  });
  return submitted;
}

// ------------------------------------------------------------- checkins ----

export async function getOpenCheckin(supabase, pairId, role) {
  const { data, error } = await supabase
    .from("checkins")
    .select("*")
    .eq("pair_id", pairId)
    .eq("role", role)
    .is("meeting_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveCheckin(supabase, pairId, role, asked) {
  const { data, error } = await supabase
    .from("checkins")
    .insert({ pair_id: pairId, role, asked })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// In-progress check-in wizard state — lets someone leave mid check-in and
// resume later (even after closing the browser) instead of losing answers.
// Separate from getOpenCheckin/saveCheckin, which are for a *finished*
// check-in that hasn't been filed into a meeting yet.

export async function getCheckinDraft(supabase, pairId, role) {
  const { data, error } = await supabase
    .from("checkins")
    .select("*")
    .eq("pair_id", pairId)
    .eq("role", role)
    .eq("in_progress", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveCheckinDraftProgress(supabase, pairId, role, id, draftState) {
  if (id) {
    const { error } = await supabase.from("checkins").update({ draft_state: draftState }).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase
    .from("checkins")
    .insert({ pair_id: pairId, role, in_progress: true, draft_state: draftState, asked: [] })
    .select()
    .single();
  if (error) throw error;
  return data.id;
}

export async function completeCheckinDraft(supabase, id, asked) {
  const { error } = await supabase
    .from("checkins")
    .update({ asked, in_progress: false, draft_state: null })
    .eq("id", id);
  if (error) throw error;
}

export async function listCheckinsAll(supabase, pairId) {
  const { data, error } = await supabase
    .from("checkins")
    .select("*")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function deleteCheckin(supabase, id) {
  const { error } = await supabase.from("checkins").delete().eq("id", id);
  if (error) throw error;
}

// ------------------------------------------------------------- meetings ----

export async function listMeetings(supabase, pairId) {
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function saveWrapUp(supabase, pairId, fields, discussedTopicIds, name) {
  const { data: meeting, error } = await supabase
    .from("meetings")
    .insert({
      pair_id: pairId,
      meeting_date: fields.date,
      meeting_time: fields.time || null,
      discussed: fields.discussed || "",
      agreed: fields.agreed || "",
      revisit: fields.revisit || "",
      start_line: fields.start || "",
      stop_line: fields.stop || "",
      keep_line: fields.keep || "",
      checkin90_date: fields.checkin90 || null,
      topics_snapshot: fields.topicsSnapshot || [],
      created_by_name: name,
    })
    .select()
    .single();
  if (error) throw error;

  const { error: fileErr } = await supabase
    .from("checkins")
    .update({ meeting_id: meeting.id })
    .eq("pair_id", pairId)
    .is("meeting_id", null);
  if (fileErr) throw fileErr;

  if (discussedTopicIds.length) {
    // pair_id filter is load-bearing, not defensive style: the Slack handler
    // calls this with the admin (service-role) client, which bypasses RLS
    // entirely, so this is the only ownership check standing between a
    // tampered discussed_topics payload and another pair's topics.
    const { error: delErr } = await supabase
      .from("topics")
      .delete()
      .eq("pair_id", pairId)
      .in("id", discussedTopicIds);
    if (delErr) throw delErr;
  }

  return meeting;
}

// ---------------------------------------------------------- achievements ---

export async function listAchievements(supabase, pairId) {
  const { data, error } = await supabase
    .from("achievements")
    .select("*")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function addAchievement(supabase, pairId, { title, category, impact, date, role, name }) {
  const { data, error } = await supabase
    .from("achievements")
    .insert({
      pair_id: pairId,
      title,
      category,
      impact: impact || "",
      achievement_date: date || null,
      created_by_role: role,
      created_by_name: name,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAchievement(supabase, id) {
  const { error } = await supabase.from("achievements").delete().eq("id", id);
  if (error) throw error;
}

// ------------------------------------------------------------- feedback ----

export async function listFeedback(supabase, pairId) {
  const { data, error } = await supabase
    .from("feedback_entries")
    .select("*")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function addFeedback(supabase, pairId, { giverRole, fromName, toName, type, text, example }) {
  const { data, error } = await supabase
    .from("feedback_entries")
    .insert({
      pair_id: pairId,
      giver_role: giverRole,
      from_name: fromName,
      to_name: toName,
      type,
      text,
      example: example || "",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function respondToFeedback(supabase, feedbackId, response) {
  const { error } = await supabase
    .from("feedback_entries")
    .update({ response, responded_at: new Date().toISOString() })
    .eq("id", feedbackId);
  if (error) throw error;
}

export async function listFeedbackRequests(supabase, pairId) {
  const { data, error } = await supabase
    .from("feedback_requests")
    .select("*")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function addFeedbackRequest(supabase, pairId, { fromRole, fromName, about, why }) {
  const { data, error } = await supabase
    .from("feedback_requests")
    .insert({ pair_id: pairId, from_role: fromRole, from_name: fromName, about: about || "", why: why || "" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ctx as in setTopicStatus. The update is conditioned on the row not
// already being at `status` (.neq("status", status)) instead of a plain
// .eq("id", id) — a duplicate/retried call (e.g. a feedback submission
// racing a separate "Close without answering" click, or Slack retrying a
// slow interaction) can't double-write the same transition and log it
// twice. before is read first only to get the *old* status for the
// activity log, not as a check-then-act guard — the update's own .neq is
// what makes this safe against a race, since a no-op update naturally
// affects zero rows.
export async function setFeedbackRequestStatus(supabase, id, status, ctx = {}) {
  const { data: before } = await supabase
    .from("feedback_requests")
    .select("pair_id, about, status, from_name")
    .eq("id", id)
    .maybeSingle();
  const { data: updated, error } = await supabase
    .from("feedback_requests")
    .update({ status })
    .eq("id", id)
    .neq("status", status)
    .select("pair_id")
    .maybeSingle();
  if (error) throw error;
  if (before && updated) {
    await logActivity(supabase, before.pair_id, {
      entity: "feedback_request",
      entityId: id,
      label: before.about || `Request from ${before.from_name || "your partner"}`,
      oldValue: before.status,
      newValue: status,
      ...ctx,
    });
  }
}

// ------------------------------------------------------------- concerns ----

// ---------------------------------------------------------- review drafts --

export async function getReviewDraft(supabase, pairId, role) {
  const { data, error } = await supabase
    .from("review_drafts")
    .select("*")
    .eq("pair_id", pairId)
    .eq("role", role)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveReviewDraft(supabase, pairId, role, draft) {
  const { error } = await supabase
    .from("review_drafts")
    .upsert({ pair_id: pairId, role, draft, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ------------------------------------------------------------ form drafts --

export async function getFormDraft(supabase, pairId, role, kind) {
  const { data, error } = await supabase
    .from("form_drafts")
    .select("*")
    .eq("pair_id", pairId)
    .eq("role", role)
    .eq("kind", kind)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveFormDraft(supabase, pairId, role, kind, draft) {
  const { error } = await supabase
    .from("form_drafts")
    .upsert({ pair_id: pairId, role, kind, draft, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function clearFormDraft(supabase, pairId, role, kind) {
  const { error } = await supabase
    .from("form_drafts")
    .delete()
    .eq("pair_id", pairId)
    .eq("role", role)
    .eq("kind", kind);
  if (error) throw error;
}

// ----------------------------------------------------------------- goals ---

export async function listGoals(supabase, pairId) {
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function saveGoal(supabase, pairId, goal, name) {
  const now = new Date().toISOString();
  const row = {
    pair_id: pairId,
    text: goal.text,
    why: goal.why || "",
    measure: goal.measure || "",
    owner_label: goal.owner,
    target_date: goal.target || null,
    status: goal.status,
    progress: goal.progress ?? 0,
    obstacles: goal.obstacles || "",
    support: goal.support || "",
    updated_at: now,
  };
  if (goal.id) {
    const { data, error } = await supabase.from("goals").update(row).eq("id", goal.id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from("goals")
    .insert({ ...row, created_by_name: name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteGoal(supabase, id) {
  const { error } = await supabase.from("goals").delete().eq("id", id);
  if (error) throw error;
}

// --------------------------------------------------------- development -----

export async function listDevelopmentPlans(supabase, pairId) {
  const { data, error } = await supabase
    .from("development_plans")
    .select("*")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function saveDevelopmentPlan(supabase, pairId, plan, role, name) {
  const now = new Date().toISOString();
  const row = {
    pair_id: pairId,
    area: plan.area,
    why: plan.why || "",
    type: plan.type,
    activity: plan.activity || "",
    support: plan.support || "",
    target_date: plan.target || null,
    status: plan.status,
    measure: plan.measure || "",
    updated_at: now,
  };
  if (plan.id) {
    const { data, error } = await supabase
      .from("development_plans")
      .update(row)
      .eq("id", plan.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from("development_plans")
    .insert({ ...row, created_by_role: role, created_by_name: name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDevelopmentPlan(supabase, id) {
  const { error } = await supabase.from("development_plans").delete().eq("id", id);
  if (error) throw error;
}

// -------------------------------------------------------------- career -----

export async function listCareerAnswers(supabase, pairId) {
  const { data, error } = await supabase
    .from("career_answers")
    .select("*")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** Mirrors the original save-my-answers diff: update if changed, insert if
    new & non-empty, delete if now blank. */
export async function saveCareerAnswers(supabase, pairId, role, name, prompts, existing) {
  const byQuestion = new Map(existing.filter((e) => e.role === role).map((e) => [e.question, e]));

  for (const { question, answer } of prompts) {
    const trimmed = (answer || "").trim();
    const current = byQuestion.get(question);
    if (!trimmed) {
      if (current) {
        const { error } = await supabase.from("career_answers").delete().eq("id", current.id);
        if (error) throw error;
      }
      continue;
    }
    if (current) {
      if (current.answer !== trimmed) {
        const { error } = await supabase.from("career_answers").update({ answer: trimmed }).eq("id", current.id);
        if (error) throw error;
      }
    } else {
      const { error } = await supabase
        .from("career_answers")
        .insert({ pair_id: pairId, role, question, answer: trimmed, created_by_name: name });
      if (error) throw error;
    }
  }
}

// ------------------------------------------------------------- actions -----

export async function listActions(supabase, pairId) {
  const { data, error } = await supabase
    .from("actions")
    .select("*")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function saveAction(supabase, pairId, action, name) {
  const now = new Date().toISOString();
  const row = {
    pair_id: pairId,
    text: action.text,
    owner_label: action.owner,
    due_date: action.due || null,
    status: action.status,
    related: action.related || "",
    notes: action.notes || "",
    updated_at: now,
  };
  if (action.id) {
    const { data, error } = await supabase.from("actions").update(row).eq("id", action.id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from("actions")
    .insert({ ...row, created_by_name: name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ctx as in setTopicStatus.
export async function toggleActionDone(supabase, id, done, ctx = {}) {
  const { data: before } = await supabase.from("actions").select("pair_id, text, status").eq("id", id).maybeSingle();
  const status = done ? "Done" : "Open";
  const { error } = await supabase
    .from("actions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  if (before) {
    await logActivity(supabase, before.pair_id, {
      entity: "action",
      entityId: id,
      label: before.text,
      oldValue: before.status,
      newValue: status,
      ...ctx,
    });
  }
}

export async function deleteAction(supabase, id) {
  const { error } = await supabase.from("actions").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------- final wrap up --------

/**
 * "Final wrap up for this conversation" (Slack). Closes out everything
 * currently in flight -- open topics, in-progress goals, open actions -- so
 * the Home tab doesn't sit there looking stuck, without touching the pairing
 * itself. Nothing is deleted: each row just moves to its own "closed"
 * status, same as ticking it off by hand, and stays visible in History.
 * Topics marked Parking Lot and goals marked Deferred are left alone --
 * those were deliberately set aside, not forgotten.
 */
// ctx as in setTopicStatus. Reads the open rows first (not just their count)
// so each one can get a real logActivity entry with its own label and old
// status, same as closing them one at a time would -- a bulk action
// shouldn't leave a thinner trail in History than doing it by hand.
export async function wrapUpConversation(supabase, pairId, ctx = {}) {
  const now = new Date().toISOString();
  // Topics' open/default status is lowercase "open" (see TOPIC_STATES,
  // lib/one-on-one-content.js) -- unlike actions, whose open status really is
  // "Open". Easy to get backwards; this comment is here so it doesn't happen
  // again.
  const [{ data: openTopics }, { data: openGoals }, { data: openActions }] = await Promise.all([
    supabase.from("topics").select("id, text, status").eq("pair_id", pairId).eq("status", "open"),
    supabase.from("goals").select("id, text, status").eq("pair_id", pairId).in("status", ["Not Started", "In Progress", "At Risk"]),
    supabase.from("actions").select("id, text, status").eq("pair_id", pairId).eq("status", "Open"),
  ]);
  const topicIds = (openTopics || []).map((t) => t.id);
  const goalIds = (openGoals || []).map((g) => g.id);
  const actionIds = (openActions || []).map((a) => a.id);

  const [topicsRes, goalsRes, actionsRes] = await Promise.all([
    topicIds.length ? supabase.from("topics").update({ status: "Discussed", updated_at: now }).in("id", topicIds) : { error: null },
    goalIds.length ? supabase.from("goals").update({ status: "Complete", updated_at: now }).in("id", goalIds) : { error: null },
    actionIds.length ? supabase.from("actions").update({ status: "Done", updated_at: now }).in("id", actionIds) : { error: null },
  ]);
  if (topicsRes.error) throw topicsRes.error;
  if (goalsRes.error) throw goalsRes.error;
  if (actionsRes.error) throw actionsRes.error;

  await Promise.all([
    ...(openTopics || []).map((t) => logActivity(supabase, pairId, { entity: "topic", entityId: t.id, label: t.text, oldValue: t.status, newValue: "Discussed", ...ctx })),
    ...(openGoals || []).map((g) => logActivity(supabase, pairId, { entity: "goal", entityId: g.id, label: g.text, oldValue: g.status, newValue: "Complete", ...ctx })),
    ...(openActions || []).map((a) => logActivity(supabase, pairId, { entity: "action", entityId: a.id, label: a.text, oldValue: a.status, newValue: "Done", ...ctx })),
  ]);

  return { topics: topicIds.length, goals: goalIds.length, actions: actionIds.length };
}

// ------------------------------------------------------- activity log ------
// Everything else here records only *creation*, so marking a topic discussed
// or ticking an action done used to leave no trace of who did it or when.
// Notifications aren't a substitute — they're capped, trimmed and deletable.
// The table is append-only at the database level (see 0004_activity_log.sql).

/**
 * Best-effort by design: a failure to record must never cost someone the
 * action they took. It warns rather than throwing, so a missing table (before
 * the migration is applied) degrades to "no history" instead of a broken app.
 */
async function logActivity(supabase, pairId, entry) {
  const { error } = await supabase.from("activity_log").insert({
    pair_id: pairId,
    entity: entry.entity,
    entity_id: entry.entityId || null,
    label: entry.label || "",
    field: entry.field || "status",
    old_value: entry.oldValue ?? null,
    new_value: entry.newValue,
    actor_name: entry.actorName || "Someone",
    actor_role: entry.actorRole || "",
    source: entry.source || "web",
  });
  if (error) console.warn("activity_log write failed:", error.message);
}

export async function listActivity(supabase, pairId) {
  const { data, error } = await supabase
    .from("activity_log")
    .select("*")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: false });
  // Reading history should never take the page down with it.
  if (error) {
    console.warn("activity_log read failed:", error.message);
    return [];
  }
  return data;
}

// -------------------------------------------------------- notifications ----

export async function listNotifications(supabase, pairId) {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: false })
    .limit(NOTIFICATION_CAP);
  if (error) throw error;
  return data;
}

/**
 * Collapses a run of near-identical notifications into one entry, for display
 * only. The bell and the dashboard both show just the newest eight, so adding
 * three goals in one sitting used to bury everything older. Rows group when
 * they sit next to each other, come from the same person, and share the text
 * before the colon ("Alex added a goal"); the part after it becomes a detail
 * line, so nothing is hidden. Rows themselves are never touched.
 */
export function groupNotifications(notifications) {
  const groups = [];
  for (const n of notifications) {
    const at = n.text ? n.text.indexOf(":") : -1;
    const label = at === -1 ? n.text || "" : n.text.slice(0, at);
    const detail = at === -1 ? "" : n.text.slice(at + 1).trim();
    const open = groups[groups.length - 1];
    if (open && open.label === label && open.createdByRole === n.created_by_role) {
      open.items.push(n);
      if (detail) open.details.push(detail);
    } else {
      groups.push({
        key: n.id,
        label,
        text: n.text,
        view: n.view,
        createdByRole: n.created_by_role,
        createdAt: n.created_at,
        items: [n],
        details: detail ? [detail] : [],
      });
    }
  }
  // A group is unread until every notification in it has been read, so a burst
  // can't go quiet while part of it is still new.
  return groups.map((g) => ({ ...g, count: g.items.length, unread: g.items.some((i) => !i.read) }));
}

// entityId: the specific record this notification is about (e.g. a
// feedback_requests id for kind "request"), so a Slack DM built from it can
// act on that exact record — see SLACK_TODO.md item 0e and
// supabase/migrations/0008_notification_entity_id.sql. Optional; most kinds
// don't need it and it defaults to null.
export async function notify(supabase, pairId, text, role, toRole, view, kind, entityId) {
  const { error } = await supabase
    .from("notifications")
    .insert({ pair_id: pairId, text, created_by_role: role, to_role: toRole, view: view || null, kind: kind || null, entity_id: entityId || null });
  if (error) throw error;

  const { data: overflow } = await supabase
    .from("notifications")
    .select("id")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: false })
    .range(NOTIFICATION_CAP, NOTIFICATION_CAP + 50);
  if (overflow && overflow.length) {
    await supabase.from("notifications").delete().in("id", overflow.map((n) => n.id));
  }
}

export async function markAllNotificationsRead(supabase, pairId, role) {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("pair_id", pairId)
    .or(`to_role.eq.${role},to_role.eq.both`);
  if (error) throw error;
}

// ------------------------------------------------------ custom suggestions -

export async function listCustomSuggestions(supabase, pairId) {
  const { data, error } = await supabase
    .from("custom_suggestions")
    .select("*")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function addCustomSuggestion(supabase, pairId, role, text, category) {
  const { data, error } = await supabase
    .from("custom_suggestions")
    .insert({ pair_id: pairId, role, text, category })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// -------------------------------------------------------------- documents --

export async function listDocuments(supabase, pairId) {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

const DOC_SIZE_LIMIT = 15 * 1024 * 1024; // Storage, not localStorage — the original 1.5MB cap was a
// base64-in-JSON workaround; a real object store can afford more headroom.

export async function uploadDocument(supabase, pairId, file, byName) {
  if (file.size > DOC_SIZE_LIMIT) {
    throw new Error("File is larger than 15MB.");
  }
  const path = `${pairId}/${crypto.randomUUID()}-${file.name}`;
  const { error: uploadErr } = await supabase.storage.from("documents").upload(path, file);
  if (uploadErr) throw uploadErr;

  const { data, error } = await supabase
    .from("documents")
    .insert({
      pair_id: pairId,
      name: file.name,
      storage_path: path,
      size: file.size,
      mime_type: file.type,
      created_by_name: byName,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getDocumentUrl(supabase, doc) {
  if (doc.url) return doc.url;
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteDocument(supabase, doc) {
  if (doc.storage_path) {
    await supabase.storage.from("documents").remove([doc.storage_path]);
  }
  const { error } = await supabase.from("documents").delete().eq("id", doc.id);
  if (error) throw error;
}

// ------------------------------------------------------------- handbook ----

// Company-wide, not pair-scoped -- every employee sees the same handbook
// regardless of who their manager is. Writes are RLS-gated to HR (see
// migration 0013_global_handbook.sql); this function doesn't need to know
// who's calling, the database enforces it.
export async function listHandbookLinks(supabase) {
  const { data, error } = await supabase
    .from("handbook_links")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function addHandbookLink(supabase, title, url) {
  const { data, error } = await supabase
    .from("handbook_links")
    .insert({ title, url })
    .select()
    .single();
  if (error) throw error;
  return data;
}

const HANDBOOK_SIZE_LIMIT = 15 * 1024 * 1024;

export async function uploadHandbookFile(supabase, file) {
  if (file.size > HANDBOOK_SIZE_LIMIT) {
    throw new Error("File is larger than 15MB. Share a link instead.");
  }
  const path = `${crypto.randomUUID()}-${file.name}`;
  const { error: uploadErr } = await supabase.storage.from("handbook").upload(path, file);
  if (uploadErr) throw uploadErr;

  const { data, error } = await supabase
    .from("handbook_links")
    .insert({ title: file.name, storage_path: path, size: file.size, mime_type: file.type })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getHandbookFileUrl(supabase, link) {
  if (link.url) return link.url;
  const { data, error } = await supabase.storage.from("handbook").createSignedUrl(link.storage_path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteHandbookLink(supabase, link) {
  if (link.storage_path) {
    await supabase.storage.from("handbook").remove([link.storage_path]);
  }
  const { error } = await supabase.from("handbook_links").delete().eq("id", link.id);
  if (error) throw error;
}

// Read-only view of the roster as it actually landed in `pairs` -- grouped
// by manager so HR can see who reports to whom without re-opening the
// spreadsheet. Names prefer a real profile's full_name (once that person
// has signed in), falling back to employee_label or the bare email.
export async function getOrgChart(admin) {
  const { data: pairs, error } = await admin
    .from("pairs")
    .select("id, employee_email, manager_email, employee_label")
    .is("closed_at", null);
  if (error) throw error;

  const emails = [...new Set(pairs.flatMap((p) => [p.employee_email, p.manager_email]))];
  const { data: profiles, error: profErr } = await admin.from("profiles").select("email, full_name").in("email", emails);
  if (profErr) throw profErr;
  const nameFor = new Map(profiles.map((p) => [p.email, p.full_name]));

  const displayName = (email, label) => nameFor.get(email) || label || email;

  const byManager = new Map();
  for (const p of pairs) {
    const managerName = displayName(p.manager_email, null);
    if (!byManager.has(p.manager_email)) byManager.set(p.manager_email, { manager: managerName, managerEmail: p.manager_email, reports: [] });
    byManager.get(p.manager_email).reports.push({ id: p.id, name: displayName(p.employee_email, p.employee_label), email: p.employee_email });
  }
  return [...byManager.values()].sort((a, b) => a.manager.localeCompare(b.manager));
}

// ------------------------------------------------------------- messages ----

export async function listMessages(supabase, pairId) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function addMessage(supabase, pairId, kind, text, role, byName) {
  const { data, error } = await supabase
    .from("messages")
    .insert({ pair_id: pairId, kind, text, role, created_by_name: byName })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// --------------------------------------------------------------- history ---
// Derived, not stored — same as historyEntries() in the original app.

const CHANGE_TITLE = {
  topic: (v) => `Topic marked ${v}`,
  action: (v) => `Action marked ${v}`,
  feedback_request: (v) => `Feedback request ${v}`,
};

// `activity` defaults to empty so callers that don't pass it still work.
export function buildHistory({ meetings, checkins, achievements, feedback, goals, development, career, actions, activity = [] }) {
  const entries = [];
  for (const m of meetings) {
    entries.push({
      cat: "1:1",
      at: m.created_at,
      title: `1:1 on ${m.meeting_date}`,
      body: m.discussed || m.agreed || "",
      who: m.created_by_name,
    });
  }
  for (const c of checkins) {
    entries.push({ cat: "1:1", at: c.created_at, title: `${c.role === "manager" ? "Manager" : "Employee"} check-in`, body: "", who: c.role });
  }
  for (const a of achievements) {
    entries.push({ cat: "Performance", at: a.created_at, title: a.title, body: a.impact, who: a.created_by_name });
  }
  for (const f of feedback) {
    entries.push({ cat: "Feedback", at: f.created_at, title: f.type, body: f.text, who: f.from_name });
  }
  for (const g of goals) {
    entries.push({ cat: "Goals", at: g.created_at, title: g.text, body: g.why, who: g.created_by_name });
  }
  for (const d of development) {
    entries.push({ cat: "Development", at: d.created_at, title: d.area, body: d.why, who: d.created_by_name });
  }
  for (const c of career) {
    entries.push({ cat: "Career", at: c.created_at, title: c.question, body: c.answer, who: c.created_by_name });
  }
  for (const a of actions) {
    entries.push({ cat: "Actions", at: a.created_at, title: a.text, body: a.notes, who: a.created_by_name });
  }
  // Every entry above is something being *created*. These are things being
  // changed, which nothing recorded before — see the activity log section.
  for (const e of activity) {
    entries.push({
      cat: "Changes",
      at: e.created_at,
      title: CHANGE_TITLE[e.entity] ? CHANGE_TITLE[e.entity](e.new_value) : `Changed to ${e.new_value}`,
      body: e.label,
      who: e.source === "slack" ? `${e.actor_name} (from Slack)` : e.actor_name,
    });
  }
  entries.sort((a, b) => new Date(b.at) - new Date(a.at));
  return entries;
}

// ---------------------------------------------------- one-on-one tab: net-new
// Added for the My 1:1 tab (components/one-on-one/, app/(dashboard)/one-on-one).
// The prototype lets you remove a saved custom suggestion; no delete existed
// for custom_suggestions yet.

export async function deleteCustomSuggestion(supabase, id) {
  const { error } = await supabase.from("custom_suggestions").delete().eq("id", id);
  if (error) throw error;
}
