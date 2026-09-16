// Maps a Slack user (from an interactivity payload or event) back to their
// Performance Pulse pair. Server-only, uses the Supabase admin client
// (bypasses RLS), so every function here MUST derive pairId/role from the
// verified Slack identity itself — never trust a pairId sent in from Slack.

import { slackApi } from "@/lib/slack-api";

export function pairRoleFields(pair, email) {
  const isMgr = pair.manager_email?.toLowerCase() === email;
  const employeeName = pair.employee?.full_name || pair.employee_email;
  const managerName = pair.manager?.full_name || pair.manager_email;
  // employee_label is a manager-only, per-pairing display name (see
  // migration 0015) -- only used for what the MANAGER calls the employee,
  // never for the employee's own myName.
  return {
    isMgr,
    role: isMgr ? "manager" : "employee",
    otherRole: isMgr ? "employee" : "manager",
    myName: isMgr ? managerName : employeeName,
    partnerName: isMgr ? pair.employee_label || employeeName : managerName,
  };
}

/**
 * slackUserId: the Slack "U..." id from a payload's user.id / event.user.
 * Returns null if this Slack account has no matching pair, so callers can
 * show a friendly "not linked yet" message instead of crashing.
 *
 * An account can be on any number of pairs (a middle manager, or a manager
 * with 2+ reports — see SLACK_TODO.md item 2). The returned ctx always names
 * one "current" pair (from `slack_pair_selections`, falling back to the
 * oldest pair if nothing's saved yet) plus the full `pairs` list — every
 * screen must show which pairing is current, per the item 2 "label problem"
 * writeup, so `pairs` is what the Home tab switcher renders from.
 */
export async function resolveSlackUser(supabaseAdmin, slackUserId, teamId) {
  const info = await slackApi("users.info", { user: slackUserId });
  // employee_email/manager_email are citext, so the .eq() filter below already
  // matches case-insensitively. Still lowercased here because the JS-side
  // isMgr comparison below is a plain string ===, and pair.manager_email
  // comes back from the DB in whatever case was originally stored.
  const email = info.user?.profile?.email?.toLowerCase();
  if (!email) return null;

  // Multi-tenant scoping (migration 0030): with more than one company's
  // data in these tables, matching by email ALONE is no longer enough --
  // two different companies could each provision the same address (a
  // contractor, a generic role inbox). teamId comes straight from Slack's
  // own payload/event body, so it's a verified signal of which company is
  // actually asking. No teamId, or no installation row for it yet (a
  // request from before migration 0030/0029 was applied, or the env-var
  // fallback path with no installations table at all) -- fall through
  // unscoped rather than fail closed, matching this app's original
  // single-company behavior.
  let companyId = null;
  if (teamId) {
    const { data: install } = await supabaseAdmin.from("slack_installations").select("company_id").eq("team_id", teamId).maybeSingle();
    companyId = install?.company_id || null;
  }

  // PostgREST .or() parses this as a filter expression, not a literal — a
  // comma or parenthesis in the value would otherwise break the clause or
  // change what it matches. Quote the value and escape internal quotes per
  // https://postgrest.org/en/stable/references/api/tables_views.html#operators
  const safeEmail = `"${email.replace(/"/g, '\\"')}"`;
  let query = supabaseAdmin
    .from("pairs")
    .select("*, employee:profiles!employee_id(id, full_name), manager:profiles!manager_id(id, full_name)")
    .or(`employee_email.eq.${safeEmail},manager_email.eq.${safeEmail}`)
    .is("closed_at", null);
  if (companyId) query = query.eq("company_id", companyId);
  const { data: pairs, error } = await query.order("created_at", { ascending: true });
  if (error) throw error;
  if (!pairs?.length) return null;

  let pair = pairs[0];
  if (pairs.length > 1) {
    const { data: sel } = await supabaseAdmin.from("slack_pair_selections").select("pair_id").eq("slack_user_id", slackUserId).maybeSingle();
    const saved = sel && pairs.find((p) => p.id === sel.pair_id);
    if (saved) pair = saved;
  }

  const pairOptions = pairs.map((p) => ({ id: p.id, partnerName: pairRoleFields(p, email).partnerName }));

  return {
    slackUserId,
    email,
    pairId: pair.id,
    pair,
    pairs: pairOptions,
    profileId: pairRoleFields(pair, email).isMgr ? pair.manager_id : pair.employee_id,
    ...pairRoleFields(pair, email),
  };
}

// Re-resolves role/name context for one specific pair, given its id has
// already been verified to belong to this Slack user's own pairs list (see
// the wrap_up handler in app/api/slack/interactivity/route.js) -- used when
// a pinned private_metadata pair id no longer matches the caller's currently
// *active* pair (they switched via "switch_pair" after opening the modal),
// so the submission still applies to the right pair with the right role/name
// fields instead of whatever's active now. Returns null if the pair no
// longer exists (e.g. closed/deleted between open and submit).
export async function resolvePairContext(supabaseAdmin, email, pairId) {
  const { data: pair, error } = await supabaseAdmin
    .from("pairs")
    .select("*, employee:profiles!employee_id(id, full_name), manager:profiles!manager_id(id, full_name)")
    .eq("id", pairId)
    .maybeSingle();
  if (error) throw error;
  if (!pair) return null;
  return {
    pairId: pair.id,
    pair,
    profileId: pairRoleFields(pair, email).isMgr ? pair.manager_id : pair.employee_id,
    ...pairRoleFields(pair, email),
  };
}

// Called from the Home tab switcher (see "switch_pair" in
// app/api/slack/interactivity/route.js). `allowedPairIds` must be the
// `pairs` list resolveSlackUser just returned for this same Slack user —
// the switcher's selected_option.value is client-supplied like any other
// Slack action value, so it's checked against that list before being saved,
// same governance rule as every other id-from-Slack write (see CLAUDE.md).
export async function setSlackPairSelection(supabaseAdmin, slackUserId, pairId, allowedPairIds) {
  if (!allowedPairIds.includes(pairId)) throw new Error("pair not owned by this Slack user");
  const { error } = await supabaseAdmin
    .from("slack_pair_selections")
    .upsert({ slack_user_id: slackUserId, pair_id: pairId, updated_at: new Date().toISOString() });
  if (error) throw error;
}
