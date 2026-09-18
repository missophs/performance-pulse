// Server-only. Turns a `notifications` row into a real Slack DM, using the
// same Block Kit payloads previewed on the Slack tab (lib/block-kit.js) —
// this is the thing that actually calls Slack instead of asking you to paste
// JSON into Block Kit Builder. Never import this from a "use client" file:
// it needs the Supabase service-role key (via lib/slack-api.js), which must
// stay server-side.

import { BK_KINDS, buildBlockKit, buildDigestBlockKit } from "@/lib/block-kit";
import { fmtDate } from "@/lib/format";
import { slackApi } from "@/lib/slack-api";

// Shared by app/api/slack/notify/route.js (the insert webhook, "request" kind
// only) and app/api/slack/notify/digest/route.js (the once-daily cron for
// everything else) -- both need the same pair row + live counts to build a
// ping/digest payload.
export async function loadPairContext(supabaseAdmin, pairId) {
  const { data: pair, error: pairErr } = await supabaseAdmin
    .from("pairs")
    .select("employee_id, manager_id, employee_email, manager_email, employee_label, next_1on1_date, company_id")
    .eq("id", pairId)
    .single();
  if (pairErr) throw pairErr;

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name")
    .in("id", [pair.employee_id, pair.manager_id].filter(Boolean));
  pair.employee_name = profiles?.find((p) => p.id === pair.employee_id)?.full_name || "";
  pair.manager_name = profiles?.find((p) => p.id === pair.manager_id)?.full_name || "";

  const [{ count: openTopicsCount }, { count: mineActionsCount }, { count: devPlansCount }] = await Promise.all([
    supabaseAdmin
      .from("topics")
      .select("id", { count: "exact", head: true })
      .eq("pair_id", pairId)
      .not("status", "in", '("Discussed","Resolved","Parking Lot")'),
    supabaseAdmin.from("actions").select("id", { count: "exact", head: true }).eq("pair_id", pairId).neq("status", "Done"),
    supabaseAdmin.from("development_plans").select("id", { count: "exact", head: true }).eq("pair_id", pairId),
  ]);

  return {
    pair,
    counts: {
      openTopicsCount: openTopicsCount || 0,
      mineActionsCount: mineActionsCount || 0,
      devPlansCount: devPlansCount || 0,
    },
  };
}

export async function dmByEmail(email, payload, companyId) {
  const lookup = await slackApi("users.lookupByEmail", { email }, { companyId }).catch((e) => {
    throw new Error(`No Slack account for ${email}: ${e.message}`);
  });
  const opened = await slackApi("conversations.open", { users: lookup.user.id }, { companyId });
  await slackApi("chat.postMessage", { channel: opened.channel.id, ...payload }, { companyId });
}

// Real Slack group DM between the bot, the caller, and their pair partner --
// not a Performance Pulse chat UI. `conversations.open` is idempotent, so
// clicking "Message X" again just reopens the same conversation instead of
// creating a second one. Performance Pulse's own involvement ends at the
// intro message the caller sends once (see "message_partner",
// app/api/slack/interactivity/route.js) -- nothing here ever calls
// conversations.history, on purpose (Melissa's call, 2026-09-17: private,
// no HR visibility; escalation is a person sharing their own Slack thread).
export async function openPairConversation(otherEmail, myUserId, companyId) {
  const lookup = await slackApi("users.lookupByEmail", { email: otherEmail }, { companyId }).catch((e) => {
    throw new Error(`No Slack account for ${otherEmail}: ${e.message}`);
  });
  const opened = await slackApi("conversations.open", { users: `${myUserId},${lookup.user.id}` }, { companyId });
  return opened.channel.id;
}

/**
 * notification: a row from the `notifications` table (as delivered by the
 * Supabase webhook payload's `record` field).
 * pair: the matching row from `pairs` (employee_email, manager_email, next_1on1_date...).
 * counts: { openTopicsCount, mineActionsCount, devPlansCount } for that pair, right now.
 * Returns { sent: string[] } (recipient emails actually messaged) or { skipped: reason }.
 */
function recipientsFor(toRole, pair) {
  const toEmployee = toRole === "employee" || toRole === "both";
  const toManager = toRole === "manager" || toRole === "both";
  // The ping is always about what the OTHER side of the pair just did, so
  // the employee's ping names the manager and vice versa.
  const managerName = pair.manager_name || pair.manager_email;
  const employeeName = pair.employee_name || pair.employee_email;
  // employee_label is a manager-only, per-pairing display name (see
  // migration 0015) -- only affects the manager's ping, never the
  // employee's own.
  return [
    toEmployee && { email: pair.employee_email, isMgr: false, partnerName: managerName },
    toManager && { email: pair.manager_email, isMgr: true, partnerName: pair.employee_label || employeeName },
  ].filter(Boolean);
}

function ctxFor(recipient, pair, counts, notification) {
  return {
    partnerName: recipient.partnerName,
    isMgr: recipient.isMgr,
    openTopicsCount: counts.openTopicsCount,
    mineActionsCount: counts.mineActionsCount,
    devPlansCount: counts.devPlansCount,
    next1on1When: pair.next_1on1_date ? fmtDate(pair.next_1on1_date) : "not scheduled yet",
    // Only meaningful for kind "request" (see buildBlockKit) — the specific
    // feedback_requests row this ping is about. "request" kind is always
    // sent one-at-a-time (see NEVER_BATCH in app/api/slack/notify/route.js),
    // so there's always exactly one notification row to read it from here.
    requestId: notification?.entity_id || null,
  };
}

export async function sendSlackPing(notification, pair, counts) {
  const kind = notification.kind;
  if (!kind || !BK_KINDS.some((k) => k.id === kind)) {
    return { skipped: `no matching ping for kind "${kind}"` };
  }
  const sent = [];
  for (const r of recipientsFor(notification.to_role, pair)) {
    await dmByEmail(r.email, buildBlockKit(kind, ctxFor(r, pair, counts, notification)), pair.company_id);
    sent.push(r.email);
  }
  return { sent };
}

/**
 * One DM for several notifications that landed together (see the batching in
 * app/api/slack/notify/route.js). Falls back to the normal single-kind ping
 * when the burst turns out to hold only one thing, so an isolated action still
 * gets its specific message.
 * notifications: rows sharing a pair_id and to_role.
 */
export async function sendSlackDigest(notifications, pair, counts) {
  const known = notifications.filter((n) => n.kind && BK_KINDS.some((k) => k.id === n.kind));
  if (!known.length) return { skipped: "no sendable kinds in batch" };
  if (known.length === 1) return sendSlackPing(known[0], pair, counts);

  const byKind = new Map();
  for (const n of known) byKind.set(n.kind, (byKind.get(n.kind) || 0) + 1);
  const kindCounts = [...byKind.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count);

  const sent = [];
  for (const r of recipientsFor(known[0].to_role, pair)) {
    await dmByEmail(r.email, buildDigestBlockKit(kindCounts, ctxFor(r, pair, counts)), pair.company_id);
    sent.push(r.email);
  }
  return { sent, batched: known.length };
}
