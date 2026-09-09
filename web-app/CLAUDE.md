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

# Deploy pipeline: `git push` to `main` DOES deploy this app (fixed 2026-09-09)

**This section used to say `git push` does NOT deploy — that's no longer
true, don't act on the old claim.** The root cause was two stacked bugs,
both fixed the same session: (1) Vercel's "Connected Git Repository" for
this project pointed at `missophs/employee---manager-chat`, a separate old
prototype repo — not `missophs/performance-pulse`, the real one — so no
webhook could exist for the right repo; reconnected via the Vercel
dashboard. (2) Once reconnected, the first Git-triggered build immediately
failed (`Couldn't find any pages or app directory`) because the project's
**Root Directory** setting was empty — every prior deploy had run `vercel
--prod` from inside `web-app/`, which sidesteps that setting entirely, so
this was invisible until a Git-based build actually tried to build from
the repo root. Set Root Directory to `web-app`; a push to `main` now
builds and deploys to production on its own.

`vercel --prod` from `web-app/` still works as a manual/immediate option
(and is still the one Claude Code's sandboxed Bash tool is blocked from
running directly, by design, since it's production-affecting — tell the
person you're working with to run it themselves if you need an
out-of-band deploy). But for the normal case, committing and pushing to
`main` is now sufficient by itself.

Same caveat still applies to Supabase migrations: there's no Supabase CLI
linked in this repo either (`supabase/.temp` has no project ref), so any
new `supabase/migrations/*.sql` file needs to be run by hand in the
Supabase SQL editor before it does anything — writing the migration file
is not the same as applying it.

# Governance: privacy policy accuracy (added 2026-09-05)

`app/privacy/page.js` is a real, live page — it's the URL entered as the
"Application privacy policy link" on the Google Cloud OAuth consent
screen (Google Auth Platform → Branding, project "Performance Pulse
SSO"), required for the app to leave Testing mode and let any Google
account sign in. It is read by Google, and by real employees during
onboarding — not decorative content.

**Rule: any change to what data this app collects, stores, shares, or
signs in with (a new table, a new integration, a new OAuth provider like
Microsoft, a new third-party service, a new HR/roster feature) must
update `app/privacy/page.js` in the same change, not as a follow-up.**
Do not let this page drift from what the app actually does. If it's
unclear whether something needs disclosing, ask Melissa rather than
guess or quietly omit it. Do not add compliance claims (GDPR, CCPA, SOC2,
etc.) unless they're actually true — this is a plain-language description
of real behavior, not a legal document, and should stay that way unless
Melissa explicitly wants real legal review.
