// Triggered once a day by Vercel Cron (see vercel.json) -- sends ONE Slack
// DM per pair+role covering every notification that landed since the last
// digest, replacing the separate per-event DMs that used to go out from
// app/api/slack/notify/route.js. Melissa's explicit request (2026-09-18):
// "one combined Slack message" instead of a separate DM per event ("why is
// everything separate... it should be all together").
//
// "request"-kind notifications (someone waiting on a reply to a feedback
// request) are never touched here -- those still send immediately from the
// insert webhook and never get a digested_at, on purpose.
//
// Auth: Vercel Cron automatically sends `Authorization: Bearer $CRON_SECRET`
// when a CRON_SECRET env var is set on the project -- add that env var in
// Vercel before this can run (see SLACK_TODO.md for the exact steps).

import { createClient } from "@supabase/supabase-js";
import { sendSlackDigest, loadPairContext } from "@/lib/slack-send";

export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: pending, error } = await supabaseAdmin
    .from("notifications")
    .select("id, pair_id, to_role, kind, entity_id, created_at")
    .is("digested_at", null)
    .not("kind", "is", null)
    .neq("kind", "request")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("digest: failed to load pending notifications:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!pending?.length) {
    return Response.json({ sent: 0, groups: 0 });
  }

  // Group by exactly what sendSlackDigest needs to send one DM for: the same
  // pair and the same recipient side of it.
  const groups = new Map();
  for (const n of pending) {
    const key = `${n.pair_id}:${n.to_role}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }

  let sentGroups = 0;
  const failures = [];
  for (const [key, rows] of groups) {
    const [pairId] = key.split(":");
    try {
      const { pair, counts } = await loadPairContext(supabaseAdmin, pairId);
      await sendSlackDigest(rows, pair, counts);
      const { error: markErr } = await supabaseAdmin
        .from("notifications")
        .update({ digested_at: new Date().toISOString() })
        .in(
          "id",
          rows.map((r) => r.id)
        );
      if (markErr) throw markErr;
      sentGroups++;
    } catch (err) {
      console.error(`digest: failed for ${key}:`, err);
      failures.push({ key, error: err.message });
    }
  }

  return Response.json({ sent: sentGroups, groups: groups.size, failures });
}
