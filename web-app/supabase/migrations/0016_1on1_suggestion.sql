-- Employee-side "suggest a different date/time" for the next 1:1 (Melissa's
-- call, 2026-09-02): the manager owns the real next_1on1_date/time/focus
-- fields (unchanged), but an employee can propose an alternative without
-- overwriting it directly. The manager then accepts (copies these into the
-- real fields) or dismisses (clears these). Not a full request/approval
-- system with history -- one pending suggestion at a time, same as every
-- other lightweight flag in this schema.
alter table pairs add column if not exists suggested_1on1_date date;
alter table pairs add column if not exists suggested_1on1_time time;
alter table pairs add column if not exists suggested_1on1_note text;
