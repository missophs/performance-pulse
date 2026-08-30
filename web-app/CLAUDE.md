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

# Deploy pipeline: `git push` does NOT deploy this app (found 2026-08-29)

There is no GitHub→Vercel webhook wired up for this project, despite
"Connect Git Repository" showing as done in the Vercel dashboard's
production checklist. Every deployment in Vercel's history was created by
someone manually running the Vercel CLI, not by a push — confirmed by
committing and pushing two real fix commits to `main` and then finding,
hours later, that the live site's `lib/data.js` still didn't contain code
from either commit. Pushing to GitHub is necessary (it's the source of
truth) but is **not sufficient** to ship anything.

**To actually deploy:** run `vercel --prod` from `web-app/` (the Vercel
CLI is already installed and authenticated as the project's account).
This must be run in a real terminal — Claude Code's sandboxed Bash tool
gets blocked by its own safety classifier from running this, by design,
since it's a production-affecting action; if you're an agent working in
this repo, don't try to work around that block — tell the person you're
working with to run it themselves and explain why.

Same applies to Supabase migrations: there's no Supabase CLI linked in
this repo either (`supabase/.temp` has no project ref), so any new
`supabase/migrations/*.sql` file needs to be run by hand in the Supabase
SQL editor before it does anything — writing the migration file is not
the same as applying it.
