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

Still open, in priority order:

1. **Save / pause / go-back across forms — Day 1 done, Day 2 next.**
   Only the check-in wizard has a real draft-save + resume + back-
   navigation flow (plus a separate, simpler `review_drafts` table/pattern
   used by the review flow — `getReviewDraft`/`saveReviewDraft` in
   `lib/data.js`, one draft per pair+role, upserted) and now the topic-add
   form (see Done, 2026-08-24). Goals, Development, Achievements, Feedback
   still submit immediately with no draft state, and closing a modal
   without saving silently discards what was typed. Melissa asked for
   this explicitly on 2026-08-24 ("a way to go back... if someone wants to
   change something before they submit") — this is the third and last
   item from that request; the other two (suggested topics, delayed Slack
   pings) are done, see Done section above.

   Agreed plan (2026-08-24), broken over a few days at Melissa's request:
   - **Day 1 (done, 2026-08-24):** `form_drafts` table +
     `getFormDraft`/`saveFormDraft`/`clearFormDraft`, wired into the
     topic-add form as proof of concept. See Done section above.
   - **Day 2 (in progress):** roll the same pattern to the other 4
     website forms (Goals, Development, Achievements, Feedback).
   - **Day 3 (not started):** Slack side. Different problem — a Slack
     modal has no multi-step "back," so "don't lose my work" there likely
     means reopening "Add a topic"/etc. restores whatever was last typed,
     not a page-style back button. Needs its own design, not a straight
     port of the website pattern.
2. **Modal submissions in Slack can hit Slack's 3-second response
   window.** `view_submission` handling awaits a full 7-query home-data
   reload + a `views.publish` call before responding — on a cold
   invocation this can time out even though the data already saved.
   Worth moving the refresh after the response, or dropping it from the
   critical path. (`resolveSlackUser` itself was cut from 2 Supabase
   queries to 1 on 2026-08-24, which helps but doesn't fully resolve this.)
3. **Slack-side topic-add still pings instantly.** The batching in
   `app/(dashboard)/one-on-one/page.js` only covers the website (rapid
   adds before leaving the Prepare tab). Adding a topic through Slack's
   own "Add a topic" modal (`SUBMISSIONS.add_topic`) still notifies right
   away. Not part of the 2026-08-24 batching request (that covered goal/
   dev/achievement/feedback only — see Done section above) — could get
   the same `delayedNotify()` treatment if wanted.
4. **Two hand-synced action tables in `interactivity/route.js`.**
   `QUICK_ACTIONS` and the inline `listAgain` object duplicate the same
   three action ids; adding a new quick action to one and forgetting the
   other means a list modal quietly shows stale data with no error.
5. **Rare crash:** `resolveSlackUser` (`lib/slack-user.js`) throws if a
   Slack account's email matches an `employee_email` on one pair and a
   `manager_email` on a different pair (a middle-manager org shape) —
   inherited from the same pattern in `getMyPair` (`lib/data.js`), not
   new here, but unguarded in the Slack route. Low priority, real edge
   case.
6. **Migration file gap:** the `pg_net`-based Slack-ping trigger
   (`notify_slack_on_notification()` + the `notifications_slack_notify`
   trigger) exists only as a live object in the Supabase database, not
   in `supabase/migrations/` — would need to be reconstructed by hand if
   the database were ever reset or a new environment stood up.
7. **Suggested-content pickers elsewhere.** Topics now has one (see Done,
   2026-08-24). Goals/Achievements/Feedback have no suggestion mechanism
   on the website to mirror. Development does, but it's a different,
   keyword-matched "propose activities" flow (button-triggered, not a
   fixed per-category list) — would need its own design for Slack, not a
   copy of the topic pattern.
8. **Goal/achievement adds never send a real Slack DM, on Slack or the
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
