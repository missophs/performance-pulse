// Maps a Slack user (from an interactivity payload or event) back to their
// Performance Pulse pair. Server-only, uses the Supabase admin client
// (bypasses RLS), so every function here MUST derive pairId/role from the
// verified Slack identity itself — never trust a pairId sent in from Slack.

import { slackApi } from "@/lib/slack-api";

/**
 * slackUserId: the Slack "U..." id from a payload's user.id / event.user.
 * Returns null if this Slack account has no matching pair, so callers can
 * show a friendly "not linked yet" message instead of crashing.
 */
export async function resolveSlackUser(supabaseAdmin, slackUserId) {
  const info = await slackApi("users.info", { user: slackUserId });
  const email = info.user?.profile?.email;
  if (!email) return null;

  // PostgREST .or() parses this as a filter expression, not a literal — a
  // comma or parenthesis in the value would otherwise break the clause or
  // change what it matches. Quote the value and escape internal quotes per
  // https://postgrest.org/en/stable/references/api/tables_views.html#operators
  const safeEmail = `"${email.replace(/"/g, '\\"')}"`;
  // Slack's interactivity/event endpoints have a ~3s response budget, so this
  // is one query (an embedded select) instead of the pair lookup followed by
  // a separate profiles lookup — one less round trip on every request.
  const { data: pair, error } = await supabaseAdmin
    .from("pairs")
    .select("*, employee:profiles!employee_id(id, full_name), manager:profiles!manager_id(id, full_name)")
    .or(`employee_email.eq.${safeEmail},manager_email.eq.${safeEmail}`)
    .maybeSingle();
  if (error) throw error;
  if (!pair) return null;

  const isMgr = pair.manager_email === email;
  const role = isMgr ? "manager" : "employee";
  const otherRole = isMgr ? "employee" : "manager";

  const employeeName = pair.employee?.full_name || pair.employee_email;
  const managerName = pair.manager?.full_name || pair.manager_email;

  return {
    slackUserId,
    email,
    pairId: pair.id,
    pair,
    role,
    otherRole,
    isMgr,
    profileId: isMgr ? pair.manager_id : pair.employee_id,
    myName: isMgr ? managerName : employeeName,
    partnerName: isMgr ? employeeName : managerName,
  };
}
