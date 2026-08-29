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

// Returns `{ ambiguous: true }` if the account is on more than one pair (a
// middle manager, or a manager with 2+ reports) — the app assumes one pair
// per person throughout, so rather than guess which one this request meant,
// callers should show a "not supported yet" notice. Check `pair?.ambiguous`
// before reading pair fields. Mirrors resolveSlackUser's same guard.
export async function getMyPair(supabase, userId) {
  const { data, error } = await supabase
    .from("pairs")
    .select("*")
    .or(`employee_id.eq.${userId},manager_id.eq.${userId}`)
    .limit(2);
  if (error) throw error;
  if (!data?.length) return null;
  if (data.length > 1) return { ambiguous: true };
  return data[0];
}

export async function createPair(supabase, myRole, partnerEmail) {
  const { data, error } = await supabase.rpc("create_pair", {
    my_role: myRole,
    partner_email: partnerEmail,
  });
  if (error) throw error;
  return data;
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

export async function addTopic(supabase, pairId, { text, why, category, role, name }) {
  const { data, error } = await supabase
    .from("topics")
    .insert({
      pair_id: pairId,
      text,
      why: why || "",
      category,
      created_by_role: role,
      created_by_name: name,
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
    const { error: delErr } = await supabase.from("topics").delete().in("id", discussedTopicIds);
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

// ctx as in setTopicStatus.
export async function setFeedbackRequestStatus(supabase, id, status, ctx = {}) {
  const { data: before } = await supabase
    .from("feedback_requests")
    .select("pair_id, about, status, from_name")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("feedback_requests").update({ status }).eq("id", id);
  if (error) throw error;
  if (before) {
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

export async function listConcerns(supabase, pairId) {
  const { data, error } = await supabase
    .from("concerns")
    .select("*")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function addConcern(supabase, pairId, fields, name) {
  const { data, error } = await supabase
    .from("concerns")
    .insert({
      pair_id: pairId,
      what: fields.what,
      concern_date: fields.when || null,
      expectation: fields.expectation || "",
      communicated: fields.communicated || "",
      previously: fields.previously || "",
      support: fields.support || "",
      outcome: fields.outcome || "",
      created_by_name: name,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

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

export async function notify(supabase, pairId, text, role, toRole, view, kind) {
  const { error } = await supabase
    .from("notifications")
    .insert({ pair_id: pairId, text, created_by_role: role, to_role: toRole, view: view || null, kind: kind || null });
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

export async function addDocumentLink(supabase, pairId, name, url, byName) {
  const { data, error } = await supabase
    .from("documents")
    .insert({ pair_id: pairId, name, url, created_by_name: byName })
    .select()
    .single();
  if (error) throw error;
  return data;
}

const DOC_SIZE_LIMIT = 15 * 1024 * 1024; // Storage, not localStorage — the original 1.5MB cap was a
// base64-in-JSON workaround; a real object store can afford more headroom.

export async function uploadDocument(supabase, pairId, file, byName) {
  if (file.size > DOC_SIZE_LIMIT) {
    throw new Error("File is larger than 15MB. Share a link instead.");
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

export async function listHandbookLinks(supabase, pairId) {
  const { data, error } = await supabase
    .from("handbook_links")
    .select("*")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function addHandbookLink(supabase, pairId, title, url) {
  const { data, error } = await supabase
    .from("handbook_links")
    .insert({ pair_id: pairId, title, url })
    .select()
    .single();
  if (error) throw error;
  return data;
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
export function buildHistory({ meetings, checkins, achievements, feedback, concerns, goals, development, career, actions, activity = [] }) {
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
  for (const c of concerns) {
    entries.push({ cat: "Performance", at: c.created_at, title: "Concern documented", body: c.what, who: c.created_by_name });
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
