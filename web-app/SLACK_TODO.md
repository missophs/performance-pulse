# Slack integration — status and what's left

Updated 2026-08-24. DM pings (see `lib/block-kit.js` / `lib/slack-send.js`)
and full in-Slack interactivity (Home tab, add/view modals, quick actions —
see `app/api/slack/events/`, `app/api/slack/interactivity/`, `lib/slack-*.js`)
are both live in production.

Done:

- Real Slack DM pings for every `BK_KINDS` kind, sent via
  `app/api/slack/notify/route.js` (a Supabase Database trigger — see
  `notify_slack_on_notification()` in the Supabase SQL Editor; not yet
  captured as a migration file, see below).
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
  per click (website only — see item 3 below for the Slack-side gap,
  still open).
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
  one needs cold-start work, not `after()` — see open item 1 below.

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
2. **Cold starts can still time out the modal-*opening* path.** Distinct
   from the submission fix (see Done, 2026-08-25): `OPENERS` must build the
   modal and call `views.open` within Slack's 3s window because
   `trigger_id` expires, so the work can't move to `after()`. Observed live
   2026-08-25 (first click on "Topics" failed, retry worked). Fixes would
   target cold start / query count itself — e.g. trimming `loadHomeData` to
   just the slice a given modal needs (each opener uses one field of the
   7-query load), or keeping the function warm. Low user impact (retry
   works), but it's the one remaining place a person sees a raw Slack error.
3. **Rare crash:** `resolveSlackUser` (`lib/slack-user.js`) throws if a
   Slack account's email matches an `employee_email` on one pair and a
   `manager_email` on a different pair (a middle-manager org shape) —
   inherited from the same pattern in `getMyPair` (`lib/data.js`), not
   new here, but unguarded in the Slack route. Low priority, real edge
   case.
4. **Migration file gap:** the `pg_net`-based Slack-ping trigger
   (`notify_slack_on_notification()` + the `notifications_slack_notify`
   trigger) exists only as a live object in the Supabase database, not
   in `supabase/migrations/` — would need to be reconstructed by hand if
   the database were ever reset or a new environment stood up.
5. **Suggested-content pickers elsewhere.** Topics now has one (see Done,
   2026-08-24). Goals/Achievements/Feedback have no suggestion mechanism
   on the website to mirror. Development does, but it's a different,
   keyword-matched "propose activities" flow (button-triggered, not a
   fixed per-category list) — would need its own design for Slack, not a
   copy of the topic pattern.
6. **Goal/achievement adds never send a real Slack DM, on Slack or the
   website** (side discovery, 2026-08-24, while testing the delayed-ping
   work above): `SUBMISSIONS.add_goal`/`add_achievement`
   (`app/api/slack/interactivity/route.js`) and their website equivalents
   (`goals/page.js`, `performance/page.js`) never pass a `kind` to
   `notify()`, and `BK_KINDS` (`lib/block-kit.js`) has no `goal`/
   `achievement` id — only an in-app notification ever fires, never a DM.
   `development` plans are inconsistent: the website's `add_devplan` can
   pass the `"dev"` kind conditionally, but Slack's `add_devplan` never
   did. Predates 2026-08-24, not a regression from it. Not fixed —
   flagging in case Melissa wants goals/achievements to actually ping.

Not built, deliberately out of scope so far: the `"upcoming"` (1:1
reminder) ping — nothing triggers it yet; it needs a scheduled job, not
just a `notify()` call site.
