-- Slack-side "current pair" selection, item 2's Slack half — see
-- SLACK_TODO.md. Slack requests are stateless (no cookie the way the
-- website has), so which of an account's pairs the Home tab is currently
-- showing has to be persisted server-side, keyed by the Slack user id.
create table slack_pair_selections (
  slack_user_id text primary key,
  pair_id uuid not null references pairs (id) on delete cascade,
  updated_at timestamptz not null default now()
);

-- Only ever read/written by the admin (service-role) client from
-- lib/slack-user.js, which bypasses RLS regardless — but RLS still needs to
-- be ON here with zero policies, not off. Off would leave this table
-- reachable straight over Supabase's public REST API by anyone with the
-- project's public anon key (embedded in every page this app serves), no
-- app code involved. On with no policies means "service role only, nobody
-- else" — exactly what this table needs, since it's never meant to be
-- queried any other way.
alter table slack_pair_selections enable row level security;
