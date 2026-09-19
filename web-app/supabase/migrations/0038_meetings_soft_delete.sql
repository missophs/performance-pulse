-- Lets a manager delete a wrapped-up 1:1 from Slack's History modal. Soft
-- delete only, matching the pairs.closed_at pattern (nothing here is ever
-- permanently destroyed) -- listMeetings (lib/data.js) filters this out for
-- both Slack and the website's History page. Melissa's explicit request
-- (2026-09-19): "I want to be able to delete prior history."

alter table meetings add column if not exists deleted_at timestamptz;
