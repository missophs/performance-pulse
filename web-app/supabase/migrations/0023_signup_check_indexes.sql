-- 0020_restrict_signup_to_provisioned.sql's handle_new_user check --
-- `not exists (select 1 from profiles where email = new.email)` and
-- `not exists (select 1 from pairs where employee_email = new.email or
-- manager_email = new.email)` -- runs on every single Google sign-in, and
-- none of the three columns it filters on were indexed: profiles only has
-- its primary key (id), and pairs' only relevant index
-- (pairs_active_employee_manager_email_key, 0021) is a composite partial
-- index that can't serve a single-column lookup with no closed_at
-- predicate. Every sign-in was paying two full-table scans. Found in review
-- 2026-09-07.
--
-- Also used by tonight's new lookup in app/api/hr/roster/route.js (the
-- "is this manager name already a real, linked identity" fallback), which
-- scans pairs.employee_email directly.

create index if not exists profiles_email_idx on profiles (email);
create index if not exists pairs_employee_email_idx on pairs (employee_email);
create index if not exists pairs_manager_email_idx on pairs (manager_email);
