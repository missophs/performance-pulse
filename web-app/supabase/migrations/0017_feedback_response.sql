-- Employee can respond to feedback from their manager, in place (Melissa's
-- call, 2026-09-02): feedback itself is manager-to-employee only going
-- forward (enforced in the UI, not RLS -- same pattern as the rest of this
-- schema, see CLAUDE.md's RLS-asymmetry note), but the employee gets one
-- reply per feedback entry rather than a symmetric "give feedback" of
-- their own.
alter table feedback_entries add column if not exists response text;
alter table feedback_entries add column if not exists responded_at timestamptz;
