-- Lets a `notifications` row record which specific record it's about, so a
-- Slack DM built from it (lib/slack-send.js, lib/block-kit.js) can act on
-- that exact row instead of only aggregate counts. First real use:
-- feedback_requests — the digest DM's "Answer it" button (kind "request")
-- had no way to know which request it was answering (SLACK_TODO.md item
-- 0e) until this column existed for notify() to fill in at insert time.
-- The existing Slack-notify trigger (0005_slack_notify_trigger.sql) forwards
-- the whole row via to_jsonb(NEW), so this needs no trigger change to reach
-- the webhook.

alter table notifications add column if not exists entity_id uuid;
