// Called by a Supabase Database Webhook on INSERT into `notifications`.
// Looks up the pair + live counts and sends the matching Slack DM via
// lib/slack-send.js, collapsing notifications that land close together into
// a single DM (see BATCH_WINDOW_MS). Never reachable from the browser with useful
// credentials — it authenticates the caller with a shared secret and talks
// to Supabase with the service-role key, both server-only env vars.
//
// Supabase webhook setup (Dashboard → Database → Webhooks → Create):
//   Table: notifications, Event: Insert
//   URL: https://<your-deployed-app>/api/slack/notify
//   HTTP Header: x-webhook-secret: <same value as SLACK_NOTIFY_WEBHOOK_SECRET>

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { sendSlackDigest, sendSlackPing } from "@/lib/slack-send";

// Same constant-time-compare reasoning as lib/slack-verify.js's Slack
// signature check -- a plain `!==` on a secret leaks how many leading bytes
// matched via response timing.
function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// Adding three goals in a row used to be three DMs. Notifications landing
// close together for the same person are now collapsed into one, decided
// without any extra state: every invocation walks the same rows and reaches
// the same answer about which one leads the burst. Only the DM is batched —
// the in-app notification row is always written, so nothing is ever lost.
const BATCH_WINDOW_MS = 5000;
// Wait a little past the window before reading, so rows landing right on the
// boundary are already visible.
const BATCH_GRACE_MS = 1500;
// How far back to look when reconstructing burst boundaries. Long enough to
// cover any realistic run of clicks; a burst chained unbroken for longer than
// this could group differently between invocations, at worst under-counting a
// digest line.
const BATCH_LOOKBACK_MS = 60000;
// Someone is waiting on a reply to these, so they always DM on their own
// rather than being folded into a count.
const NEVER_BATCH = new Set(["request"]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The rows this notification should be sent as, or null if a different row in
 * the same burst is the one that sends. Groups are built by walking rows
 * oldest-first: the first row opens a group covering BATCH_WINDOW_MS, and the
 * first row past that coverage opens the next one.
 */
async function burstFor(supabaseAdmin, notification) {
  const at = new Date(notification.created_at).getTime();
  const { data: rows, error } = await supabaseAdmin
    .from("notifications")
    .select("id, kind, to_role, created_at")
    .eq("pair_id", notification.pair_id)
    .eq("to_role", notification.to_role)
    .not("kind", "is", null)
    .gte("created_at", new Date(at - BATCH_LOOKBACK_MS).toISOString())
    .lte("created_at", new Date(at + BATCH_WINDOW_MS).toISOString())
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;

  const batchable = (rows || []).filter((r) => !NEVER_BATCH.has(r.kind));
  const groups = [];
  for (const r of batchable) {
    const t = new Date(r.created_at).getTime();
    const open = groups[groups.length - 1];
    if (!open || t > open.startedAt + BATCH_WINDOW_MS) groups.push({ startedAt: t, rows: [r] });
    else open.rows.push(r);
  }

  const mine = groups.find((g) => g.rows.some((r) => r.id === notification.id));
  if (!mine || mine.rows[0].id !== notification.id) return null;
  return mine.rows;
}

async function loadPairContext(supabaseAdmin, pairId) {
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

  // Most notifications are in-app only (no kind) — nothing to send, so don't
  // hold a function open for the batch window on their account. created_at is
  // what the burst grouping is built from, so without it, send as-is.
  if (!notification.kind) {
    return Response.json({ skipped: "no kind — in-app only" });
  }

  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (NEVER_BATCH.has(notification.kind) || !notification.created_at) {
    try {
      const { pair, counts } = await loadPairContext(supabaseAdmin, notification.pair_id);
      return Response.json(await sendSlackPing(notification, pair, counts));
    } catch (err) {
      console.error("slack notify failed:", err);
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  // Everything else waits out the batch window before deciding whether it's
  // the one that sends. after() keeps that off the webhook's response.
  after(async () => {
    try {
      await sleep(BATCH_WINDOW_MS + BATCH_GRACE_MS);
      const burst = await burstFor(supabaseAdmin, notification);
      if (!burst) return; // another row in this burst is sending for all of us
      const { pair, counts } = await loadPairContext(supabaseAdmin, notification.pair_id);
      await sendSlackDigest(burst, pair, counts);
    } catch (err) {
      console.error("slack notify failed:", err);
    }
  });

  return Response.json({ queued: true });
}
