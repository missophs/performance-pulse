-- Closes the RLS gap found in the 2026-08-29 security audit (SLACK_TODO.md
-- item 0i, web-app/CLAUDE.md's governance note): concerns, review_drafts,
-- and form_drafts were covered by the same "any pair member" policies as
-- every other pair-scoped table (the `pair_scoped_tables` loop in
-- schema.sql), even though the product intent for all three is one-sided,
-- not shared between the pair:
--   - concerns is manager-only notes about the employee. The website UI
--     already hides this tab from the employee (`mgrOnly: true` on the
--     "Updates" tab, app/(dashboard)/performance/page.js) — RLS never
--     enforced the same rule, so an employee could read or write it
--     directly via their own browser console/API calls, bypassing the UI
--     entirely. Fixed here to match the UI's existing intent exactly: fully
--     manager-exclusive, no employee access at all, not even read. This is
--     a safe default precisely because the UI already behaves this way —
--     no employee-facing behavior changes.
--   - review_drafts and form_drafts are keyed (pair_id, role) so each side
--     of the pair can save an in-progress form without colliding with the
--     other's draft — but "is a pair member" let either side read or
--     overwrite the OTHER role's not-yet-submitted row too.
--
-- Drops only the four shared "pair members can ..." policies on these three
-- tables (installed by schema.sql's loop) and replaces them with
-- role-scoped equivalents. No other table's RLS is touched.

-- ============================================================================
-- concerns — fully manager-exclusive. The pair's manager gets full access;
-- the employee gets none.
-- ============================================================================

drop policy "pair members can select" on concerns;
drop policy "pair members can insert" on concerns;
drop policy "pair members can update" on concerns;
drop policy "pair members can delete" on concerns;

create function is_pair_manager(check_pair_id uuid)
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

create policy "manager can select" on concerns for select using (is_pair_manager(pair_id));
create policy "manager can insert" on concerns for insert with check (is_pair_manager(pair_id));
create policy "manager can update" on concerns for update using (is_pair_manager(pair_id));
create policy "manager can delete" on concerns for delete using (is_pair_manager(pair_id));

-- ============================================================================
-- review_drafts / form_drafts — each row belongs to one side of the pair
-- (role = 'employee' | 'manager', the same two values create_pair's my_role
-- check accepts). A pair member should only reach the row matching their own
-- role, never their partner's.
-- ============================================================================

create function is_own_role_row(check_pair_id uuid, check_role text)
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

drop policy "pair members can select" on review_drafts;
drop policy "pair members can insert" on review_drafts;
drop policy "pair members can update" on review_drafts;
drop policy "pair members can delete" on review_drafts;

create policy "own role can select" on review_drafts for select using (is_own_role_row(pair_id, role));
create policy "own role can insert" on review_drafts for insert with check (is_own_role_row(pair_id, role));
create policy "own role can update" on review_drafts for update using (is_own_role_row(pair_id, role));
create policy "own role can delete" on review_drafts for delete using (is_own_role_row(pair_id, role));

drop policy "pair members can select" on form_drafts;
drop policy "pair members can insert" on form_drafts;
drop policy "pair members can update" on form_drafts;
drop policy "pair members can delete" on form_drafts;

create policy "own role can select" on form_drafts for select using (is_own_role_row(pair_id, role));
create policy "own role can insert" on form_drafts for insert with check (is_own_role_row(pair_id, role));
create policy "own role can update" on form_drafts for update using (is_own_role_row(pair_id, role));
create policy "own role can delete" on form_drafts for delete using (is_own_role_row(pair_id, role));
