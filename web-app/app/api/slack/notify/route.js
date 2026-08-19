// Called by a Supabase Database Webhook on INSERT into `notifications`.
// Looks up the pair + live counts and sends the matching Slack DM via
// lib/slack-send.js. Never reachable from the browser with useful
// credentials — it authenticates the caller with a shared secret and talks
// to Supabase with the service-role key, both server-only env vars.
//
// Supabase webhook setup (Dashboard → Database → Webhooks → Create):
//   Table: notifications, Event: Insert
//   URL: https://<your-deployed-app>/api/slack/notify
//   HTTP Header: x-webhook-secret: <same value as SLACK_NOTIFY_WEBHOOK_SECRET>

import { createClient } from "@supabase/supabase-js";
import { sendSlackPing } from "@/lib/slack-send";

export async function POST(request) {
  const secret = request.headers.get("x-webhook-secret");
  if (!process.env.SLACK_NOTIFY_WEBHOOK_SECRET || secret !== process.env.SLACK_NOTIFY_WEBHOOK_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const notification = body.record;
  if (!notification) {
    return Response.json({ error: "missing record" }, { status: 400 });
  }

  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: pair, error: pairErr } = await supabaseAdmin
      .from("pairs")
      .select("employee_id, manager_id, employee_email, manager_email, next_1on1_date")
      .eq("id", notification.pair_id)
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
        .eq("pair_id", notification.pair_id)
        .not("status", "in", '("Discussed","Resolved","Parking Lot")'),
      supabaseAdmin
        .from("actions")
        .select("id", { count: "exact", head: true })
        .eq("pair_id", notification.pair_id)
        .neq("status", "Done"),
      supabaseAdmin.from("development_plans").select("id", { count: "exact", head: true }).eq("pair_id", notification.pair_id),
    ]);

    const result = await sendSlackPing(notification, pair, {
      openTopicsCount: openTopicsCount || 0,
      mineActionsCount: mineActionsCount || 0,
      devPlansCount: devPlansCount || 0,
    });
    return Response.json(result);
  } catch (err) {
    console.error("slack notify failed:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
