// Called by a Supabase Database Webhook on INSERT into `notifications`.
// "request" kind (someone waiting on a reply to a feedback request) sends
// immediately, unchanged. Everything else no longer sends here at all --
// Melissa's explicit request (2026-09-18): "one combined Slack message"
// instead of a separate DM per event. Those rows sit with `digested_at`
// null until the once-a-day cron (app/api/slack/notify/digest/route.js)
// picks them all up and sends ONE DM per pair+role. This replaces the old
// same-request 5-second batch window entirely -- that only combined clicks
// landing within 5 seconds of each other, which is also what made this route
// sleep for most of a Vercel Hobby-plan function's 10s budget on every
// batchable insert; removing it removes that risk too.
//
// Never reachable from the browser with useful credentials — it
// authenticates the caller with a shared secret and talks to Supabase with
// the service-role key, both server-only env vars.
//
// Supabase webhook setup (Dashboard → Database → Webhooks → Create):
//   Table: notifications, Event: Insert
//   URL: https://<your-deployed-app>/api/slack/notify
//   HTTP Header: x-webhook-secret: <same value as SLACK_NOTIFY_WEBHOOK_SECRET>

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { sendSlackPing, loadPairContext } from "@/lib/slack-send";

// Same constant-time-compare reasoning as lib/slack-verify.js's Slack
// signature check -- a plain `!==` on a secret leaks how many leading bytes
// matched via response timing.
function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// Someone is waiting on a reply to these, so they always DM immediately
// rather than waiting for the next daily digest.
const NEVER_BATCH = new Set(["request"]);

export async function POST(request) {
  const secret = request.headers.get("x-webhook-secret");
  const expected = process.env.SLACK_NOTIFY_WEBHOOK_SECRET;
  if (!expected || !secret || !timingSafeEqualStr(secret, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const notification = body.record;
  if (!notification) {
    return Response.json({ error: "missing record" }, { status: 400 });
  }

  // Most notifications are in-app only (no kind) — nothing to send, ever.
  if (!notification.kind) {
    return Response.json({ skipped: "no kind — in-app only" });
  }

  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (NEVER_BATCH.has(notification.kind)) {
    try {
      const { pair, counts } = await loadPairContext(supabaseAdmin, notification.pair_id);
      return Response.json(await sendSlackPing(notification, pair, counts));
    } catch (err) {
      console.error("slack notify failed:", err);
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  // Everything else waits for the next daily digest (see the file header
  // comment) -- nothing to do here, the row is already inserted with
  // digested_at still null.
  return Response.json({ queued: "digest" });
}
