-- Manager-only display name for an employee, scoped to one pairing --
-- Melissa's "you appear as melissa to melissa" confusion (2026-09-01
-- night). Deliberately NOT the same field as profiles.full_name: that one
-- value is shown to every manager an account has, so editing it from here
-- would rename the employee's real account everywhere. This column is a
-- private label, this pair only -- the employee's own account and every
-- other pairing they're in are untouched.
alter table pairs add column if not exists employee_label text;
