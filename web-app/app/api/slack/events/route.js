// Slack Events API endpoint. Only subscribed to app_home_opened — that's
// what lets the Home tab render live data instead of Slack's static
// "nothing configured" placeholder. Configure in the Slack app under Event
// Subscriptions, Request URL: https://<deployed-app>/api/slack/events

import { createClient } from "@supabase/supabase-js";
import { verifySlackSignature } from "@/lib/slack-verify";
import { resolveSlackUser } from "@/lib/slack-user";
import { slackApi } from "@/lib/slack-api";
import { homeView, notLinkedHomeView } from "@/lib/slack-views";
import { loadHomeData } from "@/lib/slack-home-data";

export async function POST(request) {
  const rawBody = await request.text();

  // Slack's one-time handshake when you first set the Request URL — must
  // echo the challenge back verbatim, before any signature check is useful
  // (the secret is already configured by this point, so still verify).
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (body.type === "url_verification") {
    return Response.json({ challenge: body.challenge });
  }

  if (!verifySlackSignature(rawBody, request.headers)) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  const event = body.event;
  if (event?.type === "app_home_opened" && event.tab === "home") {
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    try {
      const ctx = await resolveSlackUser(supabaseAdmin, event.user);
      const view = ctx ? homeView(ctx, await loadHomeData(supabaseAdmin, ctx.pairId)) : notLinkedHomeView();
      await slackApi("views.publish", { user_id: event.user, view });
    } catch (err) {
      console.error("slack home publish failed:", err);
    }
  } else if (event?.type === "app_uninstalled" || event?.type === "tokens_revoked") {
    // SLACK_TODO.md item 0h: at today's single-hardcoded-workspace scale
    // there's no per-workspace token stored to revoke, so this is just a
    // greppable log signal (same [SLACK_INTEGRATION_DOWN]-style marker as
    // lib/slack-api.js) instead of a silent no-op. Requires "App Uninstalled"
    // and "Tokens Revoked" to be checked under Event Subscriptions ->
    // Subscribe to bot events in the Slack app config — not on by default.
    console.error(`[SLACK_APP_UNINSTALLED] event=${event.type} team=${body.team_id || "unknown"}`);
  }

  return Response.json({ ok: true });
}
