-- Decouples "submit" from add/edit for topics — see SLACK_TODO.md item 0.
-- Melissa: "they have to submit it to the employee, the manager, so they
-- know that it's done. I don't wanna ping right away." / "Saving changes
-- should not be submitting... Editing or adding a topic is not the submit
-- either." Scope is topics only, matching how the topic-edit feature itself
-- was scoped.
--
-- Mechanism note: there is no DB trigger on `topics` that fires a
-- notification on insert — `notify_slack_on_notification()`
-- (0005_slack_notify_trigger.sql) fires on insert into `notifications`,
-- and every insert into `notifications` is an explicit app-code call to
-- lib/data.js's notify() right after a mutation (see app/(dashboard)/
-- one-on-one/page.js's addTopicRow/flushTopicNotify and
-- app/api/slack/interactivity/route.js's add_topic handler). So the actual
-- minimal-divergence fix is at that call site, not in SQL: this migration
-- only adds the column the app now checks before deciding whether to call
-- notify() at all. No trigger function changes.
alter table topics add column if not exists submitted_at timestamptz;

-- Backfill: every topic that already existed before this migration predates
-- the submit-gates-the-ping model entirely. Defaulting those rows to
-- "already submitted" (rather than leaving them null / "not yet submitted")
-- avoids a confusing regression where pre-existing, already-discussed-or-
-- in-flight topics would suddenly show an unsubmitted state and a Submit
-- button nobody asked for. Rows added after this point get submitted_at =
-- null from the column default, since the insert path (addTopic) doesn't
-- set it — that's the whole point.
update topics set submitted_at = created_at where submitted_at is null;
