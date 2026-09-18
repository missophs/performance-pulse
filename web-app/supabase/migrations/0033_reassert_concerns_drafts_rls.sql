-- Idempotent re-assertion of the concerns/review_drafts/form_drafts RLS fix
-- (0007_role_scoped_rls.sql + 0028_concerns_response_path.sql). Written
-- because SLACK_TODO.md's own 0007 entry says "Not yet applied to the live
-- database... the migration SQL was handed to Melissa to run by hand... a
-- safety check correctly blocked running schema-altering DDL against
-- production via browser automation" and there is no later confirmation
-- anywhere in this repo that she ever ran it -- so as of 2026-09-18, whether
-- this production database currently has the old, too-broad "pair members
-- can ..." policies on these three tables, or the correct role-scoped ones,
-- is genuinely unknown from the repo alone.
--
-- This migration is safe to run regardless of which state production is
-- actually in: every DROP is "if exists" (covering both the old shared
-- policy names and the new role-scoped ones, so re-running this script a
-- second time is also a safe no-op), every function is CREATE OR REPLACE,
-- and the end state after running it is always exactly correct: `concerns`
-- fully manager-exclusive except for the narrow shared/response crack for
-- the employee, and `review_drafts`/`form_drafts` scoped to each pair
-- member's own role only.

create or replace function is_pair_manager(check_pair_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from pairs
    where id = check_pair_id
      and manager_id = auth.uid()
  );
$$;

create or replace function is_pair_employee(check_pair_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from pairs
    where id = check_pair_id
      and employee_id = auth.uid()
  );
$$;

create or replace function is_own_role_row(check_pair_id uuid, check_role text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from pairs
    where id = check_pair_id
      and (
        (check_role = 'employee' and employee_id = auth.uid())
        or (check_role = 'manager' and manager_id = auth.uid())
      )
  );
$$;

-- ============================================================================
-- concerns
-- ============================================================================

alter table concerns add column if not exists shared_at timestamptz;
alter table concerns add column if not exists response text;
alter table concerns add column if not exists responded_at timestamptz;

drop policy if exists "pair members can select" on concerns;
drop policy if exists "pair members can insert" on concerns;
drop policy if exists "pair members can update" on concerns;
drop policy if exists "pair members can delete" on concerns;
drop policy if exists "manager can select" on concerns;
drop policy if exists "manager can insert" on concerns;
drop policy if exists "manager can update" on concerns;
drop policy if exists "manager can delete" on concerns;
drop policy if exists "employee can select shared concerns" on concerns;
drop policy if exists "employee can respond to shared concerns" on concerns;

create policy "manager can select" on concerns for select using (is_pair_manager(pair_id));
create policy "manager can insert" on concerns for insert with check (is_pair_manager(pair_id));
create policy "manager can update" on concerns for update using (is_pair_manager(pair_id));
create policy "manager can delete" on concerns for delete using (is_pair_manager(pair_id));

create policy "employee can select shared concerns" on concerns for select using (
  shared_at is not null and is_pair_employee(pair_id)
);

create or replace function guard_concerns_employee_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_pair_manager(new.pair_id) then
    if old.shared_at is null then
      raise exception 'This concern has not been shared yet';
    end if;
    if new.what is distinct from old.what
      or new.concern_date is distinct from old.concern_date
      or new.expectation is distinct from old.expectation
      or new.communicated is distinct from old.communicated
      or new.previously is distinct from old.previously
      or new.support is distinct from old.support
      or new.outcome is distinct from old.outcome
      or new.shared_at is distinct from old.shared_at
      or new.pair_id is distinct from old.pair_id
    then
      raise exception 'Only the manager can edit this concern';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists concerns_employee_update_guard on concerns;
create trigger concerns_employee_update_guard
before update on concerns
for each row
execute function guard_concerns_employee_update();

create policy "employee can respond to shared concerns" on concerns for update using (
  shared_at is not null and is_pair_employee(pair_id)
);

-- ============================================================================
-- review_drafts / form_drafts
-- ============================================================================

drop policy if exists "pair members can select" on review_drafts;
drop policy if exists "pair members can insert" on review_drafts;
drop policy if exists "pair members can update" on review_drafts;
drop policy if exists "pair members can delete" on review_drafts;
drop policy if exists "own role can select" on review_drafts;
drop policy if exists "own role can insert" on review_drafts;
drop policy if exists "own role can update" on review_drafts;
drop policy if exists "own role can delete" on review_drafts;

create policy "own role can select" on review_drafts for select using (is_own_role_row(pair_id, role));
create policy "own role can insert" on review_drafts for insert with check (is_own_role_row(pair_id, role));
create policy "own role can update" on review_drafts for update using (is_own_role_row(pair_id, role));
create policy "own role can delete" on review_drafts for delete using (is_own_role_row(pair_id, role));

drop policy if exists "pair members can select" on form_drafts;
drop policy if exists "pair members can insert" on form_drafts;
drop policy if exists "pair members can update" on form_drafts;
drop policy if exists "pair members can delete" on form_drafts;
drop policy if exists "own role can select" on form_drafts;
drop policy if exists "own role can insert" on form_drafts;
drop policy if exists "own role can update" on form_drafts;
drop policy if exists "own role can delete" on form_drafts;

create policy "own role can select" on form_drafts for select using (is_own_role_row(pair_id, role));
create policy "own role can insert" on form_drafts for insert with check (is_own_role_row(pair_id, role));
create policy "own role can update" on form_drafts for update using (is_own_role_row(pair_id, role));
create policy "own role can delete" on form_drafts for delete using (is_own_role_row(pair_id, role));
