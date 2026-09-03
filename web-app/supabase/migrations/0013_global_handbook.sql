-- Handbook links go from "one list per pairing" to one shared, company-wide
-- list, with uploads locked to HR (Melissa's call, 2026-09-02): every
-- employee should see the same handbook regardless of who their manager is,
-- and only HR should be able to add or edit it. Read stays open to any
-- signed-in user; write is gated to a hardcoded HR email -- a real
-- role/account type is overkill for one HR person today, see SLACK_TODO.md.

drop policy "pair members can select" on handbook_links;
drop policy "pair members can insert" on handbook_links;
drop policy "pair members can update" on handbook_links;
drop policy "pair members can delete" on handbook_links;

alter table handbook_links drop column pair_id;

create function is_hr()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and email = 'melissaw212@gmail.com'
  );
$$;

create policy "any signed-in user can select" on handbook_links
  for select using (auth.uid() is not null);
create policy "hr can insert" on handbook_links
  for insert with check (is_hr());
create policy "hr can update" on handbook_links
  for update using (is_hr());
create policy "hr can delete" on handbook_links
  for delete using (is_hr());
