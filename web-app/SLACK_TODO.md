# Slack pings — what's left

Started 2026-08-19. Goal: real Slack DMs (not the Block Kit Builder
copy-paste preview) for the ping kinds already defined in `lib/block-kit.js`
(`BK_KINDS`). Deliberately pings-only, no interactive modals — the earlier
`slack-app/` (Bolt, Socket Mode) had too many errors and was never actually
installed to a workspace; a fresh Slack App called **"Performance Pulse"**
was created instead, in the **performance** workspace, for this purpose.

Already done:

- New Slack App created, scopes `chat:write`, `im:write`, `users:read`,
  `users:read.email`, installed to the workspace. Bot token saved to
  `web-app/.env.local` as `SLACK_BOT_TOKEN`.
- `notifications.kind` column added (`supabase/migrations/0002_notification_kind.sql`,
  and in `supabase/schema.sql` for fresh installs) — tags a notification with
  one of the `BK_KINDS` ids so the sender knows which ping to build. Six
  `notify()` call sites tagged: topic added, 1:1 wrapped up, action added
  (x2), feedback given, feedback requested, dev plan added.
- `lib/slack-send.js` — looks up the recipient by email (`users.lookupByEmail`),
  opens a DM, posts the matching Block Kit message.
- `app/api/slack/notify/route.js` — the webhook target. Authenticates the
  caller via an `x-webhook-secret` header (value already generated and saved
  to `.env.local` as `SLACK_NOTIFY_WEBHOOK_SECRET`), not a login session.
- `proxy.js` (this Next.js version's `middleware.js`) updated to exempt
  `/api/slack` from the login redirect — Supabase's webhook call has no
  browser session.
- Confirmed locally: hitting the route with no secret → 401. With the
  correct secret → reaches Supabase and fails only on the missing service
  role key (expected, see below).

Still needed, in order:

1. **`SUPABASE_SERVICE_ROLE_KEY`** — Supabase Dashboard → Project Settings →
   API → copy the `service_role` key → add to `web-app/.env.local`. Never
   expose this to the browser (no `NEXT_PUBLIC_` prefix) — it's what lets
   the webhook route read across pairs, bypassing RLS.
2. **Run the migration** — Supabase SQL Editor → new snippet → paste
   `supabase/migrations/0002_notification_kind.sql` → Run.
3. **Deploy** so the webhook has a public URL (Supabase can't reach
   `localhost`).
4. **Create the Supabase Database Webhook** — Dashboard → Database →
   Webhooks → Create → table `notifications`, event `Insert`, URL
   `https://<deployed-app>/api/slack/notify`, HTTP header
   `x-webhook-secret: <value from .env.local>`.
5. **Send one real test ping** end-to-end (e.g. add a topic in the app,
   confirm the DM arrives in Slack) and confirm it fails gracefully if the
   recipient's email isn't in that Slack workspace yet.
6. Clean up the leftover test check-in draft from earlier testing, if still
   present (My 1:1 → Resume → click/skip through, or delete the row).

Not built yet, deliberately out of scope for this pass: the `"upcoming"`
(1:1 reminder) ping — nothing currently triggers it; it would need a
scheduled job, not just a `notify()` call site.
