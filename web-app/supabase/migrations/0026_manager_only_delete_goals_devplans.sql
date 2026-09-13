-- Melissa's decision, 2026-09-13: an employee can tweak a goal or
-- development plan alongside their manager, but must never be able to
-- unilaterally delete one the manager set. Until this migration, `goals`
-- and `development_plans` were in schema.sql's generic pair_scoped_tables
-- loop, whose "pair members can delete" policy lets either side of the
-- pairing delete any row -- manager or employee, no distinction. That
-- policy is dropped for these two tables and replaced with a manager-only
-- delete rule, reusing the same is_pair_manager() helper `concerns` already
-- uses. select/insert/update are untouched -- both partners can still add
-- and edit goals/plans, matching the app/api/slack/interactivity/route.js
-- and app/(dashboard)/goals & development page.js changes made alongside
-- this migration.
--
-- Note for whoever runs this by hand in the Supabase SQL editor (this repo
-- has no linked Supabase CLI -- see web-app/CLAUDE.md): this only closes
-- the database-level hole. Slack's interactivity handler runs on the
-- service-role admin client, which bypasses RLS entirely, so goal_delete
-- and devplan_delete in app/api/slack/interactivity/route.js also gate on
-- ctx.isMgr directly -- deploy that code change together with this
-- migration, not one without the other.

begin;

drop policy if exists "pair members can delete" on goals;
create policy "manager can delete" on goals
  for delete using (is_pair_manager(pair_id));

drop policy if exists "pair members can delete" on development_plans;
create policy "manager can delete" on development_plans
  for delete using (is_pair_manager(pair_id));

commit;
