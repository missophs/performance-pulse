-- Tracks which notifications have already gone out in a daily digest DM, so
-- the digest cron (app/api/slack/notify/digest/route.js) never re-sends the
-- same item twice. Melissa's explicit request (2026-09-18): "it should be
-- all together" / "one combined Slack message" instead of a separate DM per
-- event -- this is what most per-event real-time Slack DMs are replaced
-- with. The in-app notification row and its "read" bell state are untouched;
-- "request" kind (someone waiting on a reply) still sends immediately and
-- never touches this column, unchanged from before.

alter table notifications add column if not exists digested_at timestamptz;
