# Slack integration — status and what's left

Updated 2026-08-21. DM pings (see `lib/block-kit.js` / `lib/slack-send.js`)
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
  titles/dates only, never full feedback/goal/achievement/meeting text —
  matches the same promise made in the DM footer and the in-app Slack tab.
- Editable display name — one shared name (`profiles.full_name`) used
  everywhere: website, Slack Home tab, DM pings. Editable from the app
  (click your name, top right) or from Slack itself ("Edit your name" on
  the Home tab).
- Topic-add pings batched into one DM per Prepare session instead of one
  per click (website only — see below for the Slack-side gap).
- Interactivity endpoint fails soft on errors (logs + acks) instead of
  raw-500ing and leaving a button/modal stuck.
- Mark discussed/done/answered buttons are highlighted (primary style).

Still open, in priority order:

1. **Save / pause / go-back across forms.** Only the check-in wizard has
   a real draft-save + resume + back-navigation flow. Topics, Goals,
   Development, Achievements, Feedback all submit immediately with no
   draft state, and closing a modal without saving silently discards
   what was typed. The biggest remaining item — touches `lib/data.js`
   (new draft storage), each form's page, and `components/ui/Modal.js`.
2. **Slack-side topic-add still pings instantly.** The batching in
   `app/(dashboard)/one-on-one/page.js` only covers the website (rapid
   adds before leaving the Prepare tab). Adding a topic through Slack's
   own "Add a topic" modal (`SUBMISSIONS.add_topic` in
   `app/api/slack/interactivity/route.js`) still notifies right away —
   Slack has no equivalent "leave the tab" moment, needs a design call.
3. **Modal submissions in Slack can hit Slack's 3-second response
   window.** `view_submission` handling awaits a full 7-query home-data
   reload + a `views.publish` call before responding — on a cold
   invocation this can time out even though the data already saved.
   Worth moving the refresh after the response, or dropping it from the
   critical path.
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

Not built, deliberately out of scope so far: the `"upcoming"` (1:1
reminder) ping — nothing triggers it yet; it needs a scheduled job, not
just a `notify()` call site.
