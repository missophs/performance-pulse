-- Lets an employee respond to a development plan their manager logged --
-- Melissa's explicit request (2026-09-18): "everyone needs to be able to
-- respond." Development plans were view-only for the employee before this
-- (Delete was manager-only, 2026-09-13's rule; there was no Edit or Respond
-- at all). Mirrors the existing response/responded_at pattern already live
-- on feedback_entries (0017_feedback_response.sql) and concerns
-- (0028_concerns_response_path.sql).

alter table development_plans add column if not exists response text;
alter table development_plans add column if not exists responded_at timestamptz;
