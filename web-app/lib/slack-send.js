// Server-only. Turns a `notifications` row into a real Slack DM, using the
// same Block Kit payloads previewed on the Slack tab (lib/block-kit.js) —
// this is the thing that actually calls Slack instead of asking you to paste
// JSON into Block Kit Builder. Never import this from a "use client" file:
// it needs SLACK_BOT_TOKEN, which must stay server-side.

import { BK_KINDS, buildBlockKit, buildDigestBlockKit } from "@/lib/block-kit";
import { fmtDate } from "@/lib/format";
import { slackApi } from "@/lib/slack-api";

export async function dmByEmail(email, payload, companyId) {
  const lookup = await slackApi("users.lookupByEmail", { email }, { companyId }).catch((e) => {
    throw new Error(`No Slack account for ${email}: ${e.message}`);
  });
  const opened = await slackApi("conversations.open", { users: lookup.user.id }, { companyId });
  await slackApi("chat.postMessage", { channel: opened.channel.id, ...payload }, { companyId });
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
  if (!process.env.SLACK_BOT_TOKEN) {
    return { skipped: "SLACK_BOT_TOKEN not configured" };
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
  if (!process.env.SLACK_BOT_TOKEN) return { skipped: "SLACK_BOT_TOKEN not configured" };

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
