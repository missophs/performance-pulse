-- SLACK_TODO.md item 0h-4: general view_submission idempotency. Only
-- topic_submit had its own duplicate-safe guard (an atomic "submitted_at is
-- null" update in lib/data.js); every other Slack modal submit (goals,
-- actions, dev plans, wrap-up, feedback, ...) had no protection against a
-- retried or double-clicked submission creating two rows.
--
-- Slack's view.id is stable for one open modal instance and unique per
-- submission attempt sequence, so "insert this view.id, if it already
-- exists this is a duplicate" is a correct, generic dedup key -- same
-- atomic-insert-as-lock shape as submitTopic's update-with-is-null guard,
-- just centralized once in the interactivity route instead of per-handler.
--
-- No RLS needed: only ever touched by the admin (service-role) Slack route.

create table if not exists slack_view_submissions (
  view_id text primary key,
  created_at timestamptz not null default now()
);

-- Rows are only needed long enough to catch a near-immediate retry; keeps
-- the table from growing unbounded without a scheduled job.
create index if not exists slack_view_submissions_created_at_idx
  on slack_view_submissions (created_at);
