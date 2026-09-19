-- Lets an employee respond to a goal or an achievement, matching the
-- existing response/responded_at pattern already live on feedback_entries
-- (0017), concerns (0028), and development_plans (0035). Melissa's explicit
-- request (2026-09-19): flag Goals and Achievements the same way.

alter table goals add column if not exists response text;
alter table goals add column if not exists responded_at timestamptz;

alter table achievements add column if not exists response text;
alter table achievements add column if not exists responded_at timestamptz;
