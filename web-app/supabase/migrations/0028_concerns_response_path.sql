-- SLACK_TODO.md/CLAUDE.md: Concerns was removed entirely, 2026-09 ("remove
-- all concerns from app and slack") because as built it was manager-only,
-- invisible to the employee, with no response path -- a dead end. Rebuilding
-- it now with the actual fix: a concern can be marked shared (manager's
-- choice, so drafting stays private until they're ready), and once shared
-- the employee can see it and respond -- same shape as feedback_entries'
-- existing response/responded_at pattern already live in this app.
--
-- concerns stays manager-exclusive for everything else (matches 0007_role_
-- scoped_rls.sql's "manager can select/insert/update/delete" policies,
-- untouched here) -- this only opens a narrow, column-guarded crack for the
-- employee side once a concern is explicitly shared.

alter table concerns add column if not exists shared_at timestamptz;
alter table concerns add column if not exists response text;
alter table concerns add column if not exists responded_at timestamptz;

-- Mirrors is_pair_manager (schema.sql) for the other side of the pair.
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

create policy "employee can select shared concerns" on concerns for select using (
  shared_at is not null and is_pair_employee(pair_id)
);

-- Column-level guard: an employee update may only ever set response /
-- responded_at, and only once the concern is already shared. Everything
-- else (what, expectation, communicated, previously, support, outcome,
-- shared_at itself) stays manager-only, enforced here rather than trusted
-- to the app layer -- same reasoning as guard_pairs_close in
-- 0019_pairs_close_guard.sql.
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
