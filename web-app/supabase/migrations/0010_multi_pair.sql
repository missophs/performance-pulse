-- Multi-pair support, database step — see SLACK_TODO.md item 2.
-- v1 allowed exactly one pairing per employee_id and one per manager_id
-- (pairs_employee_id_key / pairs_manager_id_key). That's what made a middle
-- manager or a manager with 2+ reports impossible to represent cleanly.
-- Melissa confirmed both shapes are real (2026-08-25) and decided on a
-- switcher, not a combined view, so the database needs to allow any account
-- to appear in any number of pairs rows.
--
-- Replacement rule: the same two people still can't be paired to each other
-- twice — that's the only restriction the old indexes were incidentally
-- providing that's worth keeping.
drop index if exists pairs_employee_id_key;
drop index if exists pairs_manager_id_key;

create unique index pairs_employee_manager_key on pairs (employee_id, manager_id);

-- create_pair's insert can now hit that new unique index (pairing the same
-- two people twice) instead of the old per-column ones — give that case a
-- readable error instead of a raw Postgres unique-violation message.
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

  begin
    if my_role = 'employee' then
      insert into pairs (employee_id, manager_id, employee_email, manager_email)
      values (auth.uid(), partner_id, my_email, partner_email)
      returning * into result;
    else
      insert into pairs (employee_id, manager_id, employee_email, manager_email)
      values (partner_id, auth.uid(), partner_email, my_email)
      returning * into result;
    end if;
  exception
    when unique_violation then
      raise exception 'You''re already paired with this person.';
  end;

  return result;
end;
$$;
