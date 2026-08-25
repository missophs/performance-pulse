# Slack integration — status and what's left

Updated 2026-08-25. DM pings (see `lib/block-kit.js` / `lib/slack-send.js`)
and full in-Slack interactivity (Home tab, add/view modals, quick actions —
see `app/api/slack/events/`, `app/api/slack/interactivity/`, `lib/slack-*.js`)
are both live in production.

Done:

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

Still open, in priority order:

1. **Save / pause / go-back across forms — Day 1, 2, and 3 all done.**
   Only the check-in wizard has a real draft-save + resume +
   back-navigation flow (plus a separate, simpler `review_drafts`
   table/pattern used by the review flow — `getReviewDraft`/
   `saveReviewDraft` in `lib/data.js`, one draft per pair+role, upserted)
   and now Topics, Goals, Development, Achievements, and Feedback (give
   mode) all have autosave/restore/discard on their "add new" forms (see
   Done, 2026-08-24). Melissa asked for this explicitly on 2026-08-24
   ("a way to go back... if someone wants to change something before
   they submit") — this is the third and last item from that request;
   the other two (suggested topics, delayed Slack pings) are done, see
   Done section above.

   Agreed plan (2026-08-24), broken over a few days at Melissa's request:
   - **Day 1 (done, 2026-08-24):** `form_drafts` table +
     `getFormDraft`/`saveFormDraft`/`clearFormDraft`, wired into the
     topic-add form as proof of concept. See Done section above.
   - **Day 2 (done, 2026-08-24):** rolled the same pattern to the other
     4 website forms (Goals, Development, Achievements, Feedback — give
     mode). See Done section above.
   - **Day 3 (done, 2026-08-24):** Slack side. Slack can't autosave on
     Cancel/X — `view_closed` drops free-text field values, a platform
     limit, not a bug (see Done section above). Shipped an explicit
     "Save draft" button in each of the 5 add-modals instead: click it
     anytime while filling the form (including the paragraph fields),
     it saves to the same `form_drafts` row the website uses, and shows
     a "Draft saved" confirmation. Reopening that form later — in
     Slack or on the website — comes back pre-filled. Live-verified
     end-to-end, see Done section above.
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

   **Reproducing the middle-manager case (for 2026-08-26).** Two test
   accounts are enough, not three. Create pairing 1 with A as employee and
   B as manager, then pairing 2 with B as employee and A as manager. Each
   `employee_id` and each `manager_id` is then used exactly once, so both
   indexes are satisfied, and *both* accounts become middle managers.
   Signing in as either one exercises the bug on the website and the new
   guard in Slack.

   The Slack-side guard shipped 2026-08-25 (see Done) makes this fail
   politely instead of silently. It does not make it work.

   **Decided 2026-08-25 (Melissa):** a **switcher — one pairing at a time**,
   not a combined dashboard. Her reasoning: not everything needs to be on
   one screen, and the editable display name (`editNameModal`) is what
   makes pairings tell apart in the switcher.

   **Still to decide (2026-08-26):** what a manager lands on — straight
   into the last pairing they viewed, or a list page first; and what the
   switcher shows for a middle manager whose two pairings have different
   roles ("You & Dana" reads the same whether you're the manager or the
   employee in it).

   **Pick up here (2026-08-26).** In order:
   1. Melissa creates the two test accounts above and signs in as one.
      Expect: the website errors (open item 2's root cause, `getMyPair`),
      and the Slack Home tab shows the "more than one pairing" notice
      rather than a blank screen — that second half is the only part of
      the 2026-08-25 fix never verified against a real account.
   2. Answer the landing-page question, then the role-labelling question.
   3. Only then start the database step. Nothing above it is reversible
      by itself: dropping `pairs_manager_id_key` is what makes broken
      states creatable, so the app should be ready to handle them first.

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
   - `getMyPair` (`lib/data.js`) becomes `listMyPairs`. Nine call sites:
     `app/(dashboard)/layout.js`, `dashboard`, `development`,
     `performance`, `one-on-one`, `export`, `slack`, `app/onboarding`, and
     `lib/data.js` itself. They all sit under one shared shell, which is
     the good news.
   - "Current pairing" needs somewhere to live. A cookie is less work; a
     URL segment (`/p/<pairId>/dashboard`) costs more but makes it
     impossible for two tabs to disagree about who you're looking at. See
     risks — this choice is the whole ballgame.
   - The switcher itself goes in `app/(dashboard)/layout.js` so it's on
     every page, showing the *other person's* name.
   - Onboarding / "add a pairing" assumes you have zero or one. Needs to
     handle "add another."

   *Slack (after the website — the hard part is shared)*
   - `resolveSlackUser` returns all pairings; today's `{ ambiguous: true }`
     sentinel gets replaced by a real selection.
   - Home tab gets the switcher, modals inherit the selection. Block Kit
     Builder helps lay this out, but only the appearance — it knows
     nothing about which pairing is selected or how that's remembered.
   - Decide what a Slack ping says when a manager has three reports (see
     risks).

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
   - **Slack pings.** A manager with three reports gets three streams of
     pings and nothing in the current message says which pairing fired.
     Must be fixed with the same care — and *not* by putting topic text in
     the message (see item 5).
   - **Already safe, don't break it:** `is_pair_member`
     (`schema.sql:396`) is written per-pairing, not per-person, so reports
     can never see each other no matter how many a manager has. Same for
     `form_drafts` (keyed `pair_id, role, kind`) and `review_drafts`
     (keyed `pair_id, role`) — drafts are already per-pairing. Verified
     2026-08-25 by reading the schema.
   - **Unaudited:** wrap-up/delete flows that assume "your pair" singular.
3. **Suggested-content pickers elsewhere.** Topics now has one (see Done,
   2026-08-24). Goals/Achievements/Feedback have no suggestion mechanism
   on the website to mirror. Development does, but it's a different,
   keyword-matched "propose activities" flow (button-triggered, not a
   fixed per-category list) — would need its own design for Slack, not a
   copy of the topic pattern.
4. **Submissions can still exceed Slack's 3s window on a cold start.**
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

5. **You can't tell your own topics apart in Slack's list modals.**
   Found by Melissa 2026-08-25: the "Open topics" modal showed two rows
   both reading `Where things stand`, one "added yesterday" and one
   "added just now", and she read it as a duplication bug. It isn't — the
   redaction is working as designed (Slack is a wider trust boundary than
   the app, so topic text never goes there, see the privacy entry in
   Done). But category + relative date is thin: two topics filed under
   the same category are separated only by when they were added, so
   picking which one to "Mark discussed" is close to guesswork.
   Affects every redacted list modal, not just topics.
   No fix chosen yet, and it's a genuine tension rather than an
   oversight: anything that makes the rows distinguishable leaks
   something about the topic. Options worth weighing — an exact date
   instead of "yesterday"; the author's name; a stable per-topic
   reference the app also shows; or accepting the ambiguity and pushing
   "Mark discussed" toward the app, where the text is visible anyway.
   Do not "fix" this by putting topic text in the modal.

Not built, deliberately out of scope so far: the `"upcoming"` (1:1
reminder) ping — nothing triggers it yet; it needs a scheduled job, not
just a `notify()` call site.
