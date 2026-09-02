-- Closing out a manager-employee pairing (Melissa's "Final wrap up for this
-- conversation", 2026-09-01 evening). A pairing can be closed and later
-- reopened -- not a permanent delete, not a full open/close history, just a
-- flag that can be cleared. Closed pairings stop appearing as active (Slack
-- switcher, website dashboard) but every row that references pair_id is
-- untouched -- History and Export still reach all of it.
alter table pairs add column if not exists closed_at timestamptz;
alter table pairs add column if not exists closing_note text;
