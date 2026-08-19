-- Adds save-and-resume-later support to the check-in wizard. Run this once
-- against a database that already has the original schema.sql applied
-- (already-fresh installs get these columns from schema.sql directly).

alter table checkins add column if not exists in_progress boolean not null default false;
alter table checkins add column if not exists draft_state jsonb;
