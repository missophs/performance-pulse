-- AI summary of the private manager<->employee Slack conversation
-- (Melissa's call, 2026-09-18) -- reverses the 2026-09-17 "never read this
-- conversation" decision, on purpose, for this one feature only. Manager-
-- only: generated on demand (never automatically, since each generation
-- calls a paid AI API), shown labeled "AI summary of this conversation --
-- reviewed by <manager name>", and editable by the manager if wrong,
-- matching the governance rule in web-app/CLAUDE.md that any AI-generated
-- content needs an explicit human-review step before it's treated as final.
--
-- Plain columns on `pairs`, same pattern as chat_opened_at (migration
-- 0032) -- one current summary per pair, not a growing log of past ones.

alter table pairs add column if not exists conversation_summary text;
alter table pairs add column if not exists conversation_summary_generated_at timestamptz;
alter table pairs add column if not exists conversation_summary_edited_at timestamptz;
