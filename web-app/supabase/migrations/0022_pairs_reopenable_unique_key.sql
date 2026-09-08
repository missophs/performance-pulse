-- Found live 2026-09-07 during the manager-email data repair: reopening a
-- correctly-linked but closed pairing failed with "duplicate key value
-- violates unique constraint pairs_employee_manager_key" because that index
-- (0010_multi_pair.sql) covers (employee_id, manager_id) with no exclusion
-- for closed rows. A closed pairing between two real, signed-in people
-- permanently blocks ever creating a new active pairing between those same
-- two people again -- exactly the "rehire" case the app-level dedup checks
-- already special-case (createPairFromRoster excludes closed_at from its
-- own lookups), but the database constraint itself was never made to match.
--
-- Making the index partial (only enforced while closed_at is null) keeps
-- the real invariant -- two people can't have more than one ACTIVE pairing
-- at once -- while allowing a closed pairing to be reopened, or a fresh one
-- created, once the old one is closed. NULL employee_id/manager_id rows
-- (placeholder-only pairings) are unaffected either way, since Postgres
-- already treats every NULL as distinct from every other NULL in a unique
-- index.

-- Explicit transaction: this repo has no Supabase CLI, so every migration is
-- run by hand by pasting the whole file into the SQL editor (web-app/CLAUDE.md).
-- Wrapping the drop+create here means running it as one paste (the normal
-- way) is atomic even if the editor's own implicit-transaction behavior ever
-- changes, and running the two statements separately by accident fails
-- cleanly instead of leaving a window with zero uniqueness enforced on
-- (employee_id, manager_id). Found in review 2026-09-07.
begin;

drop index if exists pairs_employee_manager_key;

create unique index pairs_employee_manager_key
on pairs (employee_id, manager_id)
where closed_at is null;

commit;
