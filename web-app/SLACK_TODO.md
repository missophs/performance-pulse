# Slack integration — status and what's left

## Correction, 2026-09-01 evening: the keep-warm cron never actually ran

The `.github/workflows/keep-warm.yml` file added in `677fc00` had an
invalid YAML `run:` line — `curl ... -w "status: %{http_code}\n" ...`
written as a plain scalar, which YAML's grammar disallows once a `: `
appears unquoted inside it. GitHub could not parse the file at all, so
**every run since it was added failed with zero jobs** (visible as
`event: push`, `conclusion: failure`, 0 jobs on every commit pushed that
day). This means the note above saying the cold-start keep-warm cron
"should reduce [cold starts] now that it's actually running" was wrong
at the time it was written — it was never running.

**Fixed in `2c8368c`:** the `run:` line is now a block scalar (`run: |`),
which sidesteps the colon-ambiguity issue. Verified live, not just by
re-reading the YAML: triggered manually via `gh workflow run`, the run
completed in 12s, GitHub now shows the correct workflow name (proof it
parses), and the logged output was `status: 401` — the expected result,
since the ping carries no real Slack signature and is only there to keep
the serverless function warm.

**How to apply:** the cold-start mitigation is only real starting now
(2026-09-01 evening). Any earlier claim in this file that it was
reducing cold starts should be read as aspirational, not verified.

## Where everything lives (as of 2026-09-01)

- **Live website:** https://performance-pulse-lyart.vercel.app — sign in at
  `/login` with email + password (magic link is the backup option).
- **Slack:** the "Performance Pulse" app is installed in Melissa's Slack
  workspace. Open it from the Apps section of the Slack sidebar, then the
  Home tab. It reads and writes the same database as the website.
- **Code:** `~/Code/performance/web-app` (moved out of iCloud-synced
  `~/Documents` on 2026-09-01). Everything else in the repo is old or
  shelved — see the architecture note at the top of `web-app/CLAUDE.md`.
- **Backup / source of truth:** GitHub, `missophs/performance-pulse`,
  branch `main`. Remote name in git is `performance-pulse`, not `origin`.
- **Hosting:** Vercel, project `performance-pulse`. `git push` does NOT
  deploy; run `vercel --prod` from `web-app/` in a real terminal.
- **Database:** Supabase. Migrations in `web-app/supabase/migrations/`
  must be pasted into the Supabase SQL editor by hand to take effect.
- **Secrets:** `web-app/.env.local` on this Mac (gitignored, on purpose)
  and the Vercel project's environment variables. Not in the repo.

## Slack walkthrough with Melissa, 2026-09-01 evening — live, in her own Slack

Ran the planned walkthrough. Not a quiet click-through — she drove her own
real Slack window while I read the code and checked findings live in
production, and it surfaced a real backlog. Deploy status matters here:
one `vercel --prod` run happened partway through (confirmed live via her
own screenshot: the Home tab showed "Edit your own name") — that covers
everything through commit `afb8650`. **Three more commits landed after
that deploy and are pushed but NOT live yet** — `82be5b5`, `62bf9d4`,
`de8ced6`. Another `vercel --prod` is needed before any of the fixes
below the line show up for her.

**Removed entirely, Slack + website (deployed):**
- **Concerns.** Manager-only, invisible to the employee, no response
  path — confirmed dead-end in the code (no `add_concern` handler ever
  existed in Slack; the website tab redirected employees away from it on
  sight). Melissa's call after walking through what it actually did:
  "remove all concerns from app and slack." Removed from both, including
  its references in History/Export/the review-draft builder. The
  database table and its RLS policy are untouched — nothing was dropped,
  just the app-layer access to it. Commits `964ce65` (Slack) and
  `afb8650` (website).

**Fixed, live-verified against her real screen (deployed):**
- The "Edit your name" button used to sit on the same line as "Your 1:1
  partner: [name]," reading like it edited the partner. Now its own line:
  "You appear as **[name]** to [partner] — Edit your own name."
  Confirmed this really was the bug and really is fixed, both by reading
  her live screen before and after.

**Fixed, pushed (`82be5b5`, `62bf9d4`, `de8ced6`) — NOT deployed yet:**
- **Three duplicate buttons.** Career, Documents, and Suggestions each
  had the identical action twice — once on the Home tab, once again
  inside their own "View" popup. Removed the redundant inner one in all
  three.
- **Feedback reordered and relabeled.** Give feedback / Ask for feedback
  now come before View feedback, which is now labeled "View feedback in
  the app" so it's clear that one's app-only.
- **Save/submit confirmation.** A successful Slack submission used to
  just close the modal — identical to Cancel, no way to tell a save
  happened from nothing happening. Every Save now triggers a DM
  ("✅ Saved in Performance Pulse.") right after, added at the single
  shared `view_submission` dispatch point so it covers every form at
  once rather than 20 separate handler edits.
- **History, added to Slack.** New section on the Home tab linking
  straight to `/history` on the website. `openInApp` can now take a
  path instead of always pointing at the homepage — every other
  "open in app" button still points at the homepage unchanged.

**Diagnosed, not yet fixed — needs a real decision, not a quick edit:**
- **Silent failures on Slack button clicks.** Goals' "Edit" button (and
  likely others) can click and visibly do nothing: opening a nested
  modal needs a Slack `trigger_id` that's single-use and expires 3
  seconds after issue; if a cold serverless start eats that window, the
  failure is caught and only `console.error`'d — the user sees nothing.
  Found the same silent-catch pattern in 15 places in
  `app/api/slack/interactivity/route.js`. Not fixed tonight — it's a
  real feature (visible errors on failure), not a one-line change.
  Melissa wants it; scope it properly next session.
- **Handbook edit permission.** Confirmed live: the website's "HR only:
  add the link" button has no actual enforcement — any signed-in
  manager or employee can click it today, and there's no HR account
  type in this app to restrict it to. Decision from Melissa: Slack stays
  view-only for Handbook, permanently — no Slack-side add, ever. The
  website side (tightening "HR only" to something real) is still
  unresolved and **not implemented** — nothing changed in code for this
  yet.

**Scoped but not started — real schema work, needs Melissa's answer on one
question before writing the migration:**
- **Ending a manager-employee pairing ("Final wrap up for this
  conversation").** Today every pairing anyone creates stays in the
  Slack switcher forever — confirmed in `listMyPairs`, no closed/active
  concept exists at all. Plan, agreed with Melissa: keep the existing
  "Wrap up a 1:1" exactly as it is (that's per-meeting notes, stays);
  add a **separate**, new "Final wrap up for this conversation" button
  at the bottom of the Home tab (next to History) that ends the whole
  pairing — both sides are told, the pairing drops out of the active
  switcher, and its data stays fully reachable in History/Export,
  nothing deleted. Needs a new `closed_at` (+ closing note) column on
  `pairs`, a migration Melissa has to paste into Supabase's SQL editor
  by hand, same as every schema change here. **Blocked on one open
  question: can a closed pairing ever be reopened, or is this meant to
  be permanent?** Don't write the migration until that's answered — it
  changes the shape (a single timestamp vs. a small open/close history).
- **Adding a new employee from Slack.** The website already has this
  ("Add another pairing," `/onboarding/add`, linked from
  `components/AppShell.js` — a real, working, existing feature Melissa
  didn't know was there). Slack has no equivalent. Can't just reuse the
  website's `create_pair` database function — it identifies "who's
  doing this" from `auth.uid()`, which only exists in a browser session;
  Slack's handlers run as the service-role admin client with no such
  session (see the governance note in `web-app/CLAUDE.md` about why
  Slack handlers can't lean on auth the way the website does). Needs a
  new, separate database function written with the same identity-safety
  care as everything else here. Scoped to be built alongside the
  pairing close-out above, since they're two halves of the same "starts
  fresh with someone new" story.


## What's actually left, total (as of 2026-08-31, night)

**The original scoped work is done.** Everything that was on this list at
the start of tonight — all six Slack-presence features, the multi-pair
switcher, password sign-in, the two small deployed fixes, cold-start,
uninstall logging — is built, live-tested, and running in production.
That's not "still in progress," that's finished.

**Update 2026-09-01 (morning): both remaining items are now closed.**

1. ~~**Get tonight's code into git**~~ **Done, 2026-09-01.** iCloud
   finished syncing overnight on its own. It left one artifact behind:
   while stuck, iCloud's conflict handling had renamed `index.html` →
   `index-3.html` and `web-app/CLAUDE.md` → `web-app/CLAUDE-3.md` (both
   byte-identical to what was already committed — verified with `diff`
   against `git show HEAD:`). Renamed back, then committed everything
   from 2026-08-31 as `677fc00` and pushed. **Repo moved out of iCloud
   the same afternoon (2026-09-01):** now lives at `~/Code/performance`,
   so the conflict-rename problem can't recur. Deploys run from
   `~/Code/performance/web-app`.
2. ~~**Item 0f — missing fields on Slack's add-forms**~~ **Done,
   2026-09-01 — built, code-verified, NOT yet deployed or live-tested.**
   Two of the five pieces turned out not to be real gaps once checked
   against the website code (not the old note):
   - **Goals — nothing to build.** `measure` was already in Slack's
     `addGoalModal`; and owner is deliberately always the employee on
     *both* surfaces (`goals/page.js` line ~85 says so in a comment, and
     `SUBMISSIONS.add_goal` already does the same) — the website never
     lets either side pick. The old note's "lets either side pick" was
     wrong.
   - **Topics notes — not an add-form field on the website either.** It's
     a separate "add a note after the conversation" modal opened from the
     topic list (`openNoteModal`/`setTopicNotes`), so there's no add-form
     parity gap. A "Note" button on Slack's topics list would be new
     scope (~15 min), not parity — skipped, say so if wanted.
   - **Dev plans — built.** `addDevPlanModal` now takes `ctx` (so the
     support field's label can name the actual manager, same as the
     website's "What {managerName} will do to support this") and gained
     `why`, `support`, and `measure` ("How we'll know it worked"), all
     optional, all wired through the `_v2` draft scheme (`DEVPLAN_FIELDS`
     extended so Save-draft carries them). `SUBMISSIONS.add_devplan`
     passes all three to `saveDevelopmentPlan`.
   - **Actions — built.** `notes` (multiline, optional) added to both
     `addActionModal` and `editActionModal`; `add_action` and
     `edit_action` now save it (the edit handler used to preserve the
     old notes untouched because there was no field — now it reads the
     field).
   - **Wrap-up — built.** `wrapUpModal` gained "Topics to revisit next
     time", the Start/Stop/Continue trio (with the website's "the only
     rating here" context line), "Next conversation" (date), and the
     90-day check-in date. `wrap_up` handler: `meeting_time` is taken
     from `ctx.pair.next_1on1_time` exactly like the website (it's not a
     form field there either); a chosen "Next conversation" date updates
     `pairs.next_1on1_date` via `updatePair`, matching the website; and
     it now rejects a submission with neither "discussed" nor "agreed"
     filled (field-level error on "discussed"), matching the website's
     alert.

   **Verified:** `node --check` clean on both changed files; `npm test`
   7/7 unchanged after each piece; each changed modal render-tested with
   a mock manager and mock employee ctx (no duplicate `block_id`s, `_v2`
   draft path carries the new fields, support label names the manager
   from both sides, edit-action pre-fills existing notes); **`npm run
   lint` and `npm run build` both actually ran this morning** (sandbox
   network was fine for once) — lint 34 errors, all the pre-existing
   baseline, none in the two changed files; build clean.
   **Live-tested in real Slack, 2026-09-01 (two `vercel --prod` runs by
   Melissa), every write read back from Supabase by id, not just trusted
   from the screen:**
   - Add a development plan: all three new fields rendered (support label
     correctly named the manager) and `why`/`support`/`measure` landed in
     the row.
   - Add an action with notes: `notes` landed in the row.
   - Edit an action: **found a real bug on the first pass** — the edit
     opener (`action_edit` in `interactivity/route.js`) fetched every
     column except `notes`, so the new Notes field opened empty and
     "Save changes" would have overwritten real notes with blank. Fixed
     (`25b0c3e`), redeployed, re-tested: Notes pre-fills, and changing it
     persisted (`"original notes"` → `"EDITED notes"` in the row).
   - Wrap-up: revisit, start/stop/keep, and the 90-day date all landed in
     the `meetings` row; picking "Next conversation" updated
     `pairs.next_1on1_date`; submitting with neither discussed nor agreed
     showed the error on the "discussed" field. **Second small find:** the
     Home tab republished right after the wrap-up still showed "Next 1:1:
     not scheduled" because `ctx.pair` was loaded before `updatePair` ran.
     Fixed (`4871380`) the same way `edit_name` already handles it —
     **re-tested live the same afternoon:** a wrap-up with "Next
     conversation" = 2026-09-15 came back to a Home tab already reading
     "Next 1:1: 2026-09-15", with the `meetings` row and
     `pairs.next_1on1_date` both read back from Supabase.
   - **Save-draft → reopen on the dev-plan modal — verified live the same
     afternoon:** Area + "Why it matters" saved as a draft (`form_drafts`
     row read back with `why` in the JSON), modal cancelled, "Add a plan"
     clicked again, both fields pre-filled on the fresh modal.
   - All test rows deleted afterwards (meeting, draft, and the earlier
     action/dev-plan rows) and the pair's `next_1on1_date` restored to
     null (it was null before). Nothing left behind.
   - Also seen twice during testing, pre-existing and unrelated to 0f: a
     submission on a freshly-deployed (cold) instance hit Slack's 3s limit
     and showed "We had some trouble connecting" even though the row saved
     — the item-5 cold-start problem, which the keep-warm cron (pushed to
     GitHub only this morning) should reduce now that it's actually
     running.

   **False alarm, 2026-09-01 afternoon, worth knowing about:** for about
   an hour every modal opener looked stuck on "Loading…" in production.
   An hour of digging (Vercel logs, proxy, database timing, even a
   rewrite of `openDeferred` to not use `after()` — deployed once, then
   reverted, git is unchanged) ended with `document.hidden === true`: the
   Chrome tab running Slack was behind another window, and Slack's web
   client paints modal updates one step late in a hidden tab. The server
   had filled every modal in correctly the whole time. The moment the tab
   was brought to the front, everything rendered. Nothing in the app was
   wrong. Production currently runs the inline-swap variant of
   `openDeferred` (same behavior); the next `vercel --prod` puts the
   committed `after()` version back.

   **Testing note for whoever drives Slack via browser automation next:**
   Slack's web client doesn't register text typed by the automation into
   a modal field until the field gets a real keystroke afterwards — every
   required field showed "Please complete this required field" over
   visibly-filled text. What worked, every time: click the field, `End`,
   type ` x`, `Backspace` ×2, then click Save (clears the error), then
   click Save again (submits). Also: never click Save a third time after
   "trouble connecting" — the row usually already saved and a retry
   duplicates it. Check the database instead. **And keep the Chrome
   window with Slack in front** — in a hidden tab (`document.hidden`
   true) modals sit on "Loading…" forever and every reading tool lags one
   update behind; that is the tab, not the app.

**Nothing else is open.** If it feels like this has been going longer than
expected, that's tonight's actual list being larger than a normal
session (six new features plus two real bugs found and fixed along the
way) — not scope creeping past what was asked.

## Session closeout (2026-08-31, night)

**Everything planned for tonight is built, verified, and deployed to
production. Not yet committed to git** — see the note below, this is a
real gap, not a formality. Full detail for each piece is in the
2026-08-31 entries below — this is just the map.

**Shipped and live-tested in real Slack tonight:**
1. The two small fixes held back from last night (rate-limit backoff,
   handbook links) — deployed and confirmed live.
2. The multi-pair switcher, tested for real on both website and Slack —
   found and fixed a genuine Slack Block Kit bug in the process (see item
   2 below).
3. Password sign-in, all four paths (signup, sign-out/back-in, wrong
   password, forgot-password) — found and fixed a real signup bug along
   the way (see item 4 below).
4. All six Slack-presence features (career conversations, concerns
   tracker, documents, quick-notes/"Hard conversation", and custom
   suggestions) — built, deployed, and clicked through live in Slack, one
   at a time, each verified against the real website behavior first.
5. The Slack-parity live-testing pass (Actions Edit/Delete, Topics
   Delete, Dev plans Delete, Achievements Delete) — all five clicked
   through live, no bugs found, all throwaway test rows cleaned up after.
6. Cold-start keep-warm (via GitHub Actions, not Vercel Cron — see item 5
   below for why) and uninstall-event logging.

**Deployed to production tonight (confirmed via a real `vercel --prod`
run, "Ready in 23s") but NOT yet committed to git.** Items #4, #5, #6
above only exist on this Mac's local disk and on Vercel's production
servers right now, not in the GitHub repo.

**Tried tonight, in order, to get the commit through:**
1. `git commit` — failed: `fatal: could not open '.git/COMMIT_EDITMSG':
   Operation timed out`. Reproduced identically in Claude Code's own
   sandbox first (ruled out as just a sandbox issue).
2. Retried `git commit` in a real Terminal on this Mac — same exact
   error. Confirms it's a real issue on this machine, not the sandbox.
3. Diagnosed the likely cause: this repo lives inside `~/Documents`,
   which syncs via iCloud Drive. Checked System Settings → Apple ID →
   iCloud → iCloud Drive → "Desktop & Documents Folders" — **confirmed
   ON** (the switch is blue).
4. Checked Finder: the `performance` folder itself showed a cloud-with-
   down-arrow icon — confirmed **not fully downloaded** to this Mac,
   still a cloud placeholder. This is the actual root cause: git tries to
   open a `.git` file that iCloud hasn't finished bringing down locally,
   and times out waiting.
5. Right-clicked the folder → "Download Now" to force it to finish —
   **stuck, not progressing.** Stopped here for the night rather than
   keep troubleshooting iCloud itself.

**Two ways to actually fix this, next time:**
- **Simplest: just retry "Download Now" later.** iCloud sync issues are
  often transient (network hiccup, iCloud servers momentarily backed up) —
  a fresh attempt in the morning may just work. Then rerun the three
  commands (`git add ...`, `git commit -m "..."`, `git push`) — Claude can
  regenerate the exact command list.
- **More permanent: move this repo out of the iCloud-synced folder.**
  E.g. `~/Projects/performance` instead of `~/Documents/performance` —
  git and other dev tools generally don't play well with iCloud's
  on-demand-download files, so this prevents the problem recurring on any
  future commit, not just tonight's. Bigger one-time change (needs
  updating any saved terminal shortcuts/muscle memory for the path), so
  worth doing deliberately, not as a rushed fix.

Nothing is at risk in the meantime beyond the usual "uncommitted work
only exists on one machine" risk — production itself is fine and already
running tonight's code.

**Verified before committing, so this shouldn't break tomorrow:**
`node --check` clean on every changed file, `npm test` 7/7 passing
(unchanged test count — nothing in tonight's work touches
`resolveSlackUser`, which is all the suite covers), `git diff` reviewed
file-by-file for stray debug code or unrelated changes (none found).
**Still true, and still a real gap, not fixed tonight:** `npm run lint`
and `npm run build` cannot run in this sandbox (a network-timeout issue
in the environment itself, present every session this week, not caused
by tonight's code) — Vercel's own remote build is what actually proves
the code compiles, which is why nothing gets marked "done" here until
it's deployed and clicked through live, not just committed.

**What's actually left — one item, scoped and sized just now (checked
against the live schema and both website and Slack code, not
estimated from memory):**

**Item 0f — Slack's add-forms are missing several fields the website
version has.** Confirmed still real by comparing the actual field lists
tonight, not trusting the old note:
- **Goals** — Slack's `addGoalModal` has only "Goal" and "Why it
  matters." Missing: **owner** (website defaults it to the employee but
  lets either side pick — same `staticSelect` pattern already used for
  Actions' owner field) and **measure** ("How you'll know it's met").
  **~20-25 min.**
- **Development plans** — Slack's `addDevPlanModal` has Area/Type/
  Activity/Target. Missing: **measure** ("How we'll know it worked") and
  **support** (what help is needed). **~15-20 min.**
- **Actions** — Slack's `addActionModal` already has Action/Owner/Due
  date (this part of the old note was stale — owner's already there).
  Missing: **notes** (a free-text field the website's action rows carry
  and display, `actions.notes` in the schema). **~10 min.**
- **Topics** — `topics.notes` is a real column in the schema, separate
  from "why," not exposed anywhere in Slack's add or edit topic modals.
  **~10 min.**
- **Wrap-up** — the biggest gap. Slack's `wrapUpModal` only has meeting
  date, what you discussed, what you agreed, and topics covered. The
  `meetings` table has six more real columns nothing in Slack touches:
  `meeting_time`, `revisit`, `start_line`/`stop_line`/`keep_line` (a
  keep/stop/start retro format), and `checkin90_date`. **~40-50 min** —
  more fields, and the start/stop/keep shape needs a little more layout
  thought than a flat field list.

**Total: roughly 1.5-2 hours for all of item 0f**, done one piece at a
time with a `node --check`/`npm test` pass after each, same rhythm as
every other feature this week. No open decisions block starting it —
unlike item 5 (cold-start) or item 3a (password sign-in) earlier this
week, nothing here needs a call from you first.


## Session closeout (2026-08-30)

**Shipped, deployed, and confirmed live — commit `0a616a0`, deployed via
`vercel --prod`, checked directly in real Slack and the real website after
deploy (not just trusted from a terminal message):**

1. **Goals content parity, from earlier in the day** (commits `d8e9413`,
   `eed4d7a`): manager-to-employee-only ownership, the suggested-goals
   picker, SMART-goals guidance verbatim between website and Slack; Slack
   delete for all five kinds (Topics, Goals, Development plans, Actions,
   Achievements) plus edit for Goals and Actions, open to both partners.
   Goals Add → List → Edit → Delete live-tested end to end in real Slack.
   Actions Edit/Delete and Topics/Dev plans/Achievements Delete reuse the
   identical, already-proven `verifyOwnedRow`/`QUICK_ACTIONS`/`views.push`
   pattern — code-verified (lint/build/test/review), not yet individually
   clicked through live.

2. **Goal-suggestion dropdown fix.** Two distinct bugs, not one — Slack's
   75-character hard limit on option text, and separately its ~35-40
   character menu box that doesn't wrap. Fixed by decoupling the dropdown's
   short display label from the full sentence it inserts (`{text, label}`
   in `GOAL_SUGGESTIONS`) — Slack now shows a clean label, picking it still
   inserts the exact full sentence, verbatim, matching the website.

3. **Multi-pair support (item 2) — both database migrations, the website
   half, and the Slack half, all built and now live.**
   - *Database:* `0010_multi_pair.sql` (drops the old one-pairing-per-account
     indexes, replaces with one that only blocks pairing the same two
     people twice) and `0011_slack_pair_selection.sql` (new
     `slack_pair_selections` table for the Slack Home tab's "current pair"
     memory). Both run by hand in the Supabase SQL Editor, both verified
     directly against the live database afterward.
   - *Website:* `getMyPair` replaced by `listMyPairs`/`getPair`; a
     cookie-based pair switcher added to the dashboard topbar; a new
     `/onboarding/add` flow for creating a second pairing (didn't exist
     before). Confirmed live: dashboard loads clean, shows the new
     **"+ Add pairing"** button.
   - *Slack:* `resolveSlackUser`'s `{ ambiguous: true }` sentinel replaced
     by always resolving one real current pair plus a `pairs` list; Home
     tab gets the same switcher, wired to a new `switch_pair` handler with
     an ownership check (a selected pair id is verified against that
     Slack user's own `pairs` list before being saved — same rule as
     every other Slack write per `CLAUDE.md`). Confirmed live: Home tab
     reloads clean with real data, no crash, no leftover "not supported"
     message.
   - *Found along the way, already solved:* the open "what does a Slack
     ping say when a manager has 3 reports" question — checked, every ping
     already names the specific partner and is sent per-pairing, so this
     was never actually ambiguous. Closed, no code change needed.
   - *Caught before it shipped:* my first draft of `slack_pair_selections`
     didn't enable Row Level Security — reasoned "only the service-role
     client ever touches it" without noticing that leaves it reachable
     over Supabase's public REST API to anyone holding the project's
     public key. Supabase's own SQL Editor flagged it before she ran it.
     Fixed: RLS is on, no policies (service-role only, same as intended).

**Verified across all of the above:** `npm run lint` (34/34, same
pre-existing baseline all session, zero new errors), `npm run build`
clean, `npm test` (7/7, 2 new for the multi-pair selection logic).

**Not yet live-tested: the multi-pair switcher itself, on either
surface.** melissaw212's account only has one real pairing today, so
everything multi-pair-specific (the switcher, `/onboarding/add`, the
Slack `switch_pair` ownership check) has only been exercised through unit
tests and single-pair smoke tests — never actually clicked through with a
real second pairing.

**Also built and committed later the same night, after the scoping pass
below — verified, deliberately not deployed:**
- **Slack API rate-limit backoff** (`lib/slack-api.js`, commit `b351a87`) —
  a 429 now retries once (capped wait, can't blow the interactivity
  endpoint's 3s budget) instead of failing hard. Closes one of item 0h's
  two "worth doing" pieces.
- **Handbook links, view-only, on the Slack Home tab** (`lib/slack-views.js`,
  `app/api/slack/interactivity/route.js`, commit `b45f6e9`) — closes the
  simplest of item 0g's six features.
- Both held back from tonight's deploy on purpose, to avoid a second late-
  night trip to Terminal for two small fixes — see "what's left" below.

**Everything re-verified clean at the end of the night, nothing left
uncommitted:** `npm run lint` (34/34, same baseline all session), `npm run
build`, `npm test` (7/7), `git status` empty.

**What's left — in order:**
1. ~~**Deploy the two small fixes**~~ **Done, 2026-08-31 — deployed and
   live-confirmed.** Rate-limit backoff and handbook links both verified
   live in Slack (Home tab Handbook section renders, "View links" modal
   opens correctly).
2. ~~**Test the multi-pair switcher for real**~~ **Done, 2026-08-31 —
   tested on both surfaces, found and fixed a real bug.** Website switcher
   worked correctly first try (added a real second pairing via
   `/onboarding/add`, switched both directions, data updated correctly
   each time). Slack switcher was genuinely broken: clicking a new option
   in the Home tab's `switch_pair` select silently reverted on reload —
   root cause was the same Slack Block Kit staleness class documented
   above for `addTopicModal` (a `static_select` needs its `block_id` to
   change whenever the selection changes, or Slack's client can report a
   stale `selected_option`). Fixed by keying the switcher's `block_id` to
   `ctx.pairId` (`lib/slack-views.js`'s `actions()` helper gained an
   optional `blockId` param). Verified both directions, twice each, via
   fresh page reloads (not just client-side state) after deploy — a stray
   second Slack tab open in the same browser caused one false "still
   broken" reading during testing (its background `app_home_opened`
   events raced with the test) — closing it and retesting confirmed the
   fix is real. `npm test` 7/7 unchanged; lint/build couldn't run locally
   (sandbox network timeout on both `eslint` and `next build` binaries,
   unrelated to the change — Vercel's own build succeeded, which is what
   actually matters). One throwaway test pairing
   (`pp-switcher-test@example.com`) is left in the database under
   melissahr212@gmail.com's account — harmless, never signs in, not
   cleaned up.
3. ~~**Slack-parity live-testing.**~~ **Done, 2026-08-31 — all five clicked
   through live, no bugs found.** Topics Delete (deleted one of two test
   topics, list and count both updated correctly); Actions Edit (added a
   test action, edited its text, reopened Edit to confirm the new text
   persisted — not just a client-side echo); Actions Delete; Dev plans
   Delete; Achievements Delete (all three: added a throwaway row, deleted
   it via the list modal's Delete button, confirmed both the list and the
   Home tab count went back to zero/empty). Test rows created for this
   were all deleted as part of the test, nothing left behind.
4. ~~**Item 3a — password sign-in.**~~ **Done, 2026-08-31 — built, deployed,
   all four test paths verified live.** Decided 2026-08-30 (Melissa): add
   password sign-in as the everyday path instead of raising the magic-link
   rate limit ("I don't want anyone waiting for an email to send"). Magic
   link kept, not removed — demoted to a "Having trouble? Use a link
   instead" secondary option on `/login`.

   `app/login/page.js` rewritten with four modes (signin/signup/forgot/
   magiclink) sharing one card. `app/auth/callback/route.js` gained an
   optional `?next=` param (validated to a same-site relative path only —
   it's client-controlled via the URL, a trust boundary) so the reset-link
   email can land on the new `app/auth/reset-password/page.js` instead of
   always going to `/dashboard`.

   **Real bug found and fixed during testing, not caught by code review:**
   `supabase.auth.signUp()` didn't return a session immediately even
   though the account could sign in with that same password right away —
   Melissa's first live signup got a confusing "check your email" screen
   she didn't actually need to act on (confirmed by her manually signing
   in right after with no email click). Fixed: `signUp` now falls back to
   an immediate `signInWithPassword` call with the same credentials when
   no session comes back, only falling through to the "check your email"
   state if that fallback sign-in itself fails. This means the actual
   Supabase project setting (whether "Confirm email" is on) no longer
   matters for the happy path — signup goes straight to the dashboard
   either way.

   **All four paths live-verified in production, not just code-reviewed:**
   signup → instant dashboard (after the fallback fix); sign out → sign
   back in with password → dashboard; wrong password → clean "Wrong email
   or password." error, no crash; forgot-password → correctly triggers
   Supabase's reset flow (hit Supabase's own email rate limit on the test
   account from repeated test emails in one session — handled gracefully,
   not a bug, and won't happen under normal one-reset-at-a-time use).
   `npm test` 7/7 unchanged both times; lint/build still can't run locally
   (same sandbox binary-timeout issue noted in item 2, unrelated to this
   change) — Vercel's own build succeeded both deploys, which is the real
   signal. One test account (`swm3016@gmail.com`, display name "Password
   Test") is left in the database, paired with a placeholder manager email
   (`pp-password-test-partner@example.com`) that never signs in — both
   harmless, not cleaned up.
5. **Item 0g — DONE. All six Slack-presence features built, deployed, and
   live-tested in real Slack, 2026-08-31.** Career conversations, concerns
   tracker, documents, and quick-notes ("Hard conversation") all built
   matching their website counterparts' exact data flow (verified
   against the real source functions, not assumed from the earlier scoping
   note — one assumption in that note turned out wrong: quick-notes writes
   to `topics` via `addTopic`, not `messages` via `addMessage`; caught
   before building the wrong thing).
   - **Quick-notes / "Hard conversation"** — new Home tab button opens a
     4-field modal (Outcome/Facts/Their view/Ask), mirroring
     `SuggestionsCard.js`'s tool exactly. Writes a `submitted:true` topic,
     Slack-silent (no real DM), matching the website path precisely.
   - **Concerns tracker** — manager-only, read-only, gated both by hiding
     the Home tab button AND a server-side `ctx.isMgr` check in the opener
     (belt-and-suspenders, since a hidden button is still just UI). Shows
     all seven fields per entry.
   - **Documents** — view (with native Slack url-buttons, same pattern as
     Handbook links) + add-link only, no raw upload, matching the
     decision. `loadHomeData` (`lib/slack-home-data.js`) gained a
     `documents` key for this. No notification sent on add, on either
     surface — matches the website's own document-add flow, which doesn't
     notify either.
   - **Career conversations** — full diff-save across all role-specific
     prompts at once (update/insert/delete-when-blank), matching
     `career/page.js`'s `handleSave` exactly, not a naive per-field save.
     Answers are shown to both partners in the list modal (not redacted —
     matches the website: "Your manager sees these").
   - **Custom suggestions — built as its own "My suggestions" list-plus-add
     pair, not merged into the existing "Browse suggested topics" picker.**
     That picker (`suggested_pick` in `addTopicModal`) draws from the fixed
     `SUGGESTIONS` library and is a Block Kit `static_select` restricted to
     option-value pairs baked in at render time — merging in per-pair,
     user-generated custom suggestions would mean rebuilding it as a
     dynamic list and risking the same `static_select` staleness class
     already hit twice this session (the pair switcher, the
     suggestion/category "_v2" trick). A separate list modal
     (`listMySuggestionsModal`) sidesteps all of that and matches every
     other Slack feature's own established shape (list-modal-plus-button).
     Role-scoped both ways — `mySuggestionCategories(role)` for the "File
     it under" dropdown (the same `SUGGESTIONS[role]` keys the website's
     own "File it under" select uses, not `TOPIC_CATEGORIES`) and a
     server-side `row.role === ctx.role` check (not just `pair_id`) on
     both quick actions, since a saved suggestion belongs to one side of
     the pair, not the whole pair — matching the website's own
     `mine.filter(s => s.role === role)` gate. "Add to agenda"
     (`suggestion_add`) mirrors `addFromSuggestion`: creates a plain
     unsubmitted topic, no ping until Submit, same as adding one by hand.
     "Remove" (`suggestion_delete`) matches `removeCustomSuggestion`. The
     add-modal itself sends no notification either, matching
     `saveCustomSuggestion` exactly (a saved suggestion is a private
     note-to-self). `loadHomeData` (`lib/slack-home-data.js`) gained a
     `customSuggestions` key for this, same pattern as `documents`.
     `npm test` 7/7 unchanged; `node --check` clean on all three changed
     files. **Deployed and live-tested in real Slack:** "Write my own
     suggestion" saved with the correct role-scoped category ("Where
     things stand" for the manager role); "Add to agenda" created a real
     topic (Topics count 1→2) without deleting the saved suggestion
     (matches the website — a suggestion is reusable); "Remove" deleted it
     and the list correctly returned to its empty state.
   - Every feature above got `npm test` (7/7 unchanged) after each step;
     lint/build still can't run locally (same sandbox binary-timeout issue
     noted in item 2). Deployed via `vercel --prod`, then live-tested
     directly in real Slack (not just code-read): hard-conversation modal
     opened and saved (Topics count 0→1); career modal showed the correct
     manager-side prompts with the employee's name substituted in, saved,
     and "View career" read the saved answer back correctly; documents
     modal opened and saved (Documents count 0→1); concerns opened
     correctly showing the empty state (view-only, as built — no add-modal
     in Slack by design). **Not verified: whether the Slack DM
     notifications for hard-conversation (`kind: "oneOnOne"`) and career
     (`kind: "career"`) actually land in the *other* partner's Slack — no
     second Slack account was available to check this session. Worth a
     quick check next time two accounts are both open.**
   - **Item 5 (cold-start) and the uninstall-handling piece of 0h — both
     closed, 2026-08-31, committed but not yet deployed.** Item 0f
     (missing Slack add-form fields) is still untouched, not yet
     prioritized — genuinely unscoped, left for later.
     - **Cold-start keep-warm, built as a GitHub Actions cron, not Vercel
       Cron.** The scoping note's plan was a scheduled ping via Vercel
       Cron — checked (web search) before building and found Vercel's
       Hobby plan caps cron jobs to once a day, which would make a
       keep-warm ping useless (a submission can go cold at any point in
       the other 23+ hours) with no way to confirm from here which plan
       this project is on. `.github/workflows/keep-warm.yml` instead: a
       GitHub Actions schedule (`*/10 * * * *`) POSTs to the real
       `/api/slack/interactivity` endpoint every 10 minutes. The request
       carries no valid Slack signature, so it's always rejected with 401
       by `verifySlackSignature` before touching the database (see
       `app/api/slack/interactivity/route.js`) — harmless, and it's the
       right endpoint to ping since module load (not application logic)
       is most of a cold start's cost, so even a request that gets
       rejected immediately still pays for, and thus keeps warm, the same
       cold-start path a real submission would hit. Caveat, not glossed
       over: GitHub's own docs say scheduled workflow runs aren't
       precisely timed and can be delayed during high platform load, and
       a workflow with no other repo activity for 60 days gets
       auto-disabled — neither breaks anything, just worth knowing if
       cold starts come back after a long quiet stretch.
     - **Uninstall handling, the "just log it" version scoped in 0h.**
       `app/api/slack/events/route.js` gained a branch for
       `app_uninstalled`/`tokens_revoked` events, logging a greppable
       `[SLACK_APP_UNINSTALLED]` marker (same convention as
       `lib/slack-api.js`'s `[SLACK_INTEGRATION_DOWN]`) — no token
       revocation logic, since there's still no per-workspace token
       stored to revoke at today's single-workspace scale, exactly as
       scoped. **Won't actually fire yet**: Slack only sends these events
       to a Request URL if "App Uninstalled" and "Tokens Revoked" are
       checked under the app's Event Subscriptions → Subscribe to bot
       events config at api.slack.com/apps — that's a dashboard toggle,
       not something committable, and hasn't been confirmed on.
     - `node --check` clean, `npm test` 7/7 unchanged. **Neither piece
       deployed or live-tested yet** — the keep-warm cron needs nothing
       from `vercel --prod` (it just needs to exist in the repo and start
       firing on GitHub's own schedule), but the uninstall branch can't
       be verified live without also toggling the two event checkboxes in
       the Slack app config first.

## Scoped tonight (2026-08-30) — build plan for tomorrow
(two of these — the rate-limit backoff and handbook links — got built the
same night after scoping; see the "also built and committed" note above.
Everything else below is still just a plan.)

**3a. Password sign-in.** Supabase Auth already supports email+password
natively — this is UI + flow work, not a new auth provider. Needed:
- Sign-up: add a password field next to the existing name/role/partner
  fields, call `supabase.auth.signUp({ email, password })` instead of (or
  alongside) the magic-link `signInWithOtp` currently used.
- Sign-in: a real login form (email + password fields + submit) replacing
  today's email-only "send magic link" form as the default; magic link
  moves to a "having trouble? use a link instead" secondary option.
- Forgot-password flow — this one still needs an email, but it's a
  password-reset link, not a sign-in-blocking one, so the 2/hour cap
  matters far less here.
- Test: signup with password, sign out, sign back in with password, wrong
  password shows an error, forgot-password sends a working reset link.
**Estimate: ~2-3 hours** (new UI states, two new/changed forms, the reset
flow, and testing all four paths above) — sized against how long today's
comparably-scoped features (the pairing switcher, the add-pairing flow)
each took.

**0g. Slack presence for the six decided features** (career conversations,
concerns tracker, documents, handbook links, custom suggestions,
quick-notes/Hard Conversation) — each follows the same
list-modal-plus-button pattern every existing Slack feature already uses,
so risk is low, it's mostly volume:
- **Career conversations** — a view/add pair mirroring Topics: fixed
  prompts from `EMP_CAREER`/`MGR_CAREER` (`lib/career-content.js`), free-text
  answer per prompt, `career_answers` table. **~45-60 min.**
- **Concerns tracker — manager-only, read-only** (per the decision — not a
  new Slack write path). A list modal gated the same way other
  manager-only buttons already are, showing `concerns`' seven fields per
  entry. **~30-45 min** (more fields to lay out, but no save logic).
- **Documents — view + add-link only, no raw upload** (per the decision).
  A list modal (name + open-in-app link) and an add modal (name + url) —
  `addDocumentLink`, not `uploadDocument`. **~30-40 min.**
- ~~**Handbook links — view only.**~~ **Done, 2026-08-30 night — built,
  verified, not yet deployed.** New "Handbook" section on the Home tab
  (`open_list_handbook`) opens `listHandbookLinksModal` — one row per
  link with an Open button (Slack's native url-button, no round trip
  through the interactivity endpoint needed to follow it), plus a link
  back to the app for adding/editing. `npm run lint` (34/34, same
  baseline), `npm run build`, `npm test` (7/7) all clean; committed
  (`b45f6e9`). Not deployed tonight, same reasoning as the rate-limit fix
  above — bundled into tomorrow's batch.
- **Custom suggestions — save/delete.** Scope isn't fully nailed down yet
  — need to look at how `custom_suggestions` is actually surfaced on the
  website (`listCustomSuggestions`/`addCustomSuggestion`/
  `deleteCustomSuggestion`, `lib/data.js`) before sizing this one for
  real; it may turn out to integrate into the existing topic-suggestion
  picker rather than needing its own modal. **~30-45 min, less certain
  than the others.**
- **Quick-notes "Hard Conversation" capture.** One add modal (kind + free
  text) writing to `messages` via `addMessage`, mirroring
  `addFromHardConvo`. **~30-45 min.**
**Subtotal: roughly 3-4 hours for all six**, done one at a time with a
lint/build/test pass after each, matching how tonight's work went.

**0h. Two pieces worth doing, one worth explicitly skipping for now.**
Confirmed still accurate by re-reading the current code tonight — nothing
here has changed since the 2026-08-29 audit:
- ~~**Rate-limit backoff in `slackApi()`**~~ **Done, 2026-08-30 night —
  built, verified, not yet deployed.** A 429 now retries once, waiting up
  to `Retry-After` seconds (capped at 1.5s so it can't blow the
  interactivity endpoint's 3s response budget) before giving up the old
  way. `npm run lint` (34/34, same baseline), `npm run build`, `npm test`
  (7/7) all clean; committed (`b351a87`). **Deliberately not deployed
  tonight** — bundled into tomorrow's `vercel --prod` with everything
  else, rather than a separate late-night trip to Terminal for one small
  fix.
- ~~**`app_uninstalled`/`tokens_revoked` handling**~~ **Done, 2026-08-31 —
  see item 5 in "What's left" above for the full writeup.** `events/route.js`
  now logs a greppable marker on both event types instead of silently
  ignoring them, "log it" not "revoke a stored token" exactly as scoped
  here. Won't actually fire until the two event checkboxes are turned on
  in the Slack app's own dashboard config, separate from anything
  committable.
- **Skip for now: the OAuth/multi-workspace install flow.** This is
  genuinely big — new schema fields, an `oauth.v2.access` call, a Slack
  app manifest — and only matters if the Marketplace-listing goal is being
  pursued soon. Not sized here; deserves its own scoping session if/when
  that goal moves up.

**5. Cold-start submission timeout.** ~~Needs one decision, then a small
build.~~ **Done, 2026-08-31 — see item 5 in "What's left" above for the
full writeup, including why this ended up on GitHub Actions instead of
the Vercel Cron this section originally planned.** Two real options,
re-confirmed against the current code tonight:
- **Keep the function warm** — a scheduled ping (Vercel Cron hitting a
  tiny keep-alive route every few minutes) so a real submission rarely
  hits a cold start at all. Lower risk: no change to validation behavior,
  just infrastructure. **~20-30 min**, plus a small ongoing cron running
  forever.
- **Respond immediately, move the save into `after()`** — only safe for
  submission kinds that never return `response_action: "errors"` (true for
  `add_goal`, not `add_action`/`add_topic`), since Slack needs the
  synchronous response to know whether to show a field error. More
  surgical, but per-kind, and gives up server-side validation on the ones
  it applies to. **~30-45 min**, plus the ongoing cost of one exception to
  reason about later.
**My read:** keep-warm is the safer default — it fixes the "error shown
over work that actually saved" annoyance for every submission kind at
once, with no validation tradeoff. Worth confirming with you before
building either way.

See item 2 below for the full multi-pair writeup — how pairing works, the
label-problem risk, and everything else that went into today's build.

## Session closeout (2026-08-29, night)

**Code:** all of tonight's fixes (RLS, save-draft generalization, feedback
fulfillment, topic submit/ping decoupling, plus the 4-bug code-review fix
pass) are committed and pushed to `main` — commits `f2a7d41` and `2983731`.

**Database:** migrations `0007_role_scoped_rls.sql`,
`0008_notification_entity_id.sql`, and `0009_topic_submit_flag.sql` were
run by hand in the Supabase SQL editor tonight and all three returned
Success — the database is current.

**Deploy — the one real gap found tonight, now documented permanently in
`CLAUDE.md`:** pushing to GitHub does not deploy this app. There's no
GitHub→Vercel webhook wired up here; every prior deployment was a manual
`vercel --prod` run, and tonight's two pushes sat un-deployed for hours
before this was caught by testing live in Slack (a real Slack DM fired
immediately on adding a test topic — the exact old behavior item 0 was
supposed to remove — and the deployed `lib/data.js` was confirmed, by
reading it directly in the Vercel dashboard, to not contain any of
tonight's code). Melissa ran `vercel --prod` herself from a terminal
(Claude Code's sandbox correctly blocks running production deploys
directly) — deploy succeeded, "Ready in 24s."

**Confirmed live after the deploy, from three independent sources, not
just a claim:** added a fresh test topic in Slack (`TEST verifying
submit/ping decoupling deploy - safe to delete`, under "Wins" — still
sitting in the real Topics list, harmless, delete or ignore whenever) —
it showed "not yet submitted" and a Submit button, exactly as item 0
intends. Clicking Submit made both disappear. Cross-checked against the
Vercel function logs for that click (`/api/slack/notify`, 21:31:20,
called `slack.com/api/chat.postMessage`, 200) and directly against the
`notifications` table (`select ... from notifications order by
created_at desc` — top row timestamped `2026-08-30 01:31:20.73+00`,
matching the server log to the second). The Slack **client** never
rendered the resulting DM in this session (its own message list got
stuck mid-load) — that's Slack's web client being flaky, the same
intermittent-drop behavior already documented elsewhere in this file,
not a bug in this app. All three checks agree: the fix is really live.

**Also reconfirmed clean:** `npm run lint` (34/34, same baseline),
`npm test` (5/5), and `npm run build` all pass after the final deploy —
no errors left in the code from tonight's work.

**Next actual priority:** the four decisions made tonight but not yet
built — Goals+Actions de-redaction (item 0b), Slack delete (item 0c),
edit for Goals/Dev plans/Actions (item 0d, unblocked, follows 0b's
scope), and Slack presence for all six website-only features (item 0g).
See those items below for the recorded decisions. Also still open:
0k/0l/0m (new findings from tonight's code-review pass, see Done section
for detail) and everything already listed under "Still open" below that
predates tonight.

## Where things stand (2026-08-29, afternoon)

**App/website, big picture:** one Next.js app (`web-app/`) serves both the
website (`app/(dashboard)/*`) and the Slack integration (`app/api/slack/*`,
`lib/slack-*.js`) — same Supabase tables, no separate sync needed. Real
Slack DM pings and full in-Slack interactivity (Home tab, add/view modals,
quick actions) have been live in production since 2026-08-26. `slack-app/`
in the repo root is an old, never-installed prototype — "the app" always
means `web-app/`.

**Committed and pushed to GitHub (`performance-pulse/main`) as of this
session** — five commits, `cbba37e` through `cd8e7d9` (`git log` for the
full list — don't hardcode a commit list here again, it'll go stale the
same way this line just did):
- Case-insensitive email matching (citext) for invite/pairing lookups, and
  a guard + website notice for accounts on more than one pair (middle
  managers, multi-report managers) instead of the app silently guessing.
- Topic editing after adding, creator-only, on both website and Slack.
- Slack's "Add a topic" text field is now genuinely required (Slack's own
  client blocks empty submission) instead of erroring after the fact, and
  picking a suggestion correctly fills in the required fields — this took
  three separate real Slack Block Kit platform bugs to track down (a
  select inside an "input" block never fires `block_actions` at all; and
  twice more, `views.update` on an already-open modal doesn't reliably
  register a new value under an unchanged block_id for either a
  `static_select` or a `plain_text_input` — the text case is the scary
  one: it visibly showed the right text while silently submitting empty,
  only caught by checking the database, not the screen). Full technical
  writeup in the Done section below if picking this pattern up again.
- Home tab: "Add a topic" is now the highlighted button instead of "Wrap
  up a 1:1."
- SLACK_TODO.md itself rewritten with this summary, and then audited
  end-to-end against the actual codebase (every `lib/*.js`, every
  `app/(dashboard)/*` page, the full `supabase/schema.sql`) so nothing
  real is missing from it — see the new items 0c through 0g below,
  none of which existed anywhere in this file before today.

**A note on the lint-error count** appearing throughout this file at
different numbers (1, 16, 34 depending on the date) — that's real growth
over time, not a contradiction between entries: each entry recorded the
actual count *at that time*, and more `react-hooks/set-state-in-effect`
violations accumulated in untouched code as the app grew. **Current
baseline, confirmed by actually running `npm run lint` on 2026-08-29: 34
errors, all pre-existing, none introduced by anything in this file's Done
section.** Trust a fresh lint run over any number written down here.

**A note on "verified" claims below that describe test cases** ("9
grouping cases pass," "10 notification cases pass," etc.) — confirmed on
today's audit by actually running `npm test`: the only thing that command
executes is `test/slack-user.test.mjs`, 5 tests, all pinning
`resolveSlackUser`'s branches (that part of every "tests 5/5" claim in
this file checks out exactly). The batching/grouping/category-mismatch
verifications described elsewhere were real, one-off manual checks at the
time, not regression tests — nothing enforces they still pass today. Read
those as "confirmed once," not "covered by the test suite."

**Open items, not started, in the order they'd probably matter most —
full detail for each is in "Still open" below, this is just the map. Three
background agents did real, committed work in a later 2026-08-29 session
(commit `f2a7d41`) closing items 0, 0e, and 0i, and partially closing 0h —
see the Done section for full detail; the map below reflects that:**
- **0 — DONE.** Topic submit/ping decoupling, scoped to Topics only per
  Melissa's decision. See Done section.
- **0b — Goals, and every kind except Topics, redact real content in
  Slack's list views**, down to exactly which fields are shown vs. hidden
  per kind (Goals/Dev plans/Achievements/Feedback/Actions/Last meeting).
  Melissa: "making sure when you're in Slack, the goals, it doesn't make
  you open the app." **Decided:** Goals + Actions get matched to Topics'
  behavior (not all six, not just Goals). Not yet built.
- **0c — Slack has no delete, for any kind, ever.** Not previously
  flagged; found on today's audit. **Decided:** yes, add delete, for the
  same kinds the website supports it for (topics, goals, dev plans,
  actions, achievements). Not yet built.
- **0d — Slack has no edit for Goals/Dev plans/Actions**, only Topics.
  Found on today's audit. Now unblocked by 0b's decision — should follow
  the same two kinds (Goals + Actions) unless Melissa says otherwise. Not
  yet built.
- **0e — DONE.** Feedback requests can now be fulfilled from Slack
  end-to-end (answer + close, atomically). See Done section.
- **0f — every Slack add-form is missing fields** the website version has
  (owner on Goals, measure on Dev plans, notes on Actions, most of
  wrap-up, topic notes). Found on today's audit. Not yet built.
- **0g — several whole website features have zero Slack presence** and
  were never mentioned in this file before today (career conversations,
  concerns tracker, documents, handbook links, custom suggestions, the
  quick-notes tool). **Decided:** all six get some Slack presence (see
  item 0g for the per-feature shape); documents' view-vs-upload question
  is still an open sub-question. Not yet built.
- **0h — PARTIALLY DONE.** The Slack integration's own plumbing had real,
  undocumented gaps a feature-comparison lens can't see. The two
  cheap/high-value sub-items — env vars now documented in
  `.env.local.example`, and a greppable `[SLACK_INTEGRATION_DOWN]` log
  marker on Slack API failures — are done (see Done section). Still open,
  untouched: rate-limit handling, the OAuth/multi-workspace install flow,
  `app_uninstalled`/`tokens_revoked` handling, and idempotency protection
  on `view_submission`.
- **0i — DONE.** RLS role-scoping fix for `concerns`/`review_drafts`/
  `form_drafts`, closing both the IDOR-style gap and a live leak on
  `/history`/`/dashboard`/`/export`. See Done section. **Caveat: not yet
  confirmed applied to the live database** — the migration was handed to
  Melissa to run by hand; confirm with her.
- **0j — a full `/code-review` of today's session found and fixed two
  more real bugs** (a dropped validation that could create a blank
  topic; a bug that silently erased typed text when switching topic
  suggestions). Its biggest documented-but-unfixed issue — the same
  "field looks right, saves empty" bug fixed for Topics also threatening
  Goals/Dev plans/Achievements/Feedback's "Save draft" button — is now
  **done** too (see Done section). New follow-up gaps found while doing
  that work: **0k** (two more missing-pair_id-check instances,
  `topic_mark_discussed`/`action_mark_done`), **0l** (website Prepare-tab
  reader doesn't know the new shared `_v2` draft-key scheme), **0m** (a
  naming-collision note, not a bug).

**Also fixed this session, in `Done` below:** two IDOR (broken
authorization) bugs that let a Slack action touch a *different pair's*
topic data entirely — not a privacy-model tradeoff, a real bug, since
those two handlers ran on the database's admin client, which bypasses the
"is a pair member" protection completely. A permanent rule is now in
`web-app/CLAUDE.md` so this can't quietly repeat when Goals/Dev
plans/Actions get edit or delete added later.

**Below this section:** a long chronological log (oldest fixes moved into
Done, open work in "Still open, in priority order") kept for detail and
citations — this new section is the one to read first, the log below is
for when you need the specifics of something already summarized above.

**Full file/table inventory, for completeness — not action items, just so
nothing in the codebase is unaccounted for in this document.** These exist,
work, are fine as-is, and just hadn't been named anywhere in this file
before today's audit:
- `lib/development-content.js` (dev-plan types/ideas/keyword-matching
  rules), `lib/export-builders.js` (all Export-tab document/spreadsheet
  generation), `lib/badges.js` (status→badge-color mappings),
  `lib/one-on-one-content.js` (source of `SUGGESTIONS`/`TOPIC_CATEGORIES`,
  referenced conceptually elsewhere but never by filename),
  `lib/slack-home-data.js` (the shared `loadHomeData` helper every Slack
  view reads from).
- `pairs.hr_email`, `pairs.assist_enabled`, `pairs.how_to_hidden`
  (`supabase/schema.sql`) — an HR-export contact address, a coaching-nudge
  toggle, and a dismissible how-to banner flag. No open question attached
  to any of the three, just noting they exist.
- `meetings.meeting_time`, `revisit`, `start_line`/`stop_line`/
  `keep_line`, `checkin90_date`, `topics_snapshot` — the fuller wrap-up
  fields item 0f above already covers as a Slack-parity gap; listed here
  too since the audit that found them was reading the schema directly.

Done:

- **Full `/code-review` of the five fixes above (item 0/0e/0h/0i/0j-save-draft),
  2026-08-29 later session — found and fixed 4 real bugs before any of it
  shipped further, plus one accurate-scope correction.** Melissa asked to
  make sure there were no bugs before continuing. 8 finder angles + 2
  adversarial verify passes on the uncertain ones found:
  1. **Requester could answer their own feedback request in Slack**
     (`lib/slack-views.js`'s `listFeedbackModal` rendered "Answer" on every
     open request with no role check — the website's `forMe` gate had no
     Slack equivalent). Fixed: `listFeedbackModal` now takes `viewerRole`
     and omits "Answer" when `r.from_role === viewerRole`; the same
     `from_role !== ctx.role` check is now also a hard server-side guard
     (not just a hidden button) in `open_answer_feedback_request`,
     `feedback_request_answer`, and `SUBMISSIONS.add_feedback`.
  2. **Hard-Conversation quick-notes topics could still trigger a delayed
     real Slack DM** — `addFromHardConvo` was deliberately silent on
     creation (no "topic" kind on its own `notify()` call) but the topic
     still got `submitted_at = null` like any other, so it showed the new
     Submit button and clicking it later fired a real DM anyway, defeating
     the original silent-by-design intent. Fixed: `addTopic` gained an
     optional `submitted` flag; `addFromHardConvo` now passes
     `submitted: true` so it's fully exempt, not just at creation.
  3. **`submitTopic` had a check-then-act double-submit race** (read
     `submitted_at`, then unconditional update — two near-simultaneous
     calls could both pass the check before either write landed, causing a
     duplicate Slack DM). Fixed: now one atomic
     `.update(...).eq("id", id).is("submitted_at", null).select(...)` —
     no separate read, no race window.
  4. **Feedback-answer flow was missing a status check and had no
     idempotency guard** — `SUBMISSIONS.add_feedback` checked only
     `pair_id`, not whether the request was still open, and
     `setFeedbackRequestStatus` had no guard against re-closing an
     already-closed request. Fixed: `add_feedback` now requires
     `status === "open"` via the same ownership check; the status update
     is now conditioned on `.neq("status", status)` so a retried/duplicate
     submission can't double-write or double-log.

  **Also extracted, not just patched:** a new shared
  `verifyOwnedRow(admin, table, columns, id, ctx, extraCheck)` helper in
  `app/api/slack/interactivity/route.js`, applied to the four handlers
  touched above — the review found the pair_id-ownership check (the exact
  pattern CLAUDE.md's governance rule targets) had been hand-copied into 7
  separate places across today's earlier work. Pre-existing inline checks
  (`feedback_request_answered`, `edit_topic`, `topic_edit`) were left as-is
  — not re-touched, to keep this pass scoped to what needed fixing, not a
  full refactor.

  **Correction, not a bug:** the RLS fix's own migration comment
  (`0007_role_scoped_rls.sql`) claimed "no employee-facing behavior
  changes" for the `concerns` lockdown — true only for the Performance
  page's `mgrOnly` tab. The review found `listConcerns()` is also called
  unconditionally from `/dashboard`, `/history`, and `/export`, and
  `buildHistory()` turned each concern into a real-text timeline entry
  with no role gate — meaning an employee could already see a manager's
  private concern text on those three surfaces before this fix, not just
  via browser console. The RLS fix closes that too, as a side effect, with
  no code change needed — but it's a bigger, previously-undocumented leak
  than the migration comment states. Worth confirming with Melissa that
  nothing relied on concerns appearing in the shared timeline/export
  before treating this as fully understood.

  **Flagged, not fixed (lower severity, real):** `submitTopic` still has
  no server-side `created_by_role` check on the website path (Slack path
  checks it externally in `topic_submit`; website relies on the button
  being hidden) — same accepted-risk shape as `updateTopic`'s pre-existing,
  documented gap, not a new regression. `is_pair_manager`/`is_own_role_row`
  are defined identically in both `schema.sql` and the migration file with
  no single source of truth. A few small efficiency/duplication nits
  (an extra SELECT on `topic_submit`, a copy-pasted `fieldBlockId` closure
  across all five add-modals) were also found and left as-is — cleanup,
  not bugs.

  **Verified:** lint 34/34 unchanged, tests 5/5 unchanged, `node --check`
  clean on all changed files, `listFeedbackModal`'s actual rendered output
  spot-checked for both an employee and manager viewer against mock
  requests (Answer button present/absent exactly as intended) and both
  resulting view JSON payloads validated via Slack's `blocks.validate`
  API. **Not verified:** no live Supabase/Slack available — the atomic
  update, the `.neq` idempotency guard, and all new role/status branching
  were traced by hand against the schema and existing call sites, not
  exercised against a real database or workspace.

- **Topic submit/ping decoupling — item 0, closed, scoped to Topics only
  (per Melissa's decision), 2026-08-29 later session.** New migration
  `supabase/migrations/0009_topic_submit_flag.sql` adds `topics.submitted_at`
  (nullable timestamptz), backfilled to `submitted_at = created_at` for
  every pre-existing topic — a deliberate choice over leaving old topics
  null, which was the other candidate, rejected as a confusing regression
  for existing data.

  **Real finding that changed the originally-guessed mechanism:** there was
  never a DB trigger firing notifications on topic INSERT —
  `notify_slack_on_notification()` (migration 0005) fires on inserts into
  the `notifications` table itself, and every `notifications` row is an
  explicit app-code call to `lib/data.js`'s `notify()` right after a
  mutation. So the actual fix is gating that `notify()` call site (in
  `add_topic`'s Slack handler and the website's add-topic flow), not
  editing SQL trigger logic — no trigger function was changed.

  New `submitTopic(supabase, id, ctx)` in `lib/data.js` is idempotent
  (no-ops if already submitted). Website: `components/one-on-one/TopicList.js`
  gained a creator-gated "Submit" button + "Not submitted" badge, mirroring
  the existing Edit gate; the dead `queueTopicNotify`/`flushTopicNotify`
  batching (whose whole job was the ping-on-add this removes) was deleted
  from `app/(dashboard)/one-on-one/page.js`. Slack: `listTopicsModal` gained
  a matching creator-gated Submit button; a new `topic_submit` quick action
  in `app/api/slack/interactivity/route.js` checks `pair_id` +
  `created_by_role` + not-already-submitted before calling `submitTopic`,
  mirroring `topic_edit`'s ownership-check pattern.

  Verified: lint 34/34 baseline unchanged, tests 5/5, confirmed by an
  independent review pass after this phase. No live Supabase/Slack
  available for this pass — the migration has not been applied to the live
  database yet (see item 0i entry below on the same point) and the live
  Slack DM/button behavior has not been re-verified against a real
  workspace since this change.

- **Feedback request fulfillment fixed end-to-end — item 0e, closed,
  2026-08-29 later session.** New migration
  `0008_notification_entity_id.sql` adds `notifications.entity_id`, letting
  a Slack DM reference the specific record it's about. The digest DM's
  "Answer it" button now threads the actual feedback-request id through
  into `addFeedbackModal` (via `private_metadata`, same pattern as
  `editTopicModal`) with a `requestId` mode that skips draft controls and,
  on submit, re-verifies the request's `pair_id` against `ctx.pairId`
  (defense-in-depth, same pattern as `edit_topic`) before atomically saving
  the feedback entry AND closing the request — matching the website's
  `saveFeedback` behavior exactly. The old `feedback_request_answered`
  (status-flip-only, no content) was kept, not removed, as an explicit
  "Close without answering" action distinct from "Answer" — the website
  has the same two distinct actions ("Dismiss"/"Withdraw" vs "Answer").

  **Bonus fix, not previously flagged anywhere in this file:**
  `feedback_request_answered`'s handler had ZERO pair_id check before this
  pass — a third IDOR bug in the same class as the two fixed earlier today,
  found and fixed while touching this handler for the atomic-fulfillment
  work.

  Verified: lint 34/34 baseline unchanged, tests 5/5, confirmed by an
  independent review pass after this phase. Not verified: no live
  Supabase/Slack available, so the new atomic answer+close flow has not
  been exercised against a real feedback request in Slack.

- **Save-draft blank-field bug generalized across all five modals — item
  0j's biggest deferred item, now closed, 2026-08-29 later session.** New
  shared module `lib/slack-form-fields.js` (`fieldBlockId`, `withV2`,
  `makeFieldValV2`, `normalizeDraft`) replaces the bespoke Topics-only
  `_v2`/`fieldValV2`/`normalizeTopicDraft` hack — Topics itself was
  refactored onto the shared helper too, so there's one code path instead
  of five near-duplicates. `addGoalModal`, `addDevPlanModal`,
  `addAchievementModal`, `addFeedbackModal` (`lib/slack-views.js`) and their
  `SUBMISSIONS` handlers (`app/api/slack/interactivity/route.js`) now use
  the dual-lookup reader, closing the exact "Save draft silently submits
  blank fields" bug that was previously fixed for Topics only.

  Verified: lint 34/34 baseline unchanged, tests 5/5, confirmed by an
  independent review pass after this phase. Not verified: no live
  Supabase/Slack available, so the fixed Save-draft behavior has not been
  re-exercised live for Goals/Dev plans/Achievements/Feedback.

- **RLS role-scoping fix — item 0i, closed, 2026-08-29 later session.** New
  migration `supabase/migrations/0007_role_scoped_rls.sql` (applied to
  `schema.sql` too). `concerns` is now fully manager-exclusive via a new
  `is_pair_manager(pair_id)` policy function — the employee has zero
  access (matches the UI's existing `mgrOnly` restriction, which never had
  a DB-level backstop before). `review_drafts` and `form_drafts` are now
  scoped via a new `is_own_role_row(pair_id, role)` function so each side
  of a pair can only reach their own row.

  **Side effect found during this fix, not separately scoped:**
  `listConcerns()` is also called unconditionally on `/history`,
  `/dashboard`, `/export` (`app/(dashboard)/history/page.js` etc.), and
  `buildHistory()` (`lib/data.js`) turned each concern into a "Concern
  documented" history entry with the real text and no role gate — meaning
  an employee visiting `/history` could see their manager's private
  concern notes about them, a live leak, not just a browser-console one.
  Confirmed these pages use the RLS-enforced browser Supabase client (not
  the admin client), so this migration closes that leak too, with no
  separate code change needed.

  **Not yet applied to the live database** — the migration SQL was handed
  to Melissa to run by hand in the Supabase SQL editor (no `supabase` CLI
  is linked in this repo), since running schema-altering DDL against
  production via browser automation was correctly blocked by a safety
  check. Confirm with Melissa whether she's run it yet before treating
  this as live-fixed, not just committed.

  Verified: lint 34/34 baseline unchanged, tests 5/5, confirmed by an
  independent review pass after this phase. Not verified: the policy
  itself, against a live database — no live Supabase available for this
  pass, and the migration has not been run in production.

- **Slack infra hardening — item 0h, partially closed (the two "worth
  prioritizing" sub-items only), 2026-08-29 later session.**
  `.env.local.example` now documents `SLACK_BOT_TOKEN`,
  `SLACK_SIGNING_SECRET`, `SLACK_NOTIFY_WEBHOOK_SECRET`,
  `SUPABASE_SERVICE_ROLE_KEY` with one-line comments on what each is for
  and which file uses it. `lib/slack-api.js` now prefixes its thrown error
  with `[SLACK_INTEGRATION_DOWN]` at the one choke point every Slack Web
  API call funnels through, so a dead/revoked bot token becomes a
  greppable log signal instead of invisible — every downstream
  `console.error` in the three Slack route handlers picks this up
  automatically without relabeling unrelated (e.g. Supabase) errors.

  **Still open, not touched:** rate-limit/backoff handling, the
  OAuth/multi-workspace install flow, `app_uninstalled`/`tokens_revoked`
  handling, and idempotency protection on `view_submission` — these remain
  exactly as item 0h originally described, only the two cheap/high-value
  sub-items were done.

  Verified: lint 34/34 baseline unchanged, tests 5/5, confirmed by an
  independent review pass after this phase. Not verified: no live Slack
  available to confirm the `[SLACK_INTEGRATION_DOWN]` marker actually
  appears in logs against a real revoked token.

- **Two real IDOR security bugs fixed, plus a governance rule added,
  2026-08-29.** Melissa asked for a full security audit ("Is there
  anything missing? Double check it. And does it reflect Slack also?")
  and then a full `/code-review`. Both `edit_topic` (view_submission) and
  `topic_edit` (block_actions) in `app/api/slack/interactivity/route.js`
  acted on a topic id taken straight from Slack with no check that it
  belonged to the requesting user's own pair — both run on the admin
  (service-role) Supabase client, which bypasses RLS entirely, so nothing
  else was stopping a tampered/replayed id from reading or overwriting a
  different pair's topic. Both now select `pair_id` first and reject the
  action if it doesn't match `ctx.pairId`. Also fixed in the same pass:
  `suggested_pick` was reading "why" via plain `fieldVal` instead of the
  `fieldValV2` helper (silently dropped typed text on a second suggestion
  pick), and `add_topic` had lost its whitespace-only validation when the
  field became Slack-required (could create a blank-text topic). A
  standing rule is now in `web-app/CLAUDE.md`: every Slack handler that
  acts on an id from Slack must verify `pair_id` ownership first, no
  exceptions — written there specifically so it survives independently of
  this file and applies automatically to future work (e.g. the still-open
  edit-for-Goals/DevPlans/Actions item). Verified: build/lint/test clean,
  deployed, and live-confirmed the fix doesn't break normal same-pair
  editing (opened Edit on a real topic, saved, no regression). Full
  finding-by-finding detail, including what was found but deliberately
  NOT fixed live (the same views.update field-refresh bug affecting four
  other modals' save-draft flows), is in item 0j of the open list below.
  The RLS/permissions gap found in the same security audit but not fixed
  (concerns/review_drafts/form_drafts) is its own item, 0i, below.

- **Slack's "Add a topic" modal has a genuinely required field now,
  2026-08-29 midday.** Melissa: "we need to make one or both of the fields
  required instead, IT can't have optional an then you get an error."
  "What do you want to discuss" (`lib/slack-views.js`, `addTopicModal`) is
  now required — Slack's own client blocks empty submission with "Please
  complete this required field," no custom server-side error needed for
  that case anymore. "Pick a suggestion" stays optional; picking one fills
  in the required text field (and category) for you via a `block_actions`
  round-trip, instead of being a second, independently-submittable source
  of the topic text the way it worked before.

  **Three separate, real Slack Block Kit platform bugs found building
  this, each confirmed live against the database or server logs, not from
  how the modal looked on screen:**
  1. A `static_select` placed inside an **input** block never dispatches a
     `block_actions` event on selection at all — no request reaches the
     server, no error, nothing. Only elements inside a **section** or
     **actions** block do. The suggestion picker (`suggested_pick`) had to
     move out of an input block into a section+accessory just to be
     clickable. Cost: its value no longer appears in `view.state.values`
     at submission — fine here, since it only ever flows into
     "text"/"category" via the prefill, never read directly.
  2. Once the picker could fire at all, `views.update` on an
     already-open modal doesn't reliably push a new value into an
     existing `static_select`'s displayed selection when its block_id is
     unchanged — confirmed live: the Category dropdown kept showing
     "Wins" after picking a suggestion clearly grouped under "Where
     things stand," even though the server-computed category value was
     correct in the logs. Fix: give the field a different block_id
     ("category_v2") whenever it's being pre-filled via views.update,
     forcing Slack to treat it as a brand-new element.
  3. The same is true of `plain_text_input`, and it's worse: it **visibly
     showed the right text** ("Is what's expected of you actually
     clear?" rendered correctly in the field) while **silently submitting
     empty** — a real topic got saved to the database with `text: ""` and
     the right category, caught only by querying the database after
     Save, not from anything visible in the Slack UI. Same block_id-swap
     fix applied to "text" and "why" (`lib/slack-views.js`,
     `addTopicModal`'s `v2` flag; read back on the server via the new
     `fieldValV2` helper and `normalizeTopicDraft`,
     `app/api/slack/interactivity/route.js` — both `SUBMISSIONS.add_topic`
     and the `open_add_topic`/`save_draft_topic` openers check both the
     base and "_v2" block_id for each field).

  Verified `npm run build`/`lint`/`test` clean after each of the four
  deploys this took (lint 34 pre-existing errors, unchanged; tests 5/5).
  Live end-to-end, checking the actual database after Save each time, not
  just the modal: picked a suggestion, confirmed text and category both
  saved correctly, deleted the test row after
  (`00761548-3f28-42fa-bbe1-f0d77178ac21`). Also confirmed the
  empty-field case directly: tried to Save with nothing entered, got
  Slack's native required-field block, no server round-trip at all.

- **Slack's "Add a topic" modal double-labeled both fields "(optional)",
  2026-08-29 morning.** Melissa spotted it live: "Pick a suggestion
  (optional) (optional)" and "Or write your own (optional)" — a literal
  double label on the first one, and both fields reading optional even
  though the server actually required one or the other. Cause of the
  double label: the label text had "(optional)" typed into it manually,
  and Slack *also* auto-appends "(optional)" to any input block marked
  `optional: true`. Fixed the label text and reworded "Or write your own"
  to flag it was conditionally required. Superseded a few hours later by
  the entry above, which made the field *actually* required instead of
  just clearly labeled — kept here since the label bug itself, and
  Melissa's catch of it, are real history worth keeping.

- **Slack Home tab: "Add a topic" is the highlighted button now, not
  "Wrap up a 1:1" — 2026-08-29 midday.** Among "Add a topic / Topics /
  Add an action / Actions / Wrap up a 1:1," "Wrap up a 1:1" was the only
  button styled `primary` (green) — Melissa's eye went straight to it
  first: "it should land on add a topic" (clarifying an earlier "it
  shouldn't land on wrap up, should land on topic"). Swapped which button
  carries `style: "primary"` in the Home tab's block list
  (`lib/slack-views.js`) — order unchanged, "Add a topic" was already
  leftmost. Verified build/test clean, deployed, confirmed live in Slack
  via screenshot.

- **Topic add/edit live-verified end to end, root cause of "nothing works"
  found, 2026-08-28 even later night.** After the edit feature (entry
  below) shipped, Melissa reported repeated failures testing it in Slack.
  It worked the whole time — what looked broken was three unrelated
  things, not the code:
  1. Melissa was clicking Slack's own sidebar "Home" icon (house icon,
     far-left dark purple rail — goes to Slack's own unreads/threads view)
     instead of the Performance Pulse app's "Home" tab (small text next to
     "Messages"/"About", inside the app panel) — both labeled "Home" on
     the same screen, only one instruction given at first ("click Home")
     without saying which.
  2. Five duplicate Slack tabs had accumulated in her Chrome from repeated
     testing, so a fix confirmed live in one tab didn't show up in the
     tab she was actually looking at.
  3. Slack's own Block Kit buttons genuinely do drop clicks intermittently
     — confirmed directly by clicking "Edit"/"Save changes" and watching
     zero requests reach `/api/slack/interactivity` on the failed clicks
     (Vercel logs), succeeding on a retry with no code change in between.

  None of the three needed a code change. This is also where the
  "decouple submit from add/edit" requirement (item 0 above) first came
  from, right after this was confirmed working: Melissa, twice, because
  the first explanation of the existing behavior got it wrong: "Saving
  changes should not be submitting... Editing or adding a topic is not
  the submit either."

- **Retraction: the "Account A verified as a live middle manager" claim
  below was wrong, 2026-08-27 late evening — since fully resolved.** Caused
  by a case-sensitive email bug (partner email typed with different
  casing than the signed-up account, so lookups silently missed) that made
  it look like the middle-manager fix worked when it hadn't actually been
  tested against a real ambiguous account. At the time this left two
  orphaned test rows to clean up and the middle-manager repro genuinely
  unresolved. **Now actually fixed, not just worked around:** citext on
  `profiles.email`/`pairs.*_email` (2026-08-29 commit `cbba37e`) makes the
  matching case-insensitive at the database level, and `getMyPair`/
  `resolveSlackUser` now return an explicit "ambiguous" flag for any
  account on more than one pair instead of silently picking one — see the
  "Where things stand" summary at the top of this file.

- **Topics can be edited after adding — website and Slack, 2026-08-28
  night.** Was open item 6 below (partly) plus a fresh explicit request from
  Melissa mid-session: "people don't remember what they typed in, and will
  wanna go back to their original. They need to be able to change that, and
  they need to be able to see what is written." Also decided, in the same
  conversation, to stop redacting topic text in Slack's list modal — see
  the privacy tradeoff note in `lib/slack-views.js` above `listTopicsModal`.
  Scoped to **topics only** (not goals/actions/etc.) and to **creator-only**
  editing ("I just need the employee or manager to go in and edit their own
  stuff") — status changes, notes, and delete stay open to both partners,
  unchanged.

  *Website* (`lib/data.js`, `components/one-on-one/TopicList.js`,
  `app/(dashboard)/one-on-one/page.js`): new `updateTopic()`, same
  upsert-with-activity-log shape as `setTopicStatus`. `TopicList` gained a
  `viewerRole` prop gating a new "Edit" button to
  `t.created_by_role === viewerRole`. Reuses the existing add-topic Modal
  pattern, pre-filled.

  *Slack* (`lib/slack-views.js`, `app/api/slack/interactivity/route.js`):
  `listTopicsModal` now shows the real topic text (was category + relative
  date only) plus a creator-gated "Edit" button; a new `editTopicModal`
  is **pushed** on top of the list (`views.push`, not `views.open`) so
  Cancel/Save both return to the list rather than the Home tab — the one
  case in this codebase where a click needs a *second* modal on top of an
  already-open one. `SUBMISSIONS.edit_topic` updates the row and then
  explicitly `views.update`s the list modal underneath
  (`payload.view.previous_view_id`), since a pushed modal closing on save
  doesn't refresh what's behind it on its own.

  **Two real bugs found and fixed while building this, not pre-existing
  known issues:**
  1. A topic added from the suggestion picker (see `suggestionOptionGroups`)
     carries a category from the `SUGGESTIONS` library — a different list
     than the fixed `TOPIC_CATEGORIES` used by every category dropdown
     (e.g. "Where things stand" / "Where I stand" — not on the standard
     list at all). The website's plain HTML `<select>` just silently fails
     to preselect an unmatched value and falls back to showing (and would
     have then saved) the *first* option instead — a real data-corruption
     risk on any edit that didn't touch the category field, caught live
     while testing, not in review. Slack's `static_select` is strict
     enough to hard-reject an unmatched `initial_option`
     (`invalid_arguments`), which is what actually surfaced this — the
     Edit modal wouldn't open in Slack at all until fixed. Fix in both
     places: build the dropdown's option list as `TOPIC_CATEGORIES` plus
     the topic's real category if it isn't already one of them, so the
     true value is always representable and never silently substituted.
  2. `lib/slack-api.js`'s error path only surfaced Slack's top-level error
     code (`invalid_arguments`), not which field failed — added
     `response_metadata.messages` to the thrown error message (kept, not
     reverted, since it's a strict improvement for any future Slack API
     debugging).

  Verified: `npm run build`/`lint`/`test` clean after every change (lint
  34 pre-existing errors, unchanged; tests 5/5). **Live end-to-end on both
  surfaces, not just read from code:** added a real topic as
  `melissaw212@gmail.com` (employee on the real pair), confirmed no Edit
  button shows on topics she didn't create (manager's), confirmed Edit
  does show on her own, edited it, confirmed the category bug fix
  (dropdown showed "Where I stand" correctly instead of falling back to
  "Wins"), saved, reloaded. In Slack, as the real manager account
  (`melissahr212@gmail.com`, "monty"), opened Topics, saw real text on
  every row, edited one via the pushed modal, confirmed the list behind it
  updated in place with the new text without closing. Both directions
  confirmed to hit the same `topics` row (shared database, no separate
  sync needed). Test topic and test edit both cleaned up afterward
  (deleted / reverted directly against the database).

- Real Slack DM pings for every `BK_KINDS` kind, sent via
  `app/api/slack/notify/route.js` (a Supabase Database trigger —
  `notify_slack_on_notification()`, now captured in
  `supabase/migrations/0005_slack_notify_trigger.sql`).
- Home tab + modals for topics, actions, goals, development plans,
  achievements, feedback, and wrap-up — add, view, and quick actions
  (mark discussed/done/answered) all work from inside Slack.
- Privacy redaction: list-viewing modals in Slack show counts/categories/
  dates only (no title/text), never full feedback/goal/achievement/meeting
  text — matches the same promise made in the DM footer and the in-app
  Slack tab. Live-verified 2026-08-24; a prior bug (see below) had actually
  been leaking topic/action free text into these modals.
- Editable display name — one shared name (`profiles.full_name`) used
  everywhere: website, Slack Home tab, DM pings. Editable from the app
  (click your name, top right) or from Slack itself ("Edit your name" on
  the Home tab).
- Topic-add pings batched into one DM per Prepare session instead of one
  per click (website only at the time; the Slack side was closed separately
  on 2026-08-24 — see the `delayedNotify` entry below).
- Interactivity endpoint fails soft on errors (logs + acks) instead of
  raw-500ing and leaving a button/modal stuck.
- Mark discussed/done/answered buttons are highlighted (primary style).
- **2026-08-24 code-review pass (10 bugs found and fixed, all deployed and
  build/lint-clean).** Committed together with the two items below as
  `e0c2da9` ("Fix code-review bugs, add topic suggestions, batch delayed
  Slack pings") — all three had been live in production but uncommitted
  until this commit.
  `isOpenTopic` (`lib/format.js`) now excludes `"Discussed"`, so Slack's
  "Mark discussed" actually clears a topic from the open list/count (it
  silently didn't before); `wrapUpModal` now reuses `isOpenTopic` instead of
  a narrower inline filter, so a "Parking Lot" topic can no longer be
  accidentally deleted via the Slack wrap-up checklist; feedback-request
  status in Slack now uses `"open"`/`"closed"` to match the website (was
  `"Answered"`/`"Declined"`, which never synced); a React hooks-order crash
  on `/one-on-one` (new `useEffect` placed after an early `return`) is
  fixed; `resolveSlackUser` (`lib/slack-user.js`) is now one Supabase query
  (embedded select) instead of two, and its `.or()` filter properly quotes
  the email against PostgREST injection; `OnboardingForm` no longer accepts
  a whitespace-only name; `addFromHardConvo` no longer accidentally sends a
  real Slack DM (it's meant to stay in-app-only); the website's topic-notify
  batching now also flushes on a 4s timer, not just tab-switch/unmount, so
  a closed tab doesn't silently drop a pending notification.
- **2026-08-24: suggested topics in Slack's "Add a topic" modal.** Mirrors
  the website's Prepare-tab `SUGGESTIONS` library (role-based, grouped by
  category) as an optional `static_select` with `option_groups`, value
  encoded as `"<category>::<text>"`; picking one skips the free-text/
  category fields. The free-text "Or write your own" + category fields
  remain for a custom topic. Server-side validation (`response_action:
  "errors"`) requires one or the other. Live-verified: picking a suggestion
  saves with the suggestion's own category, matching website behavior.
- **2026-08-24: Day 1 of save/pause/go-back — `form_drafts` table + topic
  form wired up.** New `form_drafts` table (pair_id, role, kind, draft
  jsonb, updated_at; PK on all three) generalizes `review_drafts` with a
  `kind` column. Added `getFormDraft`/`saveFormDraft`/`clearFormDraft` to
  `lib/data.js` (`supabase/migrations/0003_form_drafts.sql`, applied by
  hand in the SQL Editor — this project has no automated migrations).
  Wired into the topic-add form only (`one-on-one/page.js`, Prepare tab):
  800ms-debounced autosave while typing, restore on page load, clear on
  submit, new "Discard" button to clear without submitting. All calls
  fail soft (`.catch(() => {})`/`.catch(() => null)`) so a deploy that
  lands before the migration runs doesn't break the Prepare tab. Deployed
  via `vercel --prod` (git push to `performance-pulse` remote does **not**
  auto-deploy this project — no Git integration wired up, deploys are
  CLI-triggered). Live-verified end-to-end on
  `performance-pulse-lyart.vercel.app`: typed a topic, reloaded without
  submitting, text came back; clicked Discard, reloaded again, stayed
  cleared.
- **2026-08-24: Day 2 of save/pause/go-back — rolled to Goals,
  Development, Achievements, Feedback.** Same `form_drafts` pattern as
  Day 1, applied to the "add new" flow only in each (not editing an
  existing goal/plan — those already have a saved row to revisit, so a
  separate draft doesn't apply there):
  - **Goals** (`goals/page.js`, kind `"goal"`) and **Development**
    (`development/page.js`, kind `"dev"`) — both are `<Modal>`-based
    add/edit forms; draft logic is gated on `!editing`/`!editingDev` so
    editing an existing item never touches the draft. Development's
    seeded opens (from Career's "turn into a plan" link, and the
    learning-and-development suggestion picker) count as "new" too, so
    they autosave/restore like the plain "Add a development plan" flow.
  - **Achievements** (`performance/page.js`, kind `"achievement"`) — no
    edit flow exists for achievements, so no gating needed.
  - **Feedback** (`performance/page.js`, kind `"feedback"`) — scoped to
    "give" mode only (`fbMode === "give"`); "answer" mode (responding to
    a specific feedback request) is tied to that request, not a
    standalone draft, and was deliberately left out to avoid one draft
    bleeding across different requests.
  - `components/ui/Modal.js` gained an optional `onDiscard`/
    `discardLabel` prop (renders a "Discard" button in the modal footer,
    between Cancel and Save) since all four forms needed the same
    affordance Day 1 built inline for the topic form.
  - All draft calls fail soft, same as Day 1. Deployed via `vercel
    --prod`. Live-verified end-to-end on
    `performance-pulse-lyart.vercel.app` for all four: typed into each
    "add" modal, reloaded without saving, reopened the modal — content
    came back in all four; clicked Discard on each — cleared and stayed
    cleared.
- **2026-08-24: Day 3 of save/pause/go-back — Slack side, via an explicit
  "Save draft" button.** First attempt (`notify_on_close` +
  `view_closed`, saving automatically when the modal is closed) doesn't
  work: confirmed live that Slack's `view_closed` payload drops every
  `plain_text_input` value, keeping only structured fields
  (`static_select`, `datepicker`) — so it silently couldn't save the
  one thing that matters, what someone actually wrote. Rolled that back.
  What ships instead: each of the 5 add-modals (topic, goal, dev plan,
  achievement, feedback) now has its own **"Save draft"** button at the
  top. Clicking it — unlike closing the modal — sends Slack's full
  current field state (this *does* include free text), which gets
  merged into the same `form_drafts` row the website uses and shown
  back with a "✅ Draft saved" confirmation right in the modal. Opening
  that same "Add a goal" (etc.) form again later — from the Home tab,
  no special navigation needed — comes back pre-filled, whether the
  draft was saved from Slack or from the website. Submitting
  successfully still clears it, same as before.
  Deployed via `vercel --prod`. Live-verified end-to-end in Slack (not
  just read from code): opened "Add a goal," typed a goal and a "why,"
  clicked Save draft, saw the confirmation banner and the fields still
  populated; confirmed the row in Supabase directly; closed the modal
  entirely (X, back to Slack's Home tab); reopened "Add a goal" fresh —
  both fields came back. Then cleared the test draft the same way
  (typed empty, Save draft) so no leftover test data was left behind.
- **2026-08-24: Slack-side topic-add no longer pings instantly.**
  `SUBMISSIONS.add_topic` (`app/api/slack/interactivity/route.js`) now uses
  `delayedNotify()` — the same 4s-after-response delay already used by
  add_goal/add_devplan/add_achievement/add_feedback — instead of calling
  `notify()` synchronously. Also confirmed (by reading the code, all five
  `SAVE_DRAFT` handlers and all five `SUBMISSIONS` handlers): the "Save
  draft" button never calls `notify`/`delayedNotify` anywhere — a ping only
  ever fires from an actual Submit, never from Save draft. That was already
  true before today; this change only fixes the topic-add timing.
  Deployed via `vercel --prod`. Live-verified: submitted a real topic in
  Slack, then compared `topics.created_at` to the matching
  `notifications.created_at` directly in Supabase — 5.0s apart, versus
  0.35s apart for a topic added before this fix (old instant-ping
  behavior, kept for comparison). Test topic marked Discussed afterward
  to clean up.

- **2026-08-25: the project has tests now — `npm test`.** There was no test
  setup at all. Node's built-in runner, no new dependencies;
  `test/resolve-alias.mjs` teaches it the `@/` mapping Next gets from
  jsconfig, and `--experimental-test-module-mocks` covers stubbing
  `slack-api`. Five tests pin `resolveSlackUser`'s pair-count branches
  (none / one as employee / one as manager / two / no email). Confirmed
  they actually catch a regression by deleting the two-pair guard and
  watching the suite go red, then restoring it.
  Started here on purpose: multi-pair support (open item 2) is next, and
  its worst failure is showing the wrong pairing under a plausible name —
  which nothing catches by eye. Run `npm test` before and after touching
  pair lookup.

- **2026-08-25: a Slack account on two pairs no longer crashes the Slack
  routes** (was open item 2). `resolveSlackUser` (`lib/slack-user.js`) used
  `.maybeSingle()`, which treats a second matching row as an error, so a
  middle manager — employee on one pair, manager on another — hit a thrown
  error on every Slack interaction. It surfaced as a Home tab that silently
  never published, or "Something went wrong loading this."
  Now `.limit(2)`: no rows still returns `null` (unchanged "not linked"
  path), one row returns the same context object as before, and two rows
  return a `{ ambiguous: true }` sentinel carrying no pair data.
  All three call sites branch on it — `multiplePairsHomeView()` on the Home
  tab, a `noticeModal` in the deferred openers, and in `handleInteraction`
  either a `response_action: "update"` (view_submission) or a `views.update`
  on the open modal, so buttons say something instead of doing nothing.
  **Deliberately does not pick a pair.** Both pairs belong to this person,
  so showing one isn't a leak, but they'd get another pair's counts with
  nothing on screen saying a substitution happened — and knowing exactly
  whose data you're looking at is the whole promise here. The copy also
  names neither pair, since naming them tells each pair about the other.
  Verified: 5 unit tests against a stubbed Supabase client covering all
  three branches plus the missing-email path (0 rows → null, 1 row as
  employee, 1 row as manager, 2 rows → ambiguous with no `pairId`, no email
  → null) — all pass; both new views return `{"ok":true}` from Slack's
  `blocks.validate`; `npm run build` succeeds; `npm run lint` reports zero
  problems in the four touched files (34 pre-existing React-hooks errors
  elsewhere, unchanged).
  **Not verified:** the real Slack path. Reproducing it needs an actual
  middle-manager pair in production, i.e. creating live data, so the guard
  is proven at the resolver and view level only.
  **Same bug still live on the website:** `getMyPair` (`lib/data.js`) has
  the identical `.maybeSingle()` on `employee_id`/`manager_id`. Left alone
  on purpose — this item was scoped to the Slack route. See open item 2.

- **2026-08-25: merged the two hand-synced quick-action tables** (was open
  item 2). `QUICK_ACTIONS` and the inline `listAgain` object in
  `app/api/slack/interactivity/route.js` duplicated the same three action
  ids; each `QUICK_ACTIONS` entry now carries both its `run()` mutation and
  its `refreshList()` modal redraw, so adding a quick action can't mean
  updating one table and forgetting the other. Pure refactor — same action
  ids, same behavior. Committed as `ba2ad38`, deployed via `vercel --prod`.
  Live-verified in Slack (not just read from code): opened Topics from the
  Home tab, clicked "Mark discussed" on a topic — the list modal redrew in
  place from 2 topics to 1, and the Home tab count went from "2 open topics"
  to "1 open topic," confirming `run()`, `refreshList()`, and `refreshHome()`
  all still fire. Also reproduced open item 1 live while testing: the first
  (cold) click returned Slack's "Operation timed out. Apps need to respond
  within 3 seconds"; the retry succeeded.

- **2026-08-25: Home-tab republish moved off Slack's 3-second response
  path** (was open item 2). `view_submission` awaited a 7-query
  `loadHomeData` + `views.publish` before responding, so a cold invocation
  could blow Slack's 3s window even though the save had already succeeded.
  `refreshHome` now runs inside `after()` (same Next `after()` already used
  by `delayedNotify`, confirmed against
  `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`
  — runs after the response is sent, supported in Route Handlers). The
  quick-action path now also loads home data **once** and shares it between
  the list-modal redraw and the republish, instead of loading it twice (14
  queries → 7); `refreshList` takes that preloaded data instead of fetching
  its own. `edit_name`'s `ctx.myName` mutation still lands before the
  deferred refresh runs, so the Home tab shows the new name.
  Committed as `e08853a`, deployed via `vercel --prod` (`6a05j6e1j`).
  Live-verified in Slack: submitted "Add a topic" — the modal closed with
  no timeout error and the Home tab had already updated to "2 open topics"
  behind it, proving the deferred republish still lands. Test topic marked
  Discussed afterward to clean up (back to 1 open topic).

  **Not covered by this fix:** the modal-*opening* path (`OPENERS` →
  `views.open`) can't be deferred — `views.open` needs the modal content
  built before responding, and the `trigger_id` expires in ~3s. A cold
  click on "Topics" was observed timing out with "Operation timed out. Apps
  need to respond within 3 seconds" on 2026-08-25 (retry succeeded). That
  one needed a different fix — see the next Done entry.

- **2026-08-25: Modal openers now open instantly, then fill themselves in**
  (was open item 2 — the cold-start opener timeout left over from the fix
  above). Slack expires a `trigger_id` ~3s after the click, so `views.open`
  can't be deferred with `after()` the way a submission can. But `views.update`
  takes a `view_id`, not a `trigger_id`, and so has no deadline — confirmed
  against Slack's own docs (`https://docs.slack.dev/surfaces/modals.md`).
  Slack doesn't document the placeholder pattern as a named best practice;
  it follows from that asymmetry.

  So openers now do the slow half after the deadline instead of before it. A
  new fast path in `POST` intercepts `block_actions` whose `action_id` is in
  `OPENERS` **before** the Supabase client is created, opens a data-free
  `loadingModal()`, and returns. Everything else — Supabase client,
  `resolveSlackUser`, `loadHomeData`, building the real view — runs inside
  `after()` and swaps in via `views.update`. Pre-deadline work is now just
  signature verification plus one Slack call, which is the floor.

  `OPENERS` entries changed shape from `action_id: async fn` to
  `action_id: { title, build }`; the `title` lets the placeholder carry the
  same header as the final view, so only the body swaps and there's no visible
  title flicker. Every exit path replaces the placeholder with something —
  unresolvable Slack user and any thrown error both swap in `noticeModal()` —
  so a click can't strand someone on "Loading…". Both new views in
  `lib/slack-views.js` are deliberately `submit`-less (a modal with no `input`
  block must not declare `submit`).

  Committed as `6bfbdc2`, deployed via `vercel --prod` (`2oc2xdoms`).
  Verified: `blocks.validate` returns `ok:true` for both new views; lint and
  build clean; all 16 `OPENERS` entries confirmed to carry both `title` and
  `build`. Timed against the live endpoint with a signed synthetic
  `block_actions` payload (real signature path, deliberately bogus
  `trigger_id`): **937ms cold** on the first request after deploy, 348ms and
  292ms warm — all comfortably inside the 3s window, versus the observed
  timeout before. A forged signature still gets a 401.

  **Caveat:** this removes the *timeout*, not the cold start. The user now
  briefly sees "Loading…" where content used to appear at once. If boot alone
  ever exceeds 3s, no code change helps — that would need a warm-up ping.

- **2026-08-25: Goals and achievements now send a real Slack DM on submit**
  (was open item 5). Root cause was one thing, not four: `sendSlackPing`
  (`lib/slack-send.js`) skips any notification whose `kind` isn't in
  `BK_KINDS`, and the goal/achievement adds never passed one — so they
  reached the in-app bell and stopped. Added both ids to `BK_KINDS` **and**
  a branch each in `buildBlockKit`; both halves are required, because the
  builder ends in a catch-all `else`, so a registered kind with no branch
  would have sent people a "1:1 wrapped up" DM. The four add call sites
  (`SUBMISSIONS.add_goal`/`add_achievement`, `goals/page.js`,
  `performance/page.js`) now pass the kind; `safeNotify` in `goals/page.js`
  gained a `kind` parameter.

  **Scoped to adds, on submit, at Melissa's explicit instruction** ("i only
  want a ping after the person hits submit"). Editing a goal, deleting one,
  and adding a check-in pass no kind and are provably skipped — verified by
  calling `sendSlackPing` directly on those three shapes, each returning
  `{skipped}`. Draft-saves never notified and still don't.
  Privacy holds: the DM is built from kind + partner name + counts and
  never reads `notification.text`, so the goal/achievement wording stays
  out of Slack. Verified by planting realistic private wording in a test
  and confirming none of it appears anywhere in the payload.

  Committed as `b9f8dfe`, deployed via `vercel --prod` (`fxtm4kl3f`).
  Both new payloads pass `blocks.validate`; both route to their own branch
  rather than the wrap catch-all; buttons resolve to real `OPENERS` ids.
  Build clean (lint shows 16 errors, all pre-existing in untouched code —
  confirmed identical count before and after). **Live-verified end to end:**
  submitted a real signed `add_goal` to production, which wrote a
  `notifications` row with `kind:"goal"` and delivered an actual Slack DM
  that Melissa confirmed receiving. Both test goals deleted afterward.

- **Too many pings — batched, 2026-08-25.** Melissa: "slack should not
  always ping and website should not ping after someone does something",
  clarified as *too many, batch them*. Two halves, fixed differently
  because they are different problems: a Slack DM interrupts you, the
  in-app list does not (nothing pops up when a partner acts — toasts only
  confirm your own actions).

  *Slack side* (`app/api/slack/notify/route.js`, `sendSlackDigest` in
  `lib/slack-send.js`, `buildDigestBlockKit` in `lib/block-kit.js`):
  notifications for the same pair+role landing within `BATCH_WINDOW_MS`
  (5s) collapse into one DM — "Alex made 3 updates" over "2 goals · 1
  achievement". Batching sits at the delivery point, not in the browser,
  so it covers Slack-side and website-side actions alike and across
  kinds. Which row sends is *derived, not stored*: every invocation walks
  the same window and groups it identically, so the first row of a group
  sends and the rest stand down — no schema change, no locks. `after()`
  keeps the wait off the webhook response. Feedback requests are exempt
  (`NEVER_BATCH`) since someone is waiting on a reply; a burst of one
  still gets its normal specific message. Rows without a `kind` return
  immediately rather than holding a function open.

  9 grouping cases pass (single, rapid adds, unbroken 0–10s chain,
  separate bursts, on the window edge, just past it, mixed kinds, request
  exemption, null-kind rows) with nothing dropped and nothing sent twice
  — the chain case is the one a naive "earliest in window" rule fails.
  Digest payload passes `blocks.validate` and a planted-private-string
  leak test: counts and kinds only, never `notification.text`.
  Committed `7066154`, deployed `dfmponhjq`. Live-verified: 2 goals + 1
  achievement fired 2.4s apart, Melissa confirmed a single notification.
  Note the bot cannot read its own DMs (`conversations.history` returns
  `missing_scope`), so DM *wording* can only be confirmed by her.

  *In-app side* (`groupNotifications` in `lib/data.js`, used by
  `components/NotificationBell.js` and the dashboard Updates card):
  display-only. Both lists render just the newest eight, so a burst
  buried everything older. Neighbouring rows from the same person sharing
  the text before the colon now show as one row with a count, the text
  after the colon becoming a detail line. Rows are still written
  individually and nothing is hidden; a group stays unread until every
  item in it is read; the bell badge still counts individual items, since
  it answers "how much is new". 10 cases pass, including that a lone item
  renders exactly as before and that different verbs ("added a goal" vs
  "removed a goal") never merge. Verified against live data: 28
  notifications render as 17 rows. Committed `cdd83d3`, deployed
  `a45z8tdmm`. Same commit deletes four committed duplicate files
  (`<name> 2.js`); nothing imported them and the `block-kit` copy was a
  stale pre-digest version.

- **Activity log for state changes — done, 2026-08-25.** Melissa asked for
  "history for options so we know that happened", after a test click on
  Slack's "Mark discussed" quietly closed one of her real topics and the
  only evidence was a notification reading `Topic marked Discussed` with
  no topic name. `buildHistory` only ever derived entries from a record's
  `created_at`, so nothing recorded a thing being *changed*.

  New `activity_log` table (`supabase/migrations/0004_activity_log.sql`,
  folded into `schema.sql`), append-only at the database level: select and
  insert policies only, no update or delete, so Postgres refuses to
  rewrite it. Verified after applying — `pg_policies` returns exactly
  INSERT and SELECT. Note this binds the *app*; the service-role key
  bypasses RLS by design, so server-side code can still delete.
  `entity_id` is deliberately not a foreign key (wrap-up deletes discussed
  topics and the record must outlive the row) and `label` snapshots the
  text on write for the same reason.

  Writes happen inside `setTopicStatus`, `toggleActionDone` and
  `setFeedbackRequestStatus` rather than at the eight call sites, so the
  website and Slack quick actions are both covered — the same choke-point
  trick as the DM batching. Each records old -> new, actor, and source
  ("web" or "slack"). Logging is best-effort and never throws: failing to
  record must not cost someone the action they took.
  Surfaced in the History tab under a new "Changes" filter. The log holds
  real topic text, so it stays in the app — Slack still sees only counts
  and categories.

  Committed `fde5c4d`, deployed `bcpanr0ru`. Migration applied to the live
  database on 2026-08-25 (via the Supabase SQL Editor — there's no DB
  password or `psql` in this environment, so DDL can't be run from code).
  Build clean; lint 16 errors before and after, identical, none on touched
  lines. Tested end to end against the live database, twice: before the
  migration, marking a topic Discussed still succeeded with only a warning
  (the graceful-degradation path); after it, the row logged
  `open -> Discussed` with actor and source, and rendered in History as
  `[Changes] "Topic marked Discussed" — <label> — <actor> (from Slack)`.
  Throwaway topics deleted after each run.

- **Slack's `add_devplan` now DMs — done, 2026-08-25.** Adding a
  development plan from Slack notified nobody, while the same action on
  the website did. Cause was a single missing argument: every other
  `SUBMISSIONS` handler passes a `kind`, which is what turns a
  notification row into a real DM, and `add_devplan` passed none. `"dev"`
  was already in `BK_KINDS` with its own `buildBlockKit` branch, so no new
  message had to be written.

  Checked the website's condition first, as the old note asked: it passes
  `"dev"` only when a plan is *added*, never on edit or removal. Slack's
  `add_devplan` only ever creates, so always passing it matches rather
  than over-pinging. Swept every other notify call in the route at the
  same time — all `add_*` submissions now carry a kind; the two quick
  actions (topic discussed, action done) deliberately carry none, matching
  the website, so status changes stay in-app.

  Committed `1d95f3b`, deployed `dy4eiz9ov`. Build clean, lint clean on
  the touched file. Live-verified end to end: a real signed `add_devplan`
  to production wrote a row with `kind:"dev"`, and the DM arrived reading
  "melissa recommended a development plan for you" with "1 plan in the
  workspace" — seen in Slack and confirmed by Melissa. Test plan and
  notification deleted afterwards.

- **Slack-ping trigger written down — done, 2026-08-25** (was open item 3).
  The trigger that makes every Slack DM happen existed only as a live object
  inside the Supabase database. Nothing in the repo described it, so a
  database reset or a second environment would have lost it silently: no
  error anywhere, the pings simply never arrive again.

  Read back out of the live database with `pg_get_functiondef` /
  `pg_get_triggerdef` and written to
  `supabase/migrations/0005_slack_notify_trigger.sql`, also folded into
  `schema.sql`. It's an `after insert` trigger on `notifications` calling
  `net.http_post` (pg_net 0.20.4) against
  `/api/slack/notify` with an `x-webhook-secret` header and a 5s timeout.
  Two details worth recording: pg_net is declared in schema `extensions` but
  puts its functions in a `net` schema regardless (verified with `pg_proc`),
  which is why the call is `net.http_post`; and the header name matches
  `SLACK_NOTIFY_WEBHOOK_SECRET` as read in `notify/route.js:107`.

  **The secret is deliberately not in the file** — it's a placeholder, and a
  `do` block at the end raises an exception if it's still there, so running
  the file unedited fails loudly instead of installing a trigger that gets a
  silent 401 on every ping. That silent-401 case is the exact failure this
  file exists to prevent, so it shouldn't be reachable by forgetting a step.

  Verified by actually running it, not by reading it: installed the function
  and trigger into a throwaway `mig_test` schema against the live database,
  asserted both the trigger installed and the guard sees the placeholder,
  then dropped the schema — the run raised no exception and reported
  `mig_test schema remaining: 0`. Production re-checked afterwards: live
  function 1, live trigger 1, placeholder present in production 0, test
  schema left behind 0. The live trigger was never touched. Not verified:
  the file has never been run start-to-finish with a real secret, since
  doing that would mean replacing the working production trigger.

  Same commit deletes `0004_activity_log 2.sql`, a byte-identical committed
  duplicate of `0004_activity_log.sql` (same `<name> 2.ext` pattern as the
  four deleted on 2026-08-25) — a stray copy of a migration is worse than a
  stray copy of a component, since it reads as a fifth migration to run.

- **`/login` no longer fails silently on a bad sign-in link — done,
  2026-08-27.** Found live while testing item 2: `app/auth/callback/route.js`
  already redirected to `/login?error=auth` on a failed PKCE code exchange
  (the common case being a magic link clicked in a different browser/session
  than the one that requested it, which loses the code verifier), but
  `app/login/page.js` never read that param — the retry form just looked
  like nothing had happened, no error, no explanation.
  Fix reads `window.location.search` in a `useEffect` on mount and shows
  "That sign-in link didn't work — request a new one below." A lazy
  `useState` initializer was tried first and rejected: `/login` is
  statically prerendered (confirmed via `next build`'s route summary), so
  computing the message during render desyncs from the static HTML and
  throws a hydration error — confirmed live in a local `next dev` session.
  The `useEffect` version doesn't have that problem since server and client
  agree on the first render; the one `react-hooks/set-state-in-effect` lint
  warning it trips is suppressed inline with a comment explaining why.
  Verified: `npm run lint` and `npm test` clean (one pre-existing,
  unrelated `react/no-unescaped-entities` error on a different line,
  confirmed present on the pre-change file too); `npm run build` succeeds;
  live-verified on production at `/login?error=auth` after deploy.
  Committed `a4f5eaf`, deployed via `vercel --prod`.

Still open, in priority order:

0. ~~Decouple "submit" from add/edit; stop pinging on every save.~~ **Done —
   closed 2026-08-29 later session, scoped to Topics only, full detail in
   the Done section above.** Kept as a one-line stub (not deleted) only so
   items 2-5 and the lettered items below don't have to be renumbered —
   several Done entries cite them by number/letter. The same "submit"
   gating has not been extended to goals/actions/achievements/
   feedback/dev plans — nobody has asked for that yet.

0b. **NEW, 2026-08-29 — Goals, and every other kind except Topics, still
    force a trip to the website just to see what's actually in them.**
    Melissa: "making sure when you're in Slack, the goals, it doesn't make
    you open the app." Same shape as the topic-redaction removal from
    2026-08-28 (Done section, item "Topics can be edited after adding"),
    for every other kind — not started, but now fully mapped, not just
    Goals: read every `list*Modal` function in `lib/slack-views.js` to
    confirm exactly what's redacted in each one before writing any code.

    **Confirmed live in the code, one by one — only Topics shows real
    content today:**
    - **Topics** (`listTopicsModal`) — fixed 2026-08-28. Shows the real
      topic text and category inline, creator-gated Edit button. The
      model every other kind below should be measured against.
    - **Goals** (`listGoalsModal`) — count + status breakdown only:
      `"3 goals on record\n2 In Progress · 1 Complete"`, then "Open goals
      in the app for the full text." No goal text, target date, or
      measure ever shown. **Correction to what this entry said earlier
      today:** `addGoalModal` does NOT let you create a full goal in
      Slack — it's missing owner, progress, obstacles, and support, all
      of which the website form has (`app/(dashboard)/goals/page.js`).
      This is a view-side gap AND an add-side gap, not view-only. See the
      new item 0c below for the full add-side field-parity picture across
      every kind.
    - **Development plans** (`listDevPlansModal`) — identical shape to
      Goals: count + status breakdown, "Open plans in the app for the
      full text." No area, activity, or target date shown.
    - **Achievements** (`listAchievementsModal`) — count + category
      breakdown, "Open achievements in the app for the full text." No
      title, impact, or date shown.
    - **Feedback** (`listFeedbackModal`) — count + type breakdown for
      feedback already given; open feedback *requests* show only
      "Requested {time} ago" with a "Mark answered" button — the actual
      "what about"/"why now" text behind a request is never shown either.
      "Open feedback in the app for the full text."
    - **Actions** (`listActionsModal`) — a different, partial redaction,
      not the count-summary pattern: each open action gets its own row,
      "*Action 1* — {owner} · due {date}", with a "Mark done" button — so
      owner and due date are real and per-row, but the action's own text
      (what it actually says to do) is never shown, only "Action 1",
      "Action 2", etc.
    - **Last 1:1 summary** (`lastMeetingModal`) — the most redacted of
      all: just "1:1 on {date}\nRead what you discussed and agreed on in
      the app," no content of any kind, not even a count.

    **Decided 2026-08-29 (later session, Melissa):** **Goals + Actions**
    get matched to Topics' real-content behavior — not all six, not just
    Goals, not none. Not yet built.

    **Shape of the fix, once scope is confirmed, per kind:**
    - Goals/Dev plans/Achievements: mirror `listTopicsModal` exactly —
      replace the count summary with one row per item showing its real
      text/status/date fields, keep the "Open in app" link.
    - Feedback: same for feedback entries; for open requests, also show
      the request's "about"/"why now" text instead of just a timestamp.
    - Actions: smaller change — add the action's own text into the
      existing per-row line instead of "Action 1"/"Action 2".
    - Last meeting: biggest change of the six — currently shows nothing
      at all, would need deciding how much of a wrap-up summary
      (discussed/agreed/start-stop-keep) is safe to surface in Slack.

    Re-read the privacy tradeoff note above `listTopicsModal` before
    changing any of these — it's a deliberate decision (Slack is a wider
    trust boundary than the app — workspace admins can export message/view
    history), not an oversight, so extending it to any other kind is also
    a real decision, not just a copy-paste.

    **Done, 2026-08-30: Goals and Actions built, shipped, and live-tested —
    the two kinds this was scoped to.** `listGoalsModal` now shows each
    goal's real text/status/progress per row, matching `listTopicsModal`'s
    model; `listActionsModal` now shows each action's real text alongside
    owner and due date. Dev plans, Achievements, Feedback, and the
    Last-meeting summary are untouched — still redacted, exactly as scoped.
    Shipped as part of commit `eed4d7a`. Goals confirmed live end-to-end in
    real Slack; Actions confirmed via lint/build/test and code review.

0c. **NEW, found on a 2026-08-29 full-codebase audit — delete doesn't exist
    in Slack at all, for any kind.** Melissa asked "make sure ... all the
    other pieces are fixed" and this audit was run specifically to find
    everything not yet on this list, not just Goals. The website has
    delete for topics (`deleteTopics`, `lib/data.js`), goals
    (`deleteGoal`), development plans (`deleteDevelopmentPlan`), actions
    (`deleteAction`), and achievements (`deleteAchievement`) — Slack has
    no delete affordance anywhere, for anything. Not previously flagged.
    **Decided 2026-08-29 (later session, Melissa):** yes, add delete to
    Slack, for the same kinds the website already supports it for (topics,
    goals, development plans, actions, achievements). Not yet built.

    **Done, 2026-08-30: delete built for all five kinds, shipped.**
    `topic_delete`, `goal_delete`, `devplan_delete`, `action_delete`, and
    `achievement_delete` all added to Slack's `QUICK_ACTIONS`, each gated by
    `verifyOwnedRow` before deleting (per the pair_id-ownership rule in
    `CLAUDE.md`) — open to both partners, matching the website. Shipped as
    part of commit `eed4d7a`. Goals delete confirmed live end-to-end in real
    Slack (added a test goal, deleted it, list emptied cleanly, nothing left
    behind). Topics/Dev plans/Actions/Achievements delete confirmed via
    lint/build/test and code review — not yet individually clicked through
    live.

0d. **NEW, found on the same audit — edit exists on the website for Goals,
    Development plans, and Actions, with no Slack equivalent; Topics is
    the only kind Slack can edit.** Website `saveGoal`, `saveDevelopmentPlan`,
    and `saveAction` (`lib/data.js`) are id-based upserts, so the website
    already supports add-or-edit for these three — Slack's `OPENERS`/
    `SUBMISSIONS` (`app/api/slack/interactivity/route.js`) have no
    `edit_goal`/`edit_devplan`/`edit_action` anywhere, only `edit_topic`
    (2026-08-28). If the plan is eventually "every kind works like Topics
    now does," this is the edit-side half of that — item 0b above is the
    view-side half. This item was originally left as "coupled to 0b" —
    since 0b's scope decision (Goals + Actions) is now made (2026-08-29),
    this is unblocked and should logically follow the same two kinds
    (Goals + Actions), matching 0b's scope, unless Melissa says otherwise.
    Not started.

    **Done, 2026-08-30: edit built for Goals and Actions, shipped — matches
    0b/0c's scope decision.** `edit_goal` and `edit_action` added (same
    `views.push` pattern as `edit_topic`), each verifies pair_id ownership
    before saving, and refreshes the underlying list via `previous_view_id`
    on save so it updates without the list modal needing to be reopened. Dev
    plans edit intentionally NOT added — matches the Goals+Actions-only
    scope decided 2026-08-29. Shipped as part of commit `eed4d7a`. Goals
    edit confirmed live end-to-end in real Slack (edited a test goal's text,
    confirmed the list behind it updated to match). Actions edit confirmed
    via lint/build/test and code review only.

0e. ~~Feedback requests can't actually be fulfilled from Slack.~~ **Done —
    closed 2026-08-29 later session, full detail in the Done section
    above.** Kept as a one-line stub for the same reason as items 1 and 6.

0f. **NEW, found on the same audit — every Slack add-form is missing
    fields the website form has,** beyond the redaction gaps in 0b:
    - **Goals** (`addGoalModal`): missing owner (hardcoded to whoever
      submits it — no way to assign a goal to your partner from Slack),
      progress, obstacles, support.
    - **Development plans** (`addDevPlanModal`): missing why, support,
      measure.
    - **Actions** (`addActionModal`): missing related, notes.
    - **Wrap-up** (`wrapUpModal`): captures only date/discussed/agreed/
      topics-covered — website's `saveWrapUp` also captures meeting time,
      revisit, start/stop/keep, and a 90-day check-in date, none of which
      are reachable from Slack.
    - **Topics**: the website's free-text `notes` field (per-topic,
      separate from `why`) has no Slack equivalent in either
      `listTopicsModal` or `editTopicModal`.
    Not started, not scoped — decide per-field whether it's worth adding
    to a Slack modal (some, like a 90-day check-in date picker, might
    reasonably stay website-only) rather than blindly matching every
    field 1:1.

0g. **NEW, found on the same audit — whole website features with no Slack
    presence at all, never previously mentioned in this file:** the
    check-in wizard's actual Slack absence (the wizard itself is
    referenced once above for its *website* draft-save flow, but never
    flagged as having zero Slack surface), Career conversations
    (`career_answers` table, `app/(dashboard)/career/page.js`,
    `lib/career-content.js`), the manager-only concerns/"Updates" tracker
    (`concerns` table, `app/(dashboard)/performance/page.js`), custom
    suggestions save/delete (`custom_suggestions` table), Documents
    (upload/link/delete, `documents` table + Storage bucket), Handbook
    links (`handbook_links` table), and the quick-notes "Hard
    Conversation" tool (`messages` table, `addFromHardConvo`,
    `one-on-one/page.js` — previously named only once, as a bug-fix
    target, never explained as a feature).

    **Decided 2026-08-29 (later session, Melissa):** all six get some
    Slack presence: career conversations, the concerns tracker
    (manager-only, read-only, matching its RLS/UI restriction), documents
    (view + add-link, not necessarily raw file upload), handbook links
    (view), custom suggestions (save/delete), and the quick-notes/Hard
    Conversation tool (capture from Slack). Not yet built. Open
    sub-question, not resolved: a Slack-side "documents" feature will need
    to decide whether it does read-only viewing or actual upload, given
    Slack's file-handling constraints.

0h. **PARTIALLY DONE, 2026-08-29 later session — see Done section above.**
    The two "worth prioritizing" sub-items below (env-var documentation and
    the `[SLACK_INTEGRATION_DOWN]` log marker) are now closed. Everything
    else below — rate-limit/backoff handling, the OAuth/multi-workspace
    install flow, `app_uninstalled`/`tokens_revoked` handling, and
    idempotency protection on `view_submission` — is still exactly as
    originally found, untouched.

    **NEW, found on a second, independent 2026-08-29 audit specifically
    checking whether this file covers Slack-as-infrastructure, not just
    website-vs-Slack feature parity.** Melissa asked directly: "does it
    reflect Slack also? Not just the app." It didn't, on these points —
    every item 0-0g above is about *feature* parity; none of them are
    about the integration's own plumbing, which has real, undocumented
    exposure:
    - ~~No Slack env vars are documented anywhere.~~ **Done** —
      `.env.local.example` lists only the two Supabase vars — `SLACK_BOT_TOKEN`,
      `SLACK_SIGNING_SECRET`, `SLACK_NOTIFY_WEBHOOK_SECRET`
      (`app/api/slack/notify/route.js`), and `SUPABASE_SERVICE_ROLE_KEY`
      are required by the code but named nowhere for anyone setting up a
      second environment or redeploying from scratch. The migration file
      `supabase/migrations/0005_slack_notify_trigger.sql` already warns,
      in its own comment, that a reset/new-environment scenario makes
      Slack DMs "stop silently" — this is the missing other half of that
      same warning.
    - ~~A dead Slack integration would look completely healthy from the
      website.~~ **Done (the greppable log signal half only — no live
      "integration health" indicator was built)** — every Slack API
      failure (`lib/slack-send.js`,
      `lib/slack-api.js`) fails soft into a `console.error` and nothing
      else — if `SLACK_BOT_TOKEN` expires or a scope gets revoked in
      Slack's admin panel, every DM silently stops while the in-app
      notification bell keeps working fine, so nothing on-screen would
      ever tell anyone the integration died. The database trigger side is
      the same: `net.http_post` in migration 0005 is fire-and-forget, and
      nothing reads back its response for failures.
    - **No rate-limit handling.** `slackApi()` (`lib/slack-api.js`) throws
      on any non-ok response, including a 429 — no backoff, no reading
      `Retry-After`. Low risk at today's single-tiny-workspace scale, but
      `resolveSlackUser` calls Slack's `users.info` on every single click,
      so volume isn't zero.
    - **This only works as one hardcoded workspace — there's no
      install/OAuth flow.** One global bot token and signing secret, no
      `team_id`/`enterprise_id` anywhere in the schema, no
      `oauth.v2.access` call, no Slack app manifest in the repo. Not a bug
      against how it's used today, but a real, unaddressed gap against
      wanting a Slack Marketplace listing eventually (per Melissa's own
      stated longer-term goal) — a Marketplace app fundamentally needs a
      per-workspace install flow, which doesn't exist in any form yet.
    - **`app/api/slack/events/route.js` only ever handles
      `app_home_opened`** (its own header comment says so) — nothing
      handles `app_uninstalled`/`tokens_revoked`, so an uninstall in
      Slack wouldn't be noticed by this app at all.
    - **No idempotency protection**, worth writing down as a known
      assumption rather than a bug: nothing dedups a `view_submission` or
      checks Slack's retry header. Low practical exposure today —
      confirmed Slack does not auto-retry interactivity payloads the way
      it retries Events API deliveries, and the one event type actually
      handled (`app_home_opened`) is naturally safe to replay — but this
      is an assumption the code relies on without stating it anywhere.
    - **What's already solid, confirmed by this second pass, not just
      claimed:** request signature verification (`lib/slack-verify.js`)
      is a proper HMAC-SHA256 timing-safe comparison with a 5-minute
      clock-skew check — genuinely fine as-is, no action needed there.

    None of this is a "drop everything" fix at today's scale (one small
    workspace, low volume) — the two worth prioritizing if any of this
    gets picked up are the env-var documentation (cheap, prevents a real
    future outage) and the silent-failure-on-token-expiry risk (a
    "Slack integration health" indicator somewhere a human would actually
    see, even something as simple as logging a distinctive string worth
    grepping for). The OAuth/multi-workspace gap only matters if the
    Marketplace-listing goal gets picked up.

0i. ~~RLS enforces "is a pair member" everywhere, not "is the *correct*
    pair member," and three tables need the second kind.~~ **Done — closed
    2026-08-29 later session, full detail in the Done section above.**
    Kept as a one-line stub for the same reason as items 1 and 6.
    **Caveat carried over from the Done entry: committed, but not yet
    confirmed applied to the live database** — the migration was handed to
    Melissa to run by hand in the Supabase SQL editor; confirm with her
    before treating the live database as fixed, not just the code.

0j. **Code review of today's full session diff, 2026-08-29 — two real
    security bugs found and fixed immediately, not just documented, plus
    a governance rule added so the class of bug doesn't recur.** Melissa
    asked for a full `/code-review` after the security audit above landed.
    8 finder passes + direct verification found 10 real issues; the two
    most severe were fixed the same session:

    **Fixed (governance rule for this pattern now lives in `CLAUDE.md`,
    not just here):**
    - `edit_topic` (view_submission, `route.js`) updated any topic by the
      id in `view.private_metadata` with zero check that it belonged to
      the submitter's own pair — an admin-client write with no
      authorization check at all, confirmed exploitable, not theoretical.
    - `topic_edit` (block_actions, `route.js`) fetched a topic by
      `action.value` and only checked `created_by_role === ctx.role` — a
      role match against the *entire database*, not this pair — before
      pushing that topic's real text into an Edit modal. A cross-pair
      content leak, same root cause as the item above.
    - Both now select `pair_id` and reject the action outright if it
      doesn't match `ctx.pairId`. Verified live afterward that normal,
      same-pair editing still works (opened Edit, saved, confirmed no
      regression) — this class of fix is exactly the kind that can
      accidentally break the legitimate case while closing the hole.
    - `suggested_pick` (`route.js`) read "why" via plain `fieldVal` instead
      of `fieldValV2` — independently caught by three separate review
      angles, the strongest possible signal it was real. Fixed to use
      `fieldValV2`, matching every other field-read in the same handler.
    - `add_topic` lost its whitespace-only validation when the field
      became Slack-required (Slack's own check only verifies non-empty,
      not non-blank) — could silently create a topic with `text: ""`.
      Restored the check, now returning Slack's inline field error instead
      of silently succeeding.

    **Real, deliberately NOT fixed live — documented instead, because the
    fix is bigger than a same-session patch:**
    - ~~The exact `views.update`-doesn't-refresh-a-field bug fixed for
      Topics today also affects Goals/Development plans/Achievements/
      Feedback's "Save draft" flows.~~ **Done — closed 2026-08-29 later
      session, full detail in the Done section above** ("Save-draft
      blank-field bug generalized across all five modals"). Fixed via a
      shared `lib/slack-form-fields.js` helper instead of copying the `v2`
      hack four more times, as this entry originally proposed.
    - The website's Prepare-tab topic-draft reader still doesn't know
      about the `_v2` key scheme the new shared helper uses — still not
      done, now tracked as its own item, 0l, below.
    - `updateTopic` (`lib/data.js`) does an avoidable SELECT before every
      UPDATE on both its call sites, worth trimming given one of them sits
      inside Slack's 3-second interactivity deadline — low priority, still
      not done, unaffected by today's session.
    - Two small cleanup items remain (not bugs; a third, the `v2` block_id
      scheme's hand-duplication across call sites, is now resolved by the
      shared helper above): `getMyPair` duplicates `resolveSlackUser`'s
      ambiguity-check logic instead of sharing it; the "merge an
      out-of-list category into the picker options" logic is copy-pasted
      three times across two files.

    No CLAUDE.md convention violations found (the repo has one, pointing
    only to the auto-generated `AGENTS.md`, which states no checkable
    coding rule).

0k. **NEW, found 2026-08-29 later session while fixing `feedback_request_answered`'s
    missing pair_id check — the same bug exists in two more places, same
    file, not yet fixed.** `topic_mark_discussed` and `action_mark_done`
    (`app/api/slack/interactivity/route.js`, same `QUICK_ACTIONS` map as
    the new `topic_submit`) have the identical missing-pair_id-check bug as
    the one just fixed for `feedback_request_answered` and the two fixed
    earlier today (`edit_topic`/`topic_edit`) — same bug class, same file,
    not yet fixed. This is the fourth/fifth instance of the exact pattern
    `CLAUDE.md`'s governance rule (added earlier today, see that file)
    exists to prevent. Fix shape: identical to the other four — select
    `pair_id` first and reject the action if it doesn't match `ctx.pairId`,
    before running the mutation.

0l. **NEW, found 2026-08-29 later session — the website's Prepare-tab
    topic-draft reader doesn't know about the new shared `_v2` draft-key
    scheme.** `app/(dashboard)/one-on-one/page.js` doesn't know about the
    `_v2` draft-key scheme the new shared `lib/slack-form-fields.js` helper
    uses — a draft saved from Slack while in v2 mode can show up empty or
    stale on the website. Same root cause as the Save-draft bug just fixed
    for all five Slack modals (see item 0j and the Done section above),
    needs the website-side reader updated to match. Not yet fixed.

0m. **Naming collision worth a look, found 2026-08-29 later session — not
    a bug.** The website's pre-existing `submitTopicForm` (submits the
    *add-topic form* itself) and the new `submitTopicRow` (submits an
    already-added *topic row*, the new item-0 Submit feature) now mean
    very different things despite similar names — flagged as a plausible
    future source of confusion, not renamed since it's out of scope for a
    same-session cleanup.

1. ~~Save / pause / go-back across forms.~~ **Done — Day 1, 2, and 3 all
   shipped 2026-08-24, full detail in the Done section above.** Kept as a
   one-line stub (not deleted) only so items 2-5 below don't have to be
   renumbered — several Done entries above cite them by number ("see open
   item 2/3"), and renumbering would make those citations point at the
   wrong thing. Nothing left to do here.
2. **Multi-pair support: one account, several 1:1 relationships.** This is
   now the biggest open item, and it is not the "rare edge case" the old
   item 2 called it.

   **The finding (2026-08-25).** Melissa confirmed she has two org shapes
   in real use that the app doesn't handle: middle managers (employee on
   one pairing, manager on another) and managers with more than one
   report. They fail in *different* ways, and the difference matters —
   an earlier version of this note wrongly said the database blocks both.

   `supabase/schema.sql` lines 40-41 are two separate partial unique
   indexes: `pairs_employee_id_key` on `employee_id`, and
   `pairs_manager_id_key` on `manager_id`. Read carefully, they allow one
   pairing *per column*, not one pairing per person. So:
   - **Middle manager — the database permits this.** One pairing uses
     their `employee_id`, the other their `manager_id`; neither index is
     violated. The rows exist happily. It's the *app* that breaks on them,
     because `getMyPair` and `resolveSlackUser` both look up by email,
     match both rows, and expect one. This is why the Slack crash was
     reachable in production at all, and it means the case can be
     reproduced today without touching the schema.
   - **Manager with 2+ reports — the database blocks this.** The second
     pairing reuses their `manager_id`, so `create_pair` fails with a
     unique violation before any app code runs. Not reproducible until the
     index is dropped.

   The comment at line 20 states the intent: "v1 is one pair per
   account... a user who needs a second 1:1 relationship needs a second
   account for now."

   **Reproducing the middle-manager case (for 2026-08-26).** Two real
   signups plus one email that never signs up:
   1. Account **A** signs up, onboards as **employee**, partner email =
      `boss@test.com` (never used again). Creates pairing 1 with
      `manager_id` left null.
   2. Account **C** signs up, onboards as **employee**, partner email =
      **A's address**. `create_pair` finds A's profile and sets
      `manager_id = A`, creating pairing 2.

   A is now employee on pairing 1 and manager on pairing 2. Both indexes
   hold (`employee_id`: A, C; `manager_id`: null, A — the partial indexes
   skip nulls). Sign in as A to hit the website bug and the new Slack
   guard.

   Note what this shows: nobody creates this shape deliberately. A sets up
   their own 1:1, their report separately names them as manager, and the
   shape appears from two ordinary actions.

   An earlier version of this recipe paired A and B both ways round. That
   is valid in the database but **cannot be built through the UI**:
   `app/onboarding/page.js:14` redirects to `/dashboard` the moment you
   have a pairing, so B can never create the second one. Which is itself a
   gap in the work list below — there is no "add another pairing" flow
   anywhere in the app, only a first-run one.

   The Slack-side guard shipped 2026-08-25 (see Done) makes this fail
   politely instead of silently. It does not make it work.

   **How pairing works today** (verified 2026-08-25, needed for any of the
   above to make sense):
   - `components/OnboardingForm.js` asks three things: your display name,
     your role (employee or manager, radio), and your partner's **work
     email** — not their name. Line 65: "Your employee's work email."
   - The partner does not need an account. `create_pair`
     (`schema.sql:356`) looks up their profile by email and stores null if
     there isn't one; `handle_new_user` (`schema.sql:329`) backfills
     `employee_id`/`manager_id` the moment that email signs up.
   - Names come later and are editable — `editNameModal`, and the display
     name on the onboarding form. This is what makes a switcher legible,
     and it's why Melissa chose a switcher over a combined view.

   **Decided 2026-08-25 (Melissa):** a **switcher — one pairing at a time**,
   not a combined dashboard. Her reasoning: not everything needs to be on
   one screen, and the editable display name (`editNameModal`) is what
   makes pairings tell apart in the switcher.

   **Decided 2026-08-27 (Melissa):** a manager with multiple pairings
   lands on whichever pairing they last viewed, not a list/switcher page
   first — fewer clicks for the common case of mostly working with one
   person. And the switcher label stays just the other person's name
   ("You & Dana") regardless of your role in that pairing — no "(as
   manager)"/"(as employee)" suffix. Both of the "still to decide" items
   from 2026-08-26 are now settled; nothing left blocking the database
   step on a decision.

   **Pick up here (2026-08-26, updated same day after live testing).**

   The planned repro above (two fresh signups) turned out not to be
   needed — melissaw212@gmail.com already has a real `employee_id` row,
   confirmed live when a throwaway manager account
   (`melissaw212+testboss@gmail.com`, onboarded as manager naming
   melissaw212 as employee) got rejected with
   `duplicate key value violates unique constraint "pairs_employee_id_key"`.
   No test row was written (the duplicate check fails before insert), so
   this cost nothing to try.

   **Tested live, same day: nobody is actually in the broken state.**
   `melissaw212@gmail.com` → `/dashboard` loaded cleanly as **employee** —
   real topics, real activity, no crash. `dhwconsulting3@gmail.com` →
   landed on a completely blank `/onboarding` form — it has **no pairing
   at all**, not a `manager_id` row pointing at melissaw212 as an earlier
   note here wrongly assumed. So the "middle manager already live in
   production" theory is **closed out as false**: melissaw212 holds one
   pairing (employee), dhwconsulting3 holds zero. The bug itself is still
   real and still worth fixing — it just isn't an active incident. Testing
   it now needs the deliberate two-signup recipe above (a fresh pair of
   throwaway accounts), same as originally planned.

   **Repro gotcha found today, worth keeping:** the `/login` page
   silently bounces back to `/onboarding` if the browser still has a
   *different* account's session active — it does not show the login
   form. Fix: sign out first using the app's own **Sign out** button (top
   right of any dashboard page) before requesting a new magic link for a
   different account. Also hit Supabase's default email rate limit after
   ~3-4 magic-link sends in a short window (check **Supabase dashboard →
   Authentication → Rate Limits** for the exact number/reset window if it
   happens again). Neither is a bug worth fixing — just notes so this
   doesn't cost another hour next time.

   **Rate limit checked directly, 2026-08-26 evening — it's 2 emails/hour,
   project-wide.** Read straight from the Supabase dashboard (Auth → Rate
   Limits): "Rate limit for sending emails" is set to **2 emails/h**, and
   it's a single shared bucket for the whole project, not per-address —
   Supabase's default for a project with no custom SMTP provider
   configured. Auth logs confirmed the mechanics: two sends land, a third
   in the same rolling hour gets a 429, and the next success only shows up
   once the window has aged out (12:02pm and 12:20pm succeeded, 12:28pm
   429'd; 1:16pm succeeded, 1:19pm 429'd; then nothing until 8:09pm).

   **Account A finished, verified end-to-end via logs (not just clicking
   through) 2026-08-26 ~8:22pm:** `/otp` 200 at 20:19:01 for
   `melissaw212+accountA@gmail.com` → `/verify` `user_signedup` 303 at
   20:19:35 → `POST /rest/v1/rpc/create_pair` 200 at 20:22:44. Onboarded as
   employee naming `boss@test.com` as manager, exactly per the recipe —
   pairing 1 exists with `manager_id` null.

   **Currently blocked again, same evening: rate limit hit before Account
   C could be created.** The main account's own sign-in (8:09pm) plus
   Account A's signup (8:19pm) already used both of this hour's 2 sends,
   so the send for `melissaw212+accountC@gmail.com` came back rate-limited
   before it could go out at all. Purely a clock question again — wait for
   the hour to roll over, then send once (not twice) to avoid re-tripping
   it.

   **New finding, raised by Melissa while blocked: the 2/hour cap is a
   product risk, not just a testing nuisance.** Her words: "people can't
   get locked out automatically if they make a mistake." She's right —
   this limit is project-wide in production right now, not a test-only
   setting. A real employee or manager who mistypes their email, or whose
   first magic link lands in spam, gets at most one more attempt before a
   full hour of lockout, and support has no fast path to clear it (raising
   the limit is a dashboard change, not something the app can do for
   someone mid-lockout). Worth fixing on its own, independent of the
   multi-pair work — see new open item 3 below. Not yet fixed; only
   observed and written down so it doesn't get lost.

   **Done, 2026-08-27: steps 1-2 complete, step 3's website half confirmed
   live.** Rate limit had cleared (17+ hours since the last 429). Sent one
   magic link to `melissaw212+accountC@gmail.com`, onboarded as **employee**
   naming Account A's real address as manager — `create_pair` succeeded,
   confirming Account A is now a real middle manager (employee on pairing 1
   with `boss@test.com`, manager on pairing 2 with Account C).
   Signed in as Account A (same-tab magic-link flow, to avoid the PKCE
   code-verifier gotcha that prompted the `/login` fix above): landed on
   `/dashboard` as **employee**, no crash, no error — and no indication
   anywhere on screen that a second pairing (as Account C's manager) exists.
   This is the "label problem" the risks section below calls the highest
   risk in the app, now confirmed against a real account rather than
   reasoned about.

   **Retracted, 2026-08-27 (late evening): Account A was never actually a
   middle manager, and the "no crash" observation above is not evidence of
   anything.** Root cause found while trying to verify the discrepancy a
   code-review gut-check flagged (`getMyPair` uses the same
   `.maybeSingle()` pattern the Slack fix removed, so it should crash on a
   real middle manager — but the paragraph above says it didn't).
   `create_pair` (`schema.sql:376`) looked up the partner's profile with a
   plain case-sensitive `where email = partner_email`. Account C had typed
   Account A's address as `melissaw212+accountA@gmail.com` (capital A);
   Supabase Auth stores the real account as
   `melissaw212+accounta@gmail.com` (lowercase, confirmed live). Capital-A
   never matched lowercase-a, so pairing 2's `manager_id` silently stayed
   `null` — confirmed directly against the database:
   ```
   {"id":"29d4b909-...","employee_id":"18e7c6b2-...","manager_id":null,
    "employee_email":"melissaw212+accountc@gmail.com",
    "manager_email":"melissaw212+accountA@gmail.com", ...}
   ```
   `getMyPair`'s query (`employee_id.eq.<A> or manager_id.eq.<A>`) only
   ever matched Account A's *one* genuinely-linked pairing (as employee),
   never two — which is the entire reason `/dashboard` loaded without a
   crash. Not because the app handles the middle-manager case; because the
   test never built the middle-manager case in the first place.
   **Net effect: the `getMyPair` crash risk is unpatched at the code level
   (confirmed via direct `@supabase/postgrest-js` source read —
   `.maybeSingle()` on 2 rows produces a thrown `PGRST116` error, same
   mechanism the Slack fix removed) and still completely unverified against
   real data.** Nobody has actually triggered it yet.

   **Fixed same session, live in production:** `create_pair` and
   `handle_new_user` (`schema.sql`) now lowercase both sides of every email
   comparison and lowercase what gets stored, so this can't recur for any
   *new* pairing; `resolveSlackUser` (`lib/slack-user.js`) now lowercases
   the Slack-side email it compares against `employee_email`/
   `manager_email` for the same reason. Committed `8f6e8b8`. The database
   functions were verified live (not just read from the file) by pasting
   the replacement SQL into the Supabase SQL Editor, running it ("Success.
   No rows returned"), then reading `create_pair` back out with
   `select pg_get_functiondef('create_pair'::regproc)` and confirming the
   `lower(...)` calls are actually in the live function. **This fix does
   not retroactively repair the two orphaned rows below** — those still
   have `manager_id: null` and need to be dealt with by hand.

   **Two orphaned rows still in the database, not yet cleaned up:**
   - `29d4b909-a7a6-4a95-bda4-1da2446519e7` — Account C as employee,
     `manager_id null`, `manager_email` = Account A's address typed with
     capital A.
   - `2a0e4b7b-41a9-42e8-88f4-d00eac08c136` — Account A's real pairing
     (employee, `boss@test.com` as manager) — not orphaned itself, just
     listed here since it's the other half of the same test setup.

   **New finding, 2026-08-27: the Account A/B/C test scheme can't test the
   Slack side at all.** `resolveSlackUser` matches by the email on the
   *Slack* profile of whoever opened the app, and Melissa's real Slack
   identity is `melissaw212@gmail.com` — the plus-addressed test accounts
   have no corresponding Slack member, so they can never trigger the
   ambiguous-pairing path no matter how their web pairings are arranged.
   Testing the Slack half needs the middle-manager shape on the real
   account instead: a new throwaway account signs up as employee naming
   `melissaw212@gmail.com` as manager, which (per the same index logic as
   Account A) succeeds without disturbing her existing employee pairing —
   then delete that throwaway pairing once the Home tab is checked.
   **Attempted, blocked by the rate limit again:** sent one magic link to
   a new throwaway (`melissaw212+accountD@gmail.com`) to start this: the
   *third* send in the rolling hour (after Account C and Account A
   earlier), and it came back "email rate limit exceeded" — confirms open
   item 3 is a live, recurring cost to this work, not just a theoretical
   risk.

   **Done, 2026-08-27 (evening): Slack-side verified against a real
   account — step 1 above, using a different account than originally
   planned.** The magic-link approach (`melissaw212+accountD@gmail.com`)
   was dropped in favor of a simpler path once it was noticed
   `resolveSlackUser` matches on the Slack profile's **email**, not a
   Supabase profile — so the counterpart account never needs to sign up
   for the web app at all, only exist in the Slack workspace. Used
   `melissahr212@gmail.com` ("monty"), an existing real member of the
   workspace, and inserted two `pairs` rows directly (SQL Editor —
   `employee_id`/`manager_id` both null, matching how `create_pair` already
   represents an invited-but-not-joined partner) making monty employee on
   one pairing and manager on the other. Signed into Slack as monty and
   opened the Performance Pulse Home tab: showed "This email address is on
   more than one Performance Pulse pair, and the app doesn't handle that
   yet... we're showing nothing — you'd have no way to tell whose numbers
   you were looking at." — the exact `{ ambiguous: true }` guard from
   2026-08-25, now confirmed on the real Slack Home tab rather than only
   against a stubbed test. Cleanup confirmed done: the two monty rows plus
   two earlier `dhwconsulting3@gmail.com` throwaway rows (from an earlier,
   abandoned attempt at this same test) were deleted via the SQL Editor and
   re-checked directly against the database afterward — all four gone.
   The website-side half was already confirmed live on 2026-08-27 (see
   above): Account A loads `/dashboard` cleanly with no indication a second
   pairing exists. Both halves of the 2026-08-25 fix are now verified.

   **Done, 2026-08-28: orphaned row linked, genuine middle-manager account
   now exists.** Ran `update pairs set manager_id =
   'd07773b0-53a5-4803-8ae1-c966ce56d9c3' where id =
   '29d4b909-a7a6-4a95-bda4-1da2446519e7'` by hand in the Supabase SQL
   Editor (chosen over redoing Account C's onboarding, to avoid tripping
   the email rate limit again). Verified via the REST API afterward:
   `29d4b909...` now has `manager_id: d07773b0-...` (Account A). Account A
   is now employee on `2a0e4b7b...` (partner `boss@test.com`) and manager
   on `29d4b909...` (partner Account C) — a real middle-manager pair, no
   test data invented, ready for the `/dashboard` crash test in step 2
   below.

   **Done, 2026-08-28: code review of the 8f6e8b8/7758f41 case-sensitivity
   fix found it was only half-fixed, and the gap was fixed for real.**
   `resolveSlackUser`'s PostgREST filter (`lib/slack-user.js`) lowercased
   the incoming Slack email but still did a case-sensitive `.eq()` against
   `employee_email`/`manager_email` — so any pairs row written before the
   fix (original typed case, never backfilled) stayed invisible to the
   Slack lookup. Confirmed live against the orphaned row above:
   `29d4b909...`'s `manager_email` is still stored as
   `"melissaw212+accountA@gmail.com"` (capital A). Also found: the
   `lower()`-widened match in `handle_new_user` had no row cap, so two
   pre-existing case-variant rows for the same address could both match one
   `UPDATE` and collide on `pairs_employee_id_key`/`pairs_manager_id_key`,
   aborting the whole signup transaction — a regression the original fix
   introduced, not a pre-existing bug.

   Fixed via `supabase/migrations/0006_citext_emails.sql`, run by hand in
   the SQL Editor: `profiles.email`/`pairs.employee_email`/
   `pairs.manager_email` are now `citext` (case-insensitive text), so every
   `=`/`.eq()` comparison is case-insensitive by construction — no backfill
   of existing rows needed, and no more scattered `lower()` calls to keep in
   sync across `schema.sql` and `lib/slack-user.js`. `handle_new_user`'s two
   `UPDATE`s are narrowed to the single oldest matching row so a legacy
   duplicate-case invite degrades gracefully instead of crashing signup;
   `create_pair`'s partner lookup got the same `limit 1` insurance.
   `lib/slack-user.js`'s `isMgr` comparison also needed a `.toLowerCase()`
   on `pair.manager_email` — citext doesn't change what's returned to JS,
   only how Postgres compares it, so the JS-side `===` still needed fixing
   separately.

   Verified: `npm test` (5/5 pass, same tests as before), `npm run build`
   clean, `npm run lint` clean on both touched files. Verified live against
   production data after running the migration: a single lowercase-email
   REST query (`melissaw212+accounta@gmail.com`) now returns **both**
   `2a0e4b7b...` and `29d4b909...`, even though the second row's
   `manager_email` still has the capital A — proving `resolveSlackUser`
   would now correctly return `{ ambiguous: true }` for Account A's real
   Slack identity instead of silently seeing only one pairing.

   **Done, 2026-08-28: the real `/dashboard` crash test, and the fix.**
   Signed in as Account A (magic link) and loaded `/dashboard` live: it
   crashed with a server error (digest `880917256@E394`) — confirmed to be
   `getMyPair`'s `.maybeSingle()` throwing `PGRST116` on Account A's two
   matching rows, exactly the code-level finding above, now proven against
   real data instead of reasoned about. No `error.js` boundary anywhere
   under `app/`, so the user saw Next's generic "Application error" page
   with no explanation.

   Fixed the same way the Slack side was fixed on 2026-08-25: `getMyPair`
   (`lib/data.js`) now uses `.limit(2)` and returns `{ ambiguous: true }`
   on two rows instead of throwing. `app/(dashboard)/layout.js` — the one
   shared shell every dashboard route renders through, so fixing it here
   covers every `getMyPair` call site without touching each page —
   branches on `pair.ambiguous` and shows a "Multiple pairs not supported
   yet" notice (same wording as the Slack guard) instead of rendering the
   dashboard.

   **Caveat found on a 2026-08-29 audit, corrected by a second pass the
   same day — real but milder than first written.** `components/
   NotificationBell.js:32` calls `getMyPair` a *second* time, independently
   of the one `layout.js` already computed. **The first pass overstated
   what happens next:** line 50 guards with `if (pair?.next_1on1_date)`
   before ever reaching the day-counting logic on line 51, so an
   `{ambiguous: true}` result (which has no `next_1on1_date`) just makes
   that `if` false — the reminder silently doesn't show, there's no
   invalid date, no crash. The redundant second `getMyPair` call is still
   real and still worth cleaning up (one wasted query, and one more place
   that would need updating if the ambiguous-pair shape ever changes), but
   it's a tidiness issue, not a fragility risk the way this entry
   originally described it.

   Verified: `npm run build`, `npm run lint`, `npm test` all clean before
   deploy. Deployed via `vercel --prod`. **Live-verified end to end:**
   reloaded Account A's actually-crashed `/dashboard` tab after deploy —
   it now shows "Multiple pairs not supported yet" instead of the error
   page. Both halves of the middle-manager crash (Slack and website) are
   now fixed and live-verified against the same real account.

   **Not done as part of this fix, on purpose:** this only stops the
   crash. It doesn't let a middle manager actually use either of their
   pairings from the web app — that's the switcher/refactor work below
   (`listMyPairs`, drop the unique indexes), still open.

   Next session, in order:
   1. ~~Deal with the two orphaned rows~~ — done above.
   2. ~~Sign in as Account A and load `/dashboard`~~ — done above; crash
      confirmed and fixed.
   3. Decide on the rate-limit fix (open item 3) — likely raising "Rate
      limit for sending emails" in Supabase's dashboard and/or configuring
      a custom SMTP provider, which typically isn't bound by this default
      at all. Worth doing before more testing, not after — it's now cost
      time twice.
   4. **Only after 3 is done**, start the database/code refactor below
      (`getMyPair` → `listMyPairs`, drop the two unique indexes, add the
      switcher — landing-page and label-format decisions above are
      settled, nothing else is blocking it). Reasoning, unchanged from
      before: dropping `pairs_manager_id_key` is what makes broken states
      creatable, so the app should be ready to handle them first.

   **Done, 2026-08-30: database step written, not yet applied.** Migration
   `supabase/migrations/0010_multi_pair.sql` drops
   `pairs_employee_id_key`/`pairs_manager_id_key`, replaces them with a
   unique index on `(employee_id, manager_id)` (same two people can't be
   paired twice, everything else now allowed), and updates `create_pair` to
   catch that unique violation and raise a readable message instead of a raw
   Postgres error. `supabase/schema.sql` (the from-scratch reference copy)
   updated to match, so a fresh setup doesn't regress to the v1 constraint.
   **Not yet run against the live database** — same as every other
   migration in this project, needs to be pasted into the Supabase SQL
   Editor by hand; nothing changes for real users until that happens. Website
   and Slack code (below) still assume one pairing per account either way —
   this step alone doesn't turn on multi-pair, it only stops the database
   from blocking it.

   **The work, in order.**

   *Database*
   - Drop `pairs_employee_id_key` and `pairs_manager_id_key`. Two lines,
     and everything else depends on it. New migration `0006_`, applied by
     hand in the SQL editor like the rest (this project has no automated
     migrations — see `0005`).
   - Replace them with a unique index on `(employee_id, manager_id)`. Those
     two indexes were also, incidentally, the only thing stopping the same
     two people from being paired twice; dropping them without a
     replacement opens that door.
   - `create_pair` needs a friendlier error for the duplicate case than a
     raw unique violation.
   - Existing rows are unaffected — this only widens what's allowed.

   *Website*
   - `getMyPair` (`lib/data.js`) becomes `listMyPairs`. **Correction,
     found on a 2026-08-29 audit: this list was missing a caller** — it's
     ten call sites, not nine: `app/(dashboard)/layout.js`, `dashboard`,
     `development`, `performance`, `one-on-one`, `export`, `slack`,
     `app/onboarding`, `lib/data.js` itself, and
     `components/NotificationBell.js` — which calls `getMyPair`
     independently rather than reading it from the context `layout.js`
     already computes. Re-grep `getMyPair(` before touching this, don't
     trust this list as final either.
   - "Current pairing" needs somewhere to live. A cookie is less work; a
     URL segment (`/p/<pairId>/dashboard`) costs more but makes it
     impossible for two tabs to disagree about who you're looking at. See
     risks — this choice is the whole ballgame.
   - The switcher itself goes in `app/(dashboard)/layout.js` so it's on
     every page, showing the *other person's* name.
   - **There is no "add another pairing" flow at all.** `app/onboarding`
     is first-run only — it redirects to `/dashboard` as soon as you have
     one pairing, and nothing else creates pairs. So multi-pair support
     needs a way to *make* the second pairing, not just switch between
     pairings that somehow already exist. Easy to miss when scoping this:
     the switcher is the visible half, this is the other half.

   **Done, 2026-08-30: website step built.** `getMyPair` deleted from
   `lib/data.js`, replaced by `listMyPairs` (all pairs for a user, no
   ambiguous sentinel) and `getPair` (one pair by id — used by the 9 call
   sites that only ever needed the *current* pair's row, not a lookup by
   user). Re-grepped `getMyPair(` before starting per the note above; it was
   10 call sites as corrected, all now updated:
   `app/(dashboard)/layout.js`, `dashboard`, `development`, `performance`,
   `one-on-one`, `export`, `slack`, `app/onboarding`, `lib/data.js` itself,
   `components/NotificationBell.js`.

   Went with the cookie (`pp_pair_id`, httpOnly) over a URL segment, per the
   "less work" option above — `app/(dashboard)/layout.js` reads it, falls
   back to the oldest pair if unset or stale, and builds `ctx.pairs` (every
   pairing's id + partner name) alongside the existing `ctx.pairId`. The
   "Multiple pairs not supported yet" block is gone — an account with 2+
   pairs now gets a real dashboard, on whichever pair the cookie names.

   Switcher lives in `AppShell.js`'s topbar (`lib/actions.js` has the
   `setCurrentPair` server action it calls), shown only when `pairs.length >
   1`, labeled with the partner's name — visible on every page, addressing
   the label-problem risk below rather than leaving it unsolved. "Add
   another pairing" flow built as `/onboarding/add`
   (`app/onboarding/add/page.js`), reusing `OnboardingForm` with a new
   `showName={false}` mode (skips the now-redundant name field) — this was
   the missing half noted above; there was genuinely no way to create a
   second pairing from the UI before this.

   Verified: `npm run lint` (34/34, same baseline, no new errors),
   `npm run build` clean (`/onboarding/add` appears as a new route),
   `npm test` (5/5 — Slack-side tests untouched, confirming this pass
   stayed website-only). Local dev server smoke-tested unauthenticated:
   `/dashboard` and `/onboarding/add` both redirect to login cleanly, no
   server errors in the logs.

   **Not yet live-tested against real multi-pair data** — melissaw212's
   account currently holds exactly one pairing, so the single-pair path
   (unchanged behavior) is what got smoke-tested; the switcher itself,
   `/onboarding/add`, and the cookie fallback logic still need a real
   second pairing to click through, the way item 2's log above did for the
   crash fix. **Stale-selection risk (two tabs disagreeing) is unchanged
   from the plan above** — the cookie approach still doesn't solve it, only
   accepted it as the cheaper option.

   *Slack (after the website — the hard part is shared)*
   - `resolveSlackUser` returns all pairings; today's `{ ambiguous: true }`
     sentinel gets replaced by a real selection.
   - Home tab gets the switcher, modals inherit the selection. Block Kit
     Builder helps lay this out, but only the appearance — it knows
     nothing about which pairing is selected or how that's remembered.
   - Decide what a Slack ping says when a manager has three reports (see
     risks).

   **Done, 2026-08-30: Slack step built.** `resolveSlackUser`
   (`lib/slack-user.js`) no longer returns `{ ambiguous: true }` — it always
   resolves one *current* pair (oldest by default) plus a `pairs` list
   (every pairing's id + partner name), the same shape the website's ctx now
   carries. "Current" is persisted in a new table, `slack_pair_selections`
   (`slack_user_id` → `pair_id`), since Slack requests are stateless — no
   cookie to read the way the website has. New migration
   `supabase/migrations/0011_slack_pair_selection.sql` (not yet applied —
   same manual SQL-Editor step as every other migration here).

   Home tab (`homeView`, `lib/slack-views.js`) gets a `static_select` at the
   top, labeled with each pairing's partner name, shown only when
   `pairs.length > 1` — same visibility rule as the website switcher, so the
   label-problem risk below is addressed on both surfaces, not just one.
   Picking an option fires a new `switch_pair` handler
   (`app/api/slack/interactivity/route.js`), which is the one place this
   touches the CLAUDE.md governance rule: `selected_option.value` is a
   plain client-supplied string like any other Slack action value, so the
   new `setSlackPairSelection` (`lib/slack-user.js`) checks it against the
   `pairs` list `resolveSlackUser` just returned for *that* Slack user
   before saving — a tampered value can't set someone else's pair as your
   current one. Modals inherit the selection for free: `ctx` is resolved
   once per request from the saved selection, and every modal/action
   already reads `ctx.pairId`, so nothing else needed touching.
   `multiplePairsHomeView`/`MULTIPLE_PAIRS_NOTICE` and both `ctx?.ambiguous`
   branches (interactivity route) deleted as dead code.

   **Slack pings — turns out already solved, not open.** Checked
   `lib/slack-send.js`/`lib/block-kit.js` while doing this: every ping's
   Block Kit text already includes `*${partnerName}*` (e.g. "*Dana* added a
   goal."), and `sendSlackPing`'s webhook is keyed by `pair_id` from the
   start, not by "the" pair for an account. So a manager with three reports
   already gets three separately-labeled DMs today, not one ambiguous one —
   the open question in the risks list below is answered, no code change
   needed.

   Verified: `npm run lint` (34/34, same baseline), `npm run build` clean,
   `npm test` (7/7 — the 3 middle-manager tests in
   `test/slack-user.test.mjs` rewritten to assert the new pick-a-current-pair
   behavior instead of the removed ambiguous sentinel; 2 new saved-selection
   cases added since that's now real logic worth pinning).

   **Not yet live-tested against real multi-pair Slack data** — same
   limitation as the website step: no real second pairing exists on
   melissaw212's account today, so the switcher itself and
   `setSlackPairSelection`'s ownership check haven't been clicked through
   for real, only exercised via the unit tests above. Migration not yet run
   in Supabase either — nothing in this paragraph is live until both of
   those happen.

   **What's risky.**
   - **The label problem — highest risk in the whole app.** Wrong pairing
     under a plausible name means someone reads their report's private
     notes believing it's their own conversation with their boss. That is
     not a permissions breach, it's a labelling breach, and no amount of
     RLS catches it. Every screen must name the pairing it's showing,
     visibly, not tucked in a corner.
   - **Stale selection.** Two browser tabs, or a Slack modal opened before
     the switch. The cookie approach makes this easy to get wrong in
     exactly the way above.
   - ~~**Slack pings.**~~ Checked 2026-08-30, already fine — see Done above:
     every ping already names the partner (`*${partnerName}* added a
     goal.`) and is sent per-`pair_id`, so three reports already means three
     correctly-labeled DMs, not one ambiguous one.
   - **Already safe, don't break it:** `is_pair_member`
     (`schema.sql:396`) is written per-pairing, not per-person, so reports
     can never see each other no matter how many a manager has. Same for
     `form_drafts` (keyed `pair_id, role, kind`) and `review_drafts`
     (keyed `pair_id, role`) — drafts are already per-pairing. Verified
     2026-08-25 by reading the schema.
   - **Unaudited:** wrap-up/delete flows that assume "your pair" singular.
3. **Magic-link email rate limit can lock a real user out for an hour.**
   Found 2026-08-26 while testing multi-pair (see item 2's log). Supabase
   Auth → Rate Limits has "Rate limit for sending emails" set to **2/hour,
   project-wide** — the default for a project with no custom SMTP
   provider. Melissa's framing: "people can't get locked out automatically
   if they make a mistake." Concretely: a typo'd email, a link that lands
   in spam, or two people signing in around the same time can burn both
   slots, and the next real attempt — from anyone in the workspace, not
   just the person who tripped it — gets a silent lockout with no
   in-app messaging and no fast fix (this is a Supabase dashboard setting,
   not something the app can clear for someone mid-lockout).
   Not fixed yet. Options to weigh: raise the number in the dashboard
   (quick, but still a shared bucket that scales badly as the workspace
   grows); configure a custom SMTP provider (Supabase's docs suggest this
   removes the default cap entirely, un-verified); or add in-app messaging
   so a rate-limited sign-in at least explains itself instead of failing
   silently. Needs a decision, not necessarily code, to start.
4. **Suggested-content pickers elsewhere.** Topics now has one (see Done,
   2026-08-24). Goals/Achievements/Feedback have no suggestion mechanism
   on the website to mirror. Development does, but it's a different,
   keyword-matched "propose activities" flow (button-triggered, not a
   fixed per-category list) — would need its own design for Slack, not a
   copy of the topic pattern.

   **Done, 2026-08-30: Goals now has one too, website and Slack both, and a
   two-part Slack bug found and fixed along the way.** `lib/goals-content.js`'s
   `GOAL_SUGGESTIONS` feeds a category-grouped picker on both surfaces,
   verbatim, matching Topics' pattern. Melissa reported the Slack dropdown
   cutting off mid-word; turned out to be two separate problems, not one:
   - **First bug (fixed, but not the real cause of what she saw):** Slack
     hard-caps a dropdown option's visible text at 75 characters, and the
     code was slicing at exactly 75, mid-word. Fixed in the shared `opt()`
     helper (`lib/slack-views.js`) to cut at the last whole word and add
     "…" — a real fix, reused by every Slack dropdown in the app (this one
     and the Topics suggestion picker), but confirmed live afterward to not
     be what she was actually seeing.
   - **Second bug (the actual cause):** Slack's dropdown menu box is only
     about 35-40 characters wide and does not wrap text to a second line —
     confirmed by opening the live dropdown and zooming into the rendered
     menu. No amount of truncating a single "one string is both the label
     and the value" string fixes that; a full sentence physically cannot
     fit. Fixed by decoupling the two: each `GOAL_SUGGESTIONS` entry now
     carries a short `label` for Slack's menu alongside the full `text`
     that actually gets inserted into the goal field — the website still
     shows `text` directly (no width limit there), so the real goal content
     stays verbatim on both surfaces; only the Slack browsing label is
     short. Confirmed live: the dropdown shows clean short labels, and
     picking one still inserts the complete original sentence.
   Achievements/Feedback/Development still have no picker — unchanged.
5. **Submissions can still exceed Slack's 3s window on a cold start.**
   Measured 2026-08-25 against production with a signed synthetic
   `add_goal` submission: **5.2s cold, 1.76s warm** (both include the
   round trip from a laptop, so the server-side figures are a little
   lower). The 2026-08-25 fix moved the Home-tab republish off this path,
   but `resolveSlackUser` + the save + `clearFormDraft` are all still
   awaited before responding, because Slack needs the response to know
   whether to close the modal or show field errors.
   Lower severity than the opener case was: on a submission timeout the
   row is still written and the ping still fires, so the person sees an
   error over work that actually succeeded — annoying, not lossy.
   The placeholder trick doesn't apply here (there's no view to update
   yet). The real options are to keep the function warm, or to respond
   immediately and move the save into `after()` — but that last one gives
   up server-side validation, so it can only apply to submissions that
   never return `response_action: "errors"` (`add_goal` doesn't;
   `add_topic` does). Needs a decision before it's worth building.

6. ~~You can't tell your own topics apart in Slack's list modals.~~ **Done
   — fixed as a side effect of 2026-08-28's edit-topic work, full detail in
   the Done section above.** Kept as a one-line stub for the same reason
   as item 1. The one thing still worth knowing: this item only ever
   covered Topics — the identical redaction still applies to every other
   kind (goals, achievements, feedback) and is tracked under item 0b
   above, not here.

Not built, deliberately out of scope so far: the `"upcoming"` (1:1
reminder) ping — nothing triggers it yet; it needs a scheduled job, not
just a `notify()` call site.
