-- Closes the gap flagged in web-app/CLAUDE.md's governance note and carried
-- in SLACK_TODO.md since 2026-09-03: "End this pairing" (closePair) has
-- always been manager-only in the UI (app/(dashboard)/history/page.js's
-- endPairing checks isMgr before calling it) but nothing at the database
-- level stopped an employee from calling closePair directly with their own
-- browser session -- pairs predates this migrations folder, so it never got
-- an UPDATE policy restricting who can end a pairing.
--
-- A trigger, not an RLS policy, because the restriction is column-value-
-- specific (only the closed_at transition needs guarding) and RLS's
-- USING/WITH CHECK clauses don't get both the old and new row at once the
-- way a BEFORE UPDATE trigger does.
--
-- Reopening (closed_at -> null) is deliberately NOT restricted here --
-- history/page.js's `reopen` has no isMgr check today, either pair member
-- can already do it, and that's left as-is.
--
-- auth.uid() is null for any service-role (admin()) call, which is what
-- every existing HR route in this app already uses to close pairings on
-- someone else's behalf (app/api/hr/close-pair/route.js,
-- app/api/hr/close-all-pairs/route.js) -- those keep working unchanged.

create or replace function guard_pairs_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.closed_at is not null and old.closed_at is null then
    if auth.uid() is not null and auth.uid() <> old.manager_id then
      raise exception 'Only the manager (or HR) can end this pairing';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists pairs_close_guard on pairs;
create trigger pairs_close_guard
before update on pairs
for each row
execute function guard_pairs_close();
