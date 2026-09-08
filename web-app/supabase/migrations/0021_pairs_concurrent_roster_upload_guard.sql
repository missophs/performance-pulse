-- Closes the "concurrent/double-submit uploads" gap flagged in
-- SLACK_TODO.md since 2026-09-05: createPairFromRoster (lib/data.js) reads
-- existing rows, then decides skip/self-heal/reassign/insert with no
-- transaction across the two -- two overlapping roster uploads racing on
-- the same brand-new employee could both reach the insert branch.
--
-- The insert path already does `if (error.code === "23505") return
-- { skipped: true }` -- it just had nothing to violate for this case.
-- pairs_employee_manager_key (0010_multi_pair.sql) is on
-- (employee_id, manager_id), and Postgres treats NULL <> NULL, so it never
-- fires for two placeholder rows (employee_id/manager_id both null until
-- someone signs in with that exact address) racing to insert the same
-- (employee_email, manager_email) pair.
--
-- employee_email/manager_email are always populated (required params to
-- createPairFromRoster) and already citext (0006_citext_emails.sql), so a
-- unique index on them, scoped to non-closed rows (matching the existing
-- app-level dedup, which already excludes closed_at so a rehire under the
-- same manager can get a fresh active row), catches the race the id-based
-- index misses -- with zero code change, since the 23505 handler already
-- exists and already does the right thing.

create unique index if not exists pairs_active_employee_manager_email_key
on pairs (employee_email, manager_email)
where closed_at is null;
