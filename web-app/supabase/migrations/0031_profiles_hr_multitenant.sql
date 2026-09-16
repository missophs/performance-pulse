-- Closes the last real multi-tenant gap: is_hr() (0013_global_handbook.sql)
-- hardcodes 'melissaw212@gmail.com', and every HR admin route/query
-- (roster upload, org chart, close-pair, close-all-pairs) operates on ALL
-- companies' pairs with no scoping at all. Today that's fail-closed (nobody
-- else can pass is_hr() to even reach these routes), but it's a trap for
-- the moment a second company's HR account IS granted access by hand --
-- without this, that account would see and could bulk-close every other
-- customer's pairings, not just their own. Fixed now, before that happens.
--
-- Additive and backfilled, same shape as 0030: profiles.company_id
-- defaults to the original company so nothing about today's single-tenant
-- website signup breaks, and Melissa's own account keeps is_hr = true
-- exactly as before.

alter table profiles add column if not exists company_id uuid references companies (id) default '00000000-0000-0000-0000-000000000001';
update profiles set company_id = '00000000-0000-0000-0000-000000000001' where company_id is null;
alter table profiles alter column company_id set not null;

alter table profiles add column if not exists is_hr boolean not null default false;
update profiles set is_hr = true where email = 'melissaw212@gmail.com';

create or replace function is_hr()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and is_hr
  );
$$;
