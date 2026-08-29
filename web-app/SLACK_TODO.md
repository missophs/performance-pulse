# Slack integration — status and what's left

Updated 2026-08-29 (midday, later). Small styling fix: on the Slack Home
tab, "Wrap up a 1:1" was the only highlighted (green/primary) button among
"Add a topic / Topics / Add an action / Actions / Wrap up a 1:1" — Melissa:
"it should land on add a topic" (her eye went to the green button first,
not the leftmost one). Swapped which button carries `style: "primary"` in
`homeView`, `lib/slack-views.js` — "Add a topic" is now green, "Wrap up a
1:1" is plain. Order unchanged (Add a topic was already leftmost). Verified
build/test clean, deployed, confirmed live in Slack via screenshot.

Updated 2026-08-29 (midday). Slack's "Add a topic" modal required-field
gap is now actually fixed, not just relabeled — supersedes this morning's
entry below. Melissa: "we need to make one or both of the fields required
instead, IT can't have optional an then you get an error."

**What shipped:** "What do you want to discuss" is now a genuinely
required field — Slack blocks submission client-side with its own "Please
complete this required field," no custom server error needed. "Pick a
suggestion" stays optional and, when picked, fills in the required text
field (and category) for you via a `block_actions` round-trip, instead of
being a second independently-submittable source of the topic (the old,
now-removed behavior this morning's entry describes as a "possible
follow-up" — it's done).

**Three real, separate platform bugs found building this, each confirmed
live against the database or server logs, not from how the modal looked:**
1. A `static_select` inside an **input** block never dispatches
   `block_actions` on selection at all — no request, no error, nothing.
   Only elements in a **section**/actions block do. The picker
   (`suggested_pick`, `lib/slack-views.js`) had to move out of an input
   block into a section+accessory to be clickable at all. Cost: its value
   no longer appears in `view.state.values` at submission — fine here,
   since it only ever flows into "text"/"category" via the prefill.
2. Once that worked, `views.update` on an already-open modal doesn't
   reliably push a picked suggestion's category into an existing
   `static_select`'s block_id — confirmed live: modal kept showing "Wins"
   after picking a suggestion clearly grouped under "Where things stand,"
   even though the server-computed value logged correctly. Fix: give the
   field a different block_id ("category_v2") whenever it's being
   pre-filled via views.update, forcing Slack to treat it as new.
3. The same is true of `plain_text_input`, and worse: it **visibly showed
   the right text** ("Is what's expected of you actually clear?" rendered
   correctly in the field) while **silently submitting empty** — a real
   topic got saved with `text: ""` and the right category, caught only by
   querying the database after Save, not from anything visible in Slack.
   Same block_id-swap fix applied to "text" and "why" too
   (`lib/slack-views.js`, `addTopicModal`'s `v2` flag; read on the
   server via the new `fieldValV2` helper and `normalizeTopicDraft`,
   `app/api/slack/interactivity/route.js`).

Verified `npm run build`/`lint`/`test` clean after each of the four
deploys this took (lint 34 pre-existing, unchanged; tests 5/5). Live
end-to-end, checking the actual database after Save each time, not just
the modal: picked a suggestion, confirmed text and category both saved
correctly, deleted the test row after (`00761548-3f28-42fa-bbe1-f0d77178ac21`).
Also confirmed the empty-field case: tried to Save with nothing entered,
got Slack's native required-field block, no server round-trip at all.

Updated 2026-08-29 (morning). Small fix: Slack's "Add a topic" modal
(`addTopicModal`, `lib/slack-views.js`) showed **"Pick a suggestion
(optional) (optional)"** — a literal double label. Cause: the label text
had "(optional)" typed into it manually, and Slack *also* auto-appends
"(optional)" to any input block marked `optional: true`. Fixed by removing
the manual text from that label, and reworded "Or write your own" to "Or
write your own — required if no suggestion picked," since Melissa correctly
flagged that both fields showing "optional" is misleading when the server
actually requires one or the other (`add_topic` handler,
`app/api/slack/interactivity/route.js` line ~192, errors with "Pick a
suggestion above, or write your own topic." if both are empty). Superseded
by the entry above — this rewording was a real improvement but the
underlying gap it describes as a "possible follow-up" is now closed.

Updated 2026-08-28 (even later night). Topic add/edit was live-verified end
to end tonight — it works, on both surfaces. What looked broken during
testing was three unrelated things, not the code: (1) Melissa was clicking
Slack's own sidebar "Home" icon, not the Performance Pulse app's "Home" tab
— same label, different element, same screen; (2) five duplicate Slack tabs
had accumulated in her Chrome from repeated testing, so a fix confirmed in
one tab didn't show in the one she was looking at; (3) Slack's own Block
Kit buttons genuinely do drop clicks intermittently — confirmed directly by
clicking "Edit"/"Save changes" myself and watching zero requests reach
`/api/slack/interactivity` on the failed clicks (Vercel logs). None of the
three needed a code change. **New requirement from tonight, top priority
for next session — see the new item at the top of the open list below:**
adding or editing a topic must **not** trigger a Slack notification.
Notification only on an explicit, separate "Submit" action. Her words,
twice, because the first explanation got it wrong: "Saving changes should
not be submitting... Editing or adding a topic is not the submit either."

Updated 2026-08-28 (late night). Topics can now be **edited after adding**,
on both the website and Slack — was open only as "add" before, at Melissa's
explicit request ("people don't remember what they typed in... they need to
be able to change that, and they need to be able to see what is written").
See item 6's Done entry (moved to the top of the open list previously, now
closed) for the full writeup, including two real bugs this surfaced and
fixed along the way (a category-list mismatch that could silently
mis-save a topic's category, and Slack's stricter modal validation
catching it where the website's plain dropdown silently didn't).

Updated 2026-08-26. DM pings (see `lib/block-kit.js` / `lib/slack-send.js`)
and full in-Slack interactivity (Home tab, add/view modals, quick actions —
see `app/api/slack/events/`, `app/api/slack/interactivity/`, `lib/slack-*.js`)
are both live in production.

Updated 2026-08-27 (late evening). The Slack-side half of the 2026-08-25
fix is verified against a real account. The *website*-side "Account A
verified as a live middle manager" claim below is **retracted** — it was
wrong, caused by a newly-found and now-fixed case-sensitive email bug (see
item 2's Done entries). **Next session starts at item 2's new "Pick up
here" list: clean up the two orphaned test rows, redo the middle-manager
repro correctly, then actually test `getMyPair`/`/dashboard` against it —
that question is still genuinely open.** Everything else in the open list
is smaller or waiting on a decision. Run `npm test` before and after
touching pair lookup.

Done:

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

0. **NEW, top priority — decouple "submit" from add/edit; stop pinging on
   every save.** From tonight's session (2026-08-28), after the topic-edit
   feature above was verified working. Melissa's exact words: "they have to
   submit it to the employee, the manager, so they know that it's done. I
   don't wanna ping right away." Then, correcting my first (wrong) read of
   that: "Saving changes should not be submitting. I've said that to you.
   Editing or adding a topic is not the submit either."

   **Current behavior (why this is a real change, not a tweak):** every
   `BK_KINDS` insert already sends an immediate Slack DM via the
   `notify_slack_on_notification()` Supabase trigger (see Done section,
   "Real Slack DM pings for every `BK_KINDS` kind") — adding a topic pings
   right away today. Topic-add pings are already *batched* into one DM per
   Prepare session (see Done, 2026-08-24) but batching still fires
   automatically, with no explicit user action gating it. What's being
   asked for is different: no ping at all until the user deliberately says
   "this is done," however many times they've added or edited something
   before that.

   **Not yet designed — needs a decision next session, not just code:**
   - Scope: topics only (what tonight's conversation was actually about),
     or every kind that currently pings (goals, actions, achievements,
     feedback, dev plans)? Leaning topics-only to start, matching how the
     edit feature itself was scoped, but confirm with Melissa first.
   - Mechanism: a `submitted_at`/status flag on the row so the DB trigger
     only fires on that transition instead of on insert, vs. a separate
     explicit endpoint the new "Submit" button calls directly (bypassing
     the trigger for these rows). The trigger-flag approach keeps one
     notification path; the explicit-endpoint approach is a bigger
     divergence from how every other kind currently notifies.
   - UI: one "Submit" button per topic, or a batch "Submit all"/"Let them
     know" action from the Prepare tab and Slack Home tab alike (mirrors
     how "Wrap up a 1:1" already batches multiple things into one action)?
   - Website needs the same behavior as Slack — this was asked for on both
     surfaces the same way the edit feature was, so it isn't Slack-only.

   Do not build this by guessing the above — it changes when the other
   person gets notified, which is the one thing this app is careful about
   (see `manager-employee-privacy-is-the-product` — pings already carry
   counts, never content, on purpose). Confirm scope + mechanism with
   Melissa before writing code.

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
   covers all nine `getMyPair` call sites without touching each page —
   branches on `pair.ambiguous` and shows a "Multiple pairs not supported
   yet" notice (same wording as the Slack guard) instead of rendering the
   dashboard.

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
   - **There is no "add another pairing" flow at all.** `app/onboarding`
     is first-run only — it redirects to `/dashboard` as soon as you have
     one pairing, and nothing else creates pairs. So multi-pair support
     needs a way to *make* the second pairing, not just switch between
     pairings that somehow already exist. Easy to miss when scoping this:
     the switcher is the visible half, this is the other half.

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

6. ~~You can't tell your own topics apart in Slack's list modals.~~ **Fixed
   as a side effect of 2026-08-28's edit-topic work, see Done.** Found by
   Melissa 2026-08-25: the "Open topics" modal showed two rows both reading
   `Where things stand`, one "added yesterday" and one "added just now",
   read as a duplication bug — it wasn't, topic text was deliberately
   redacted there (Slack treated as a wider trust boundary than the app).
   That tradeoff was revisited and reversed 2026-08-28 at Melissa's request
   (see Done): `listTopicsModal` now shows the real topic text, which
   removes this ambiguity as a direct consequence — every row is now
   distinguished by its actual words, not just category + relative date.
   Still true for every *other* redacted list modal (goals, achievements,
   feedback) — this item only ever covered topics, and those weren't
   revisited.

Not built, deliberately out of scope so far: the `"upcoming"` (1:1
reminder) ping — nothing triggers it yet; it needs a scheduled job, not
just a `notify()` call site.
