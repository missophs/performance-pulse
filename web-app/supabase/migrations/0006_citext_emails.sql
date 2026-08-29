-- Fixes the case-sensitivity bug the 2026-08-27 fix (8f6e8b8) only half-closed.
-- That commit made create_pair/handle_new_user match emails case-insensitively
-- via lower(), but lib/slack-user.js's resolveSlackUser still did a plain
-- PostgREST .eq() against employee_email/manager_email — a case-sensitive
-- Postgres comparison — so any pairs row written before that fix (original
-- typed case, never backfilled) is invisible to the Slack lookup. Confirmed
-- live: the orphaned row from that same incident, 29d4b909-a7a6-4a95-bda4-
-- 1da2446519e7, still has manager_email stored as
-- "melissaw212+accountA@gmail.com" (capital A) after being linked via
-- manager_id on 2026-08-28 (see SLACK_TODO.md) — reproduces this exact bug.
--
-- Fix: make the email columns citext (case-insensitive text) instead of
-- patching every comparison site by hand. A plain `=`/.eq() on a citext
-- column is case-insensitive by construction, at every current and future
-- call site, with no backfill of existing rows required — citext doesn't
-- change stored bytes, only how they compare.
--
-- Also fixes a regression the original lower() fix introduced:
-- handle_new_user's UPDATEs had no row cap, so two pre-existing pairs rows
-- that are case-variants of the same address (one written before this
-- migration, one after — case-insensitive writes only became mandatory with
-- 8f6e8b8) could both match in one UPDATE and collide on
-- pairs_employee_id_key/pairs_manager_id_key, aborting the whole signup
-- transaction. Each UPDATE below is narrowed to the single oldest matching
-- row instead.

create extension if not exists citext;

alter table profiles alter column email type citext;
alter table pairs alter column employee_email type citext;
alter table pairs alter column manager_email type citext;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''));

  update pairs set employee_id = new.id
  where id = (
    select id from pairs
    where employee_email = new.email and employee_id is null
    order by created_at asc
    limit 1
  );

  update pairs set manager_id = new.id
  where id = (
    select id from pairs
    where manager_email = new.email and manager_id is null
    order by created_at asc
    limit 1
  );

  return new;
end;
$$;

create or replace function create_pair(my_role text, partner_email text)
returns pairs
language plpgsql
security definer
set search_path = public
as $$
declare
  my_email text;
  partner_id uuid;
  result pairs;
begin
  if my_role not in ('employee', 'manager') then
    raise exception 'my_role must be employee or manager';
  end if;

  select email into my_email from profiles where id = auth.uid();
  if my_email is null then
    raise exception 'no profile for current user';
  end if;

  select id into partner_id from profiles
  where email = partner_email
  order by id
  limit 1;

  if my_role = 'employee' then
    insert into pairs (employee_id, manager_id, employee_email, manager_email)
    values (auth.uid(), partner_id, my_email, partner_email)
    returning * into result;
  else
    insert into pairs (employee_id, manager_id, employee_email, manager_email)
    values (partner_id, auth.uid(), partner_email, my_email)
    returning * into result;
  end if;

  return result;
end;
$$;
