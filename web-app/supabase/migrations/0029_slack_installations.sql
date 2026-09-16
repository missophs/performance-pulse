-- SLACK_TODO.md item 0h-2: real Slack OAuth install flow, replacing the
-- single hardcoded SLACK_BOT_TOKEN env var. This table holds the token
-- Slack hands back after someone clicks "Add to Slack" and approves it
-- (app/api/slack/oauth/callback/route.js), instead of a token being pasted
-- into an env var by hand and requiring a redeploy every time (see
-- SLACK_TODO.md's "files:read... reinstall" note -- that manual dance is
-- exactly what this replaces).
--
-- One row per installed workspace. Today this deployment only ever expects
-- one live row (this codebase has no company/tenant concept anywhere else
-- in schema.sql -- it's a single-tenant app; a second company buying this
-- means a second, separate deployment of it, not a second row sharing this
-- one's database). lib/slack-api.js reads the most recent row and falls
-- back to the env var if this table is empty, so shipping this migration
-- changes nothing for the workspace already in use today until it's
-- reinstalled through the new flow.
--
-- No RLS policies (deny-all by default once enabled) -- only ever touched
-- by the service-role admin client from the OAuth callback and slackApi's
-- token lookup, same as slack_pair_selections and slack_view_submissions.

create table if not exists slack_installations (
  team_id text primary key,
  team_name text,
  access_token text not null,
  bot_user_id text,
  installed_by_slack_user_id text,
  installed_at timestamptz not null default now()
);

alter table slack_installations enable row level security;
