-- Google sign-in was published (2026-09-05) so any Google account can
-- complete OAuth -- there's no more per-person test-user allowlist. That's
-- required for real employees to sign in without Melissa maintaining a
-- list, but it also means a stranger who's never been added to this
-- company's roster could create a live account today. Melissa's ask
-- (2026-09-07): "make Google sign-on a little more safe."
--
-- This app already has no self-serve path -- HR's roster upload or a
-- manager's "+Add employee" is the only way a pairing gets created
-- (SLACK_TODO.md, 2026-09-05: "I don't want employees choosing anything").
-- Extending that same rule to account creation itself: block anyone whose
-- email isn't already known to the app (an existing profile, or an
-- employee_email/manager_email already sitting on a pairs row from a
-- roster upload or "+Add employee") from signing up at all. A legitimate
-- employee's real email is always on a pairs row (or already a profile)
-- before they ever sign in for the first time; a stranger's isn't.
--
-- Not a domain restriction (google's `hd` param) -- this app's real users
-- sign in with plain personal Gmail addresses, not a shared company
-- Workspace domain, so `hd` doesn't fit. This is stricter and fits the
-- app's actual provisioning model instead.
--
-- Raising inside this trigger rolls back the whole signup transaction
-- (including the auth.users row Supabase's own auth server just inserted),
-- so a rejected sign-in leaves no orphaned account behind -- confirmed by
-- reading how handle_new_user is invoked (security definer trigger on
-- auth.users, same transaction).

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where email = new.email)
     and not exists (select 1 from pairs where employee_email = new.email or manager_email = new.email) then
    raise exception 'not_provisioned: % is not on the roster yet -- ask HR to add you first', new.email;
  end if;

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
