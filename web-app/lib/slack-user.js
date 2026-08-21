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

  const { data: pair, error } = await supabaseAdmin
    .from("pairs")
    .select("*")
    .or(`employee_email.eq.${email},manager_email.eq.${email}`)
    .maybeSingle();
  if (error) throw error;
  if (!pair) return null;

  const isMgr = pair.manager_email === email;
  const role = isMgr ? "manager" : "employee";
  const otherRole = isMgr ? "employee" : "manager";

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name")
    .in("id", [pair.employee_id, pair.manager_id].filter(Boolean));
  const employeeName = profiles?.find((p) => p.id === pair.employee_id)?.full_name || pair.employee_email;
  const managerName = profiles?.find((p) => p.id === pair.manager_id)?.full_name || pair.manager_email;

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
