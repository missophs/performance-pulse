-- Adds Slack-ping classification to notifications. Run this once against a
-- database that already has the original schema.sql applied (already-fresh
-- installs get this column from schema.sql directly).

alter table notifications add column if not exists kind text;
