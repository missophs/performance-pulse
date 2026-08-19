// Server-only. Turns a `notifications` row into a real Slack DM, using the
// same Block Kit payloads previewed on the Slack tab (lib/block-kit.js) —
// this is the thing that actually calls Slack instead of asking you to paste
// JSON into Block Kit Builder. Never import this from a "use client" file:
// it needs SLACK_BOT_TOKEN, which must stay server-side.

import { BK_KINDS, buildBlockKit } from "@/lib/block-kit";
import { fmtDate } from "@/lib/format";

const SLACK_API = "https://slack.com/api";

async function slackApi(method, body) {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Slack ${method} failed: ${json.error}`);
  return json;
}

async function dmByEmail(email, payload) {
  const lookup = await slackApi("users.lookupByEmail", { email }).catch((e) => {
    throw new Error(`No Slack account for ${email}: ${e.message}`);
  });
  const opened = await slackApi("conversations.open", { users: lookup.user.id });
  await slackApi("chat.postMessage", { channel: opened.channel.id, ...payload });
}

/**
 * notification: a row from the `notifications` table (as delivered by the
 * Supabase webhook payload's `record` field).
 * pair: the matching row from `pairs` (employee_email, manager_email, next_1on1_date...).
 * counts: { openTopicsCount, mineActionsCount, devPlansCount } for that pair, right now.
 * Returns { sent: string[] } (recipient emails actually messaged) or { skipped: reason }.
 */
export async function sendSlackPing(notification, pair, counts) {
  const kind = notification.kind;
  if (!kind || !BK_KINDS.some((k) => k.id === kind)) {
    return { skipped: `no matching ping for kind "${kind}"` };
  }
  if (!process.env.SLACK_BOT_TOKEN) {
    return { skipped: "SLACK_BOT_TOKEN not configured" };
  }

  const toEmployee = notification.to_role === "employee" || notification.to_role === "both";
  const toManager = notification.to_role === "manager" || notification.to_role === "both";
  // The ping is always about what the OTHER side of the pair just did, so
  // the employee's ping names the manager and vice versa.
  const managerName = pair.manager_name || pair.manager_email;
  const employeeName = pair.employee_name || pair.employee_email;
  const recipients = [
    toEmployee && { email: pair.employee_email, isMgr: false, partnerName: managerName },
    toManager && { email: pair.manager_email, isMgr: true, partnerName: employeeName },
  ].filter(Boolean);

  const sent = [];
  for (const r of recipients) {
    const ctx = {
      partnerName: r.partnerName,
      isMgr: r.isMgr,
      openTopicsCount: counts.openTopicsCount,
      mineActionsCount: counts.mineActionsCount,
      devPlansCount: counts.devPlansCount,
      next1on1When: pair.next_1on1_date ? fmtDate(pair.next_1on1_date) : "not scheduled yet",
    };
    const payload = buildBlockKit(kind, ctx);
    await dmByEmail(r.email, payload);
    sent.push(r.email);
  }
  return { sent };
}
