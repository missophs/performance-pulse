@AGENTS.md

# Governance: Slack handler authorization (added 2026-08-29)

A security audit on 2026-08-29 found two confirmed IDOR bugs in
`app/api/slack/interactivity/route.js`: `edit_topic` and `topic_edit` acted
on a topic id taken straight from Slack (`view.private_metadata` /
`action.value`) with no check that the row belonged to the requesting
user's own pair. Both ran on the `admin` (service-role) Supabase client,
which bypasses Row Level Security entirely — RLS is not a backstop for
Slack handlers the way it is for the website's browser-side client.

**Rule: every Slack interactivity/event handler that reads or writes a row
using an id supplied by Slack (`action.value`, `view.private_metadata`, a
select's `selected_option.value`, etc.) MUST verify that row's `pair_id`
matches `ctx.pairId` before acting on it — every time, no exceptions,
regardless of how the id normally gets there.** Do not rely on "the UI
that generates this value already scopes it to the right pair" — that
scoping only holds for a well-behaved client; a modified or replayed
payload does not have to go through the intended UI at all. This applies
to every existing kind (topics, actions, goals, dev plans, achievements,
feedback) and to any new kind added later, especially the still-open
Slack-parity work in `SLACK_TODO.md` (edit for Goals/Dev
plans/Actions, delete for any kind) — building those the same way the
original `edit_topic` was built would repeat this exact bug.

Also known, from the same audit: `concerns`, `review_drafts`, and
`form_drafts` have RLS policies scoped to "either pair member" when the
product intent for those tables is one-sided (manager-only, or
per-person-until-submitted) — RLS currently only enforces "is a pair
member," not "is the *correct* pair member," so the asymmetry those
tables need is UI-only today. See `SLACK_TODO.md` for the full writeup and
fix shape; this file exists so the *rule* survives independently of
that document's length.
