// Slack Interactivity endpoint — every button click and modal submit in the
// Home tab flows through here. Configure in the Slack app under
// Interactivity & Shortcuts, Request URL: https://<deployed-app>/api/slack/interactivity
//
// Payloads arrive as application/x-www-form-urlencoded with one field,
// `payload`, containing the JSON Slack actually cares about.

import { createClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { verifySlackSignature } from "@/lib/slack-verify";
import { resolveSlackUser, setSlackPairSelection } from "@/lib/slack-user";
import { slackApi } from "@/lib/slack-api";
import { loadHomeData } from "@/lib/slack-home-data";
import {
  homeView,
  editNameModal,
  addTopicModal,
  TOPIC_FIELDS,
  listTopicsModal,
  editTopicModal,
  addActionModal,
  listActionsModal,
  editActionModal,
  addGoalModal,
  GOAL_FIELDS,
  listGoalsModal,
  editGoalModal,
  addDevPlanModal,
  DEVPLAN_FIELDS,
  listDevPlansModal,
  addAchievementModal,
  ACHIEVEMENT_FIELDS,
  listAchievementsModal,
  addFeedbackModal,
  FEEDBACK_FIELDS,
  addFeedbackRequestModal,
  listFeedbackModal,
  wrapUpModal,
  lastMeetingModal,
  listHandbookLinksModal,
  loadingModal,
  noticeModal,
} from "@/lib/slack-views";
import { withV2, normalizeDraft, makeFieldValV2 } from "@/lib/slack-form-fields";
import {
  setTopicStatus,
  updateTopic,
  submitTopic,
  toggleActionDone,
  setFeedbackRequestStatus,
  addTopic,
  saveAction,
  deleteAction,
  saveGoal,
  deleteGoal,
  saveDevelopmentPlan,
  deleteDevelopmentPlan,
  addAchievement,
  deleteAchievement,
  deleteTopics,
  addFeedback,
  addFeedbackRequest,
  saveWrapUp,
  notify,
  listMeetings,
  listHandbookLinks,
  updateProfile,
  getFormDraft,
  saveFormDraft,
  clearFormDraft,
} from "@/lib/data";

// Slack's interactivity endpoint is one request/response — there's no
// browser tab to hold state in like the website's topic-add batching. This
// schedules the ping a few seconds after the response goes back to Slack
// (via Next's after()) instead of firing it synchronously on save, so a
// notification never lands before the person's actually done.
const DELAYED_NOTIFY_MS = 4000;
function delayedNotify(admin, pairId, text, role, otherRole, view, kind, entityId) {
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, DELAYED_NOTIFY_MS));
    await notify(admin, pairId, text, role, otherRole, view, kind, entityId).catch((e) => console.error("delayed notify:", e));
  });
}

// Slack drops the interaction if we don't respond in 3s, and a cold start
// plus loadHomeData's 7 queries can blow that on its own — so the Home-tab
// republish is scheduled with after() rather than awaited before responding.
// Callers that already loaded home data pass it in so we don't load twice.
async function refreshHome(admin, ctx, data) {
  const view = homeView(ctx, data ?? (await loadHomeData(admin, ctx.pairId)));
  await slackApi("views.publish", { user_id: ctx.slackUserId, view }).catch((e) => console.error("home publish:", e));
}

// -------------------------------------------------------- open a modal -----

async function draftFor(admin, ctx, kind) {
  const row = await getFormDraft(admin, ctx.pairId, ctx.role, kind).catch(() => null);
  return row?.draft;
}

// Shared "does this Slack-supplied id belong to my pair" check — the exact
// pattern CLAUDE.md's governance rule requires at every handler that reads
// or writes a row using an id Slack handed back to us (action.value,
// view.private_metadata, a select's value). Fetches the row (selecting
// `columns`, which must include pair_id) and returns it only when it
// exists, belongs to ctx.pairId, and passes `extraCheck(row)` if given
// (e.g. created_by_role, status, from_role) — null in every other case, on
// purpose: a caller can't tell "wrong pair" from "right pair, failed an
// extra check" from the return value alone, matching how a tampered or
// replayed id should look no different from one that never existed.
async function verifyOwnedRow(admin, table, columns, id, ctx, extraCheck) {
  if (!id) return null;
  const { data: row } = await admin.from(table).select(columns).eq("id", id).maybeSingle();
  if (!row || row.pair_id !== ctx.pairId) return null;
  if (extraCheck && !extraCheck(row)) return null;
  return row;
}

// `title` is shown in the placeholder modal that opens instantly, so it should
// match the title `build` returns — only the body swaps when the data lands.
const OPENERS = {
  open_edit_name: { title: "Your name", build: async (admin, ctx) => editNameModal(ctx) },
  open_add_topic: { title: "Add a topic", build: async (admin, ctx) => addTopicModal(ctx, normalizeDraft(TOPIC_FIELDS, await draftFor(admin, ctx, "topic"))) },
  open_add_action: { title: "Add an action", build: async (admin, ctx) => addActionModal(ctx) },
  open_wrap_up: { title: "Wrap up", build: async (admin, ctx) => wrapUpModal((await loadHomeData(admin, ctx.pairId)).topics) },
  open_add_goal: { title: "Add a goal", build: async (admin, ctx) => addGoalModal(ctx, normalizeDraft(GOAL_FIELDS, await draftFor(admin, ctx, "goal"))) },
  open_add_devplan: {
    title: "Add a development plan",
    build: async (admin, ctx) => addDevPlanModal(normalizeDraft(DEVPLAN_FIELDS, await draftFor(admin, ctx, "dev"))),
  },
  open_add_achievement: {
    title: "Log an achievement",
    build: async (admin, ctx) => addAchievementModal(normalizeDraft(ACHIEVEMENT_FIELDS, await draftFor(admin, ctx, "achievement"))),
  },
  open_add_feedback: {
    title: "Give feedback",
    build: async (admin, ctx) => addFeedbackModal(ctx, normalizeDraft(FEEDBACK_FIELDS, await draftFor(admin, ctx, "feedback"))),
  },
  open_add_feedback_request: { title: "Ask for feedback", build: async () => addFeedbackRequestModal() },
  // Opened from the digest DM's "Answer it" button (kind "request", see
  // lib/block-kit.js) with the feedback request's id as the button value.
  // Slack-supplied id, so verify it belongs to this pair before threading it
  // into the modal's private_metadata — see the governance note in
  // CLAUDE.md. A request that's missing, already closed, belongs to another
  // pair, or was made *by* the current viewer (from_role === ctx.role — the
  // requester can't answer their own request, matching the website's
  // forMe-gated Answer button in app/(dashboard)/performance/page.js) just
  // falls back to a plain, unlinked feedback modal instead of erroring — the
  // same UX this button gave before this fix existed. No draft prefill in
  // "answer" mode — see addFeedbackModal.
  open_answer_feedback_request: {
    title: "Give feedback",
    build: async (admin, ctx, id) => {
      const request = await verifyOwnedRow(admin, "feedback_requests", "id, pair_id, from_role, status", id, ctx, (row) => row.status === "open" && row.from_role !== ctx.role);
      if (!request) return addFeedbackModal(ctx, normalizeDraft(FEEDBACK_FIELDS, await draftFor(admin, ctx, "feedback")));
      return addFeedbackModal(ctx, undefined, false, request.id);
    },
  },
  open_list_topics: { title: "Open topics", build: async (admin, ctx) => listTopicsModal((await loadHomeData(admin, ctx.pairId)).topics, ctx.role) },
  open_list_actions: { title: "Open actions", build: async (admin, ctx) => listActionsModal((await loadHomeData(admin, ctx.pairId)).actions) },
  open_list_goals: { title: "Goals", build: async (admin, ctx) => listGoalsModal((await loadHomeData(admin, ctx.pairId)).goals) },
  open_list_devplans: { title: "Development plans", build: async (admin, ctx) => listDevPlansModal((await loadHomeData(admin, ctx.pairId)).devPlans) },
  open_list_achievements: { title: "Achievements", build: async (admin, ctx) => listAchievementsModal((await loadHomeData(admin, ctx.pairId)).achievements) },
  open_list_feedback: {
    title: "Feedback",
    build: async (admin, ctx) => {
      const d = await loadHomeData(admin, ctx.pairId);
      return listFeedbackModal(d.feedback, d.feedbackRequests, ctx.role);
    },
  },
  open_last_meeting: { title: "Last 1:1", build: async (admin, ctx) => lastMeetingModal(await listMeetings(admin, ctx.pairId)) },
  open_list_handbook: { title: "Handbook links", build: async (admin, ctx) => listHandbookLinksModal(await listHandbookLinks(admin, ctx.pairId)) },
};

// --------------------------------------------- save a draft mid-modal ------

// Slack's view_closed event drops plain_text_input values (confirmed live —
// a real platform limit, not something fixable here), so a modal can't
// autosave on Cancel/X. A button click doesn't have that limit — it carries
// the full current field state — so each add-modal gets an explicit "Save
// draft" button instead. draftFor() above (used when the modal is opened)
// is what shows the saved draft again later.
// Each `fields` list is expanded with withV2() to also check every field's
// "_v2" block_id (see lib/slack-form-fields.js) — a draft can be captured
// mid-session under either, depending on whether that "Save draft" click
// happened before or after the modal first patched into v2 mode. `build`
// normalizes the merged draft back to plain keys before re-rendering, since
// addXModal's own draft?.foo reads only ever look at the plain ones.
const SAVE_DRAFT = {
  save_draft_topic: { kind: "topic", fields: withV2(TOPIC_FIELDS), build: (ctx, draft) => addTopicModal(ctx, normalizeDraft(TOPIC_FIELDS, draft), true) },
  save_draft_goal: { kind: "goal", fields: withV2(GOAL_FIELDS), build: (ctx, draft) => addGoalModal(ctx, normalizeDraft(GOAL_FIELDS, draft), true) },
  save_draft_devplan: {
    kind: "dev",
    fields: withV2(DEVPLAN_FIELDS),
    build: (ctx, draft) => addDevPlanModal(normalizeDraft(DEVPLAN_FIELDS, draft), true),
  },
  save_draft_achievement: {
    kind: "achievement",
    fields: withV2(ACHIEVEMENT_FIELDS),
    build: (ctx, draft) => addAchievementModal(normalizeDraft(ACHIEVEMENT_FIELDS, draft), true),
  },
  save_draft_feedback: {
    kind: "feedback",
    fields: withV2(FEEDBACK_FIELDS),
    build: (ctx, draft) => addFeedbackModal(ctx, normalizeDraft(FEEDBACK_FIELDS, draft), true),
  },
};

// ----------------------------------------------------- direct mutations ----

// Each quick action pairs its mutation with how to redraw the list modal it
// was clicked from (if any) — kept together so adding one can't mean
// forgetting the other, which used to silently leave a stale list modal.
// Every quick action here is a state change, so each one passes who clicked it
// and that it came from Slack — that's what the History tab reads back.
const fromSlack = (ctx) => ({ actorName: ctx.myName, actorRole: ctx.role, source: "slack" });

const QUICK_ACTIONS = {
  topic_mark_discussed: {
    run: async (admin, ctx, id) => {
      // Was missing this check entirely (SLACK_TODO.md item 0k, found in the
      // 2026-08-29 code-review) — action.value has no server-side ownership
      // check otherwise. See the governance note in CLAUDE.md.
      const topic = await verifyOwnedRow(admin, "topics", "pair_id", id, ctx);
      if (!topic) return;
      await setTopicStatus(admin, id, "Discussed", fromSlack(ctx));
      await notify(admin, ctx.pairId, `Topic marked Discussed by ${ctx.myName}`, ctx.role, ctx.otherRole, "oneOnOne");
    },
    refreshList: (data, ctx) => listTopicsModal(data.topics, ctx.role),
  },
  // Open to both partners, matching the website (TopicList.js has no
  // creator gate on Remove).
  topic_delete: {
    run: async (admin, ctx, id) => {
      const topic = await verifyOwnedRow(admin, "topics", "pair_id", id, ctx);
      if (!topic) return;
      await deleteTopics(admin, [id]);
    },
    refreshList: (data, ctx) => listTopicsModal(data.topics, ctx.role),
  },
  // The explicit "let them know" action (SLACK_TODO.md item 0) — the only
  // thing that pings the partner about a topic now; add_topic above no
  // longer does. id is a plain string in the interaction payload with no
  // server-side ownership check otherwise — this admin client bypasses RLS
  // entirely, so pair_id (and, since Submit is creator-gated the same way
  // Edit is — see listTopicsModal — created_by_role) are checked here
  // before submitting anything, same pattern as topic_edit below. See the
  // governance note in CLAUDE.md. submitTopic itself now does its own
  // atomic "not already submitted" guard (see lib/data.js), so this only
  // needs the one ownership/role fetch — no separate submitted_at
  // pre-check, and no redundant re-fetch of the row submitTopic already
  // touches.
  topic_submit: {
    run: async (admin, ctx, id) => {
      const topic = await verifyOwnedRow(admin, "topics", "pair_id, created_by_role", id, ctx, (row) => row.created_by_role === ctx.role);
      if (!topic) return;
      const submitted = await submitTopic(admin, id, fromSlack(ctx));
      if (!submitted) return; // already submitted by a concurrent click/retry — no duplicate ping
      await notify(admin, ctx.pairId, `${ctx.myName} submitted a topic: ${submitted.text}`, ctx.role, ctx.otherRole, "oneOnOne", "topic");
    },
    refreshList: (data, ctx) => listTopicsModal(data.topics, ctx.role),
  },
  action_mark_done: {
    run: async (admin, ctx, id) => {
      // Was missing this check entirely (SLACK_TODO.md item 0k, found in the
      // 2026-08-29 code-review) — action.value has no server-side ownership
      // check otherwise. See the governance note in CLAUDE.md.
      const task = await verifyOwnedRow(admin, "actions", "pair_id", id, ctx);
      if (!task) return;
      await toggleActionDone(admin, id, true, fromSlack(ctx));
      await notify(admin, ctx.pairId, `${ctx.myName} marked an action done`, ctx.role, ctx.otherRole, "actions");
    },
    refreshList: (data) => listActionsModal(data.actions),
  },
  // Open to both partners, matching the website (no creator gate on Remove
  // for any kind).
  action_delete: {
    run: async (admin, ctx, id) => {
      const task = await verifyOwnedRow(admin, "actions", "pair_id", id, ctx);
      if (!task) return;
      await deleteAction(admin, id);
    },
    refreshList: (data) => listActionsModal(data.actions),
  },
  goal_delete: {
    run: async (admin, ctx, id) => {
      const goal = await verifyOwnedRow(admin, "goals", "pair_id, text", id, ctx);
      if (!goal) return;
      await deleteGoal(admin, id);
      // Matches the website (goals/page.js handleDelete): in-app bell only,
      // no "kind" — deleting a goal doesn't fire a real Slack DM.
      await notify(admin, ctx.pairId, `Goal removed: ${goal.text}`, ctx.role, ctx.otherRole);
    },
    refreshList: (data) => listGoalsModal(data.goals),
  },
  devplan_delete: {
    run: async (admin, ctx, id) => {
      const plan = await verifyOwnedRow(admin, "development_plans", "pair_id, area", id, ctx);
      if (!plan) return;
      await deleteDevelopmentPlan(admin, id);
      // Matches the website (development/page.js handleDeleteDev).
      await notify(admin, ctx.pairId, `Development plan removed: ${plan.area}`, ctx.role, ctx.otherRole);
    },
    refreshList: (data) => listDevPlansModal(data.devPlans),
  },
  achievement_delete: {
    run: async (admin, ctx, id) => {
      const item = await verifyOwnedRow(admin, "achievements", "pair_id", id, ctx);
      if (!item) return;
      await deleteAchievement(admin, id);
    },
    refreshList: (data) => listAchievementsModal(data.achievements),
  },
  // The explicit "close without answering" action (see listFeedbackModal) —
  // real, distinct product behavior from "Answer" (feedback_request_answer
  // below), matching the website's own Dismiss/Withdraw buttons
  // (app/(dashboard)/performance/page.js), not a stand-in for it.
  feedback_request_answered: {
    run: async (admin, ctx, id) => {
      // id is a plain string in the interaction payload with no
      // server-side ownership check otherwise — this admin client bypasses
      // RLS entirely, so pair_id is checked here before closing anything.
      // See the governance note in CLAUDE.md.
      const { data: request } = await admin.from("feedback_requests").select("pair_id").eq("id", id).maybeSingle();
      if (!request || request.pair_id !== ctx.pairId) return;
      await setFeedbackRequestStatus(admin, id, "closed", fromSlack(ctx));
    },
    refreshList: (data, ctx) => listFeedbackModal(data.feedback, data.feedbackRequests, ctx.role),
  },
};

// ------------------------------------------------------- form submissions --

function fieldVal(values, blockId) {
  const f = values?.[blockId]?.val;
  if (!f) return undefined;
  if ("selected_option" in f) return f.selected_option?.value;
  if ("selected_date" in f) return f.selected_date;
  if ("selected_options" in f) return (f.selected_options || []).map((o) => o.value);
  return f.value;
}

// Every "Save draft"-capable add modal (Topics, Goals, Development plans,
// Achievements, Feedback) renders its fields under a "_v2" block_id instead
// when pre-filled via views.update (see lib/slack-form-fields.js) — only
// one of a base/"_v2" pair is ever actually present in a given view, so
// every field read for one of those five forms must try both.
const fieldValV2 = makeFieldValV2(fieldVal);

const SUBMISSIONS = {
  edit_name: async (admin, ctx, v) => {
    const name = (fieldVal(v, "name") || "").trim();
    if (!name) return;
    await updateProfile(admin, ctx.profileId, { full_name: name });
    ctx.myName = name; // so the Home-tab refresh right after this shows the new name immediately
  },
  add_topic: async (admin, ctx, v) => {
    // "text" is a required field (see addTopicModal, lib/slack-views.js), so
    // Slack itself blocks submission before this handler ever runs if it's
    // empty. Picking a suggestion fills this in via a block_actions
    // round-trip (see the "suggested_pick" branch above) rather than being a
    // second, independently-submittable source of the topic text.
    // fieldValV2 checks both the base and "_v2" block_id (see the block_id
    // comment on addTopicModal, lib/slack-views.js) — required for all
    // three fields, not just category: a views.update-prefilled
    // plain_text_input can visibly show the right text while still
    // submitting empty under its original block_id, confirmed live against
    // the database, not just from what the modal displayed.
    const text = (fieldValV2(v, "text") || "").trim();
    // Slack's required-field check only verifies the field is non-empty,
    // not non-whitespace — a submission of only spaces passes Slack's check
    // and trims to "" here, so this still needs its own guard. blockId must
    // name whichever of "text"/"text_v2" is actually rendered right now, or
    // Slack silently drops the error instead of attaching it to the field.
    if (!text) return { error: { blockId: v?.text_v2 ? "text_v2" : "text", message: "Topic can't be empty." } };
    const category = fieldValV2(v, "category") || "Other";
    await addTopic(admin, ctx.pairId, { text, why: fieldValV2(v, "why"), category, role: ctx.role, name: ctx.myName });
    await clearFormDraft(admin, ctx.pairId, ctx.role, "topic").catch(() => {});
    // No ping here — adding a topic is not the submit (SLACK_TODO.md item
    // 0). The pair member who wrote it pings the other side later, from the
    // Open topics list, via the topic_submit quick action below.
  },
  add_action: async (admin, ctx, v) => {
    const text = fieldVal(v, "text");
    await saveAction(admin, ctx.pairId, { text, owner: fieldVal(v, "owner"), due: fieldVal(v, "due"), status: "Open" }, ctx.myName);
    await notify(admin, ctx.pairId, `${ctx.myName} added an action: ${text}`, ctx.role, ctx.otherRole, "actions", "action");
  },
  add_goal: async (admin, ctx, v) => {
    // fieldValV2, not fieldVal, for every field here — see the SAVE_DRAFT
    // comment above: an already-open Goal modal patched via views.update
    // (the "Save draft" confirmation re-render) can visibly show the right
    // value while submitting empty under the base block_id.
    const text = fieldValV2(v, "text");
    await saveGoal(
      admin,
      ctx.pairId,
      {
        text,
        why: fieldValV2(v, "why"),
        measure: fieldValV2(v, "measure"),
        // Goals only ever go manager-to-employee — owner is always the
        // employee, never whoever happens to submit (a manager adding a
        // goal must not end up owning it themselves).
        owner: ctx.role === "manager" ? ctx.partnerName : ctx.myName,
        target: fieldValV2(v, "target"),
        status: fieldValV2(v, "status"),
        progress: 0,
      },
      ctx.myName
    );
    await clearFormDraft(admin, ctx.pairId, ctx.role, "goal").catch(() => {});
    delayedNotify(admin, ctx.pairId, `${ctx.myName} added a goal: ${text}`, ctx.role, ctx.otherRole, "goals", "goal");
  },
  add_devplan: async (admin, ctx, v) => {
    // fieldValV2 — see add_goal above.
    const area = fieldValV2(v, "area");
    await saveDevelopmentPlan(
      admin,
      ctx.pairId,
      { area, type: fieldValV2(v, "type"), activity: fieldValV2(v, "activity"), target: fieldValV2(v, "target"), status: "Not Started" },
      ctx.role,
      ctx.myName
    );
    await clearFormDraft(admin, ctx.pairId, ctx.role, "dev").catch(() => {});
    delayedNotify(admin, ctx.pairId, `${ctx.myName} added a development plan: ${area}`, ctx.role, ctx.otherRole, "development", "dev");
  },
  add_achievement: async (admin, ctx, v) => {
    // fieldValV2 — see add_goal above.
    const title = fieldValV2(v, "title");
    await addAchievement(admin, ctx.pairId, {
      title,
      category: fieldValV2(v, "category"),
      impact: fieldValV2(v, "impact"),
      date: fieldValV2(v, "date"),
      role: ctx.role,
      name: ctx.myName,
    });
    await clearFormDraft(admin, ctx.pairId, ctx.role, "achievement").catch(() => {});
    delayedNotify(admin, ctx.pairId, `${ctx.myName} logged an achievement: ${title}`, ctx.role, ctx.otherRole, "performance", "achievement");
  },
  // Matches the website's atomic answer-a-request behavior
  // (app/(dashboard)/performance/page.js's saveFeedback): saving the entry
  // and closing the request it answers happen together, from one submit,
  // instead of the two disconnected Slack paths this used to be
  // (SLACK_TODO.md item 0e).
  add_feedback: async (admin, ctx, v, view) => {
    // view.private_metadata carries the request id in "answer" mode
    // (addFeedbackModal, lib/slack-views.js) — Slack-supplied, so verify it
    // belongs to this pair before using it to close anything, independently
    // of the check open_answer_feedback_request/feedback_request_answer
    // already did when they pushed this modal: private_metadata is exactly
    // as replayable/tamperable as action.value or a select's option value,
    // so it gets the same re-check at the point it's actually used to write
    // something. See the governance note in CLAUDE.md. Also re-checks
    // status === "open" (a request answered or withdrawn in the gap between
    // opening this modal and submitting it must not get double-closed) and
    // from_role !== ctx.role (a requester can't answer their own request —
    // this hard guard exists because a hidden "Answer" button is not
    // enough, matching this repo's own governance philosophy; see
    // listFeedbackModal). Any failed check just treats this as a standalone
    // "Give feedback" submission, same UX as before this fix existed.
    const requestId = view?.private_metadata || null;
    const request = requestId
      ? await verifyOwnedRow(admin, "feedback_requests", "id, pair_id, from_role, status", requestId, ctx, (row) => row.status === "open" && row.from_role !== ctx.role)
      : null;
    // fieldValV2 — see add_goal above.
    await addFeedback(admin, ctx.pairId, {
      giverRole: ctx.role,
      fromName: ctx.myName,
      toName: ctx.partnerName,
      type: fieldValV2(v, "type"),
      text: fieldValV2(v, "text"),
      example: fieldValV2(v, "example"),
    });
    if (request) {
      // Conditioned on status still being "open" (see setFeedbackRequestStatus,
      // lib/data.js) so a duplicate/retried submission — or one racing another
      // close — can't double-write the close.
      await setFeedbackRequestStatus(admin, request.id, "closed", fromSlack(ctx));
    } else if (!requestId) {
      // "Answer" mode never saves a draft (see addFeedbackModal), so only
      // clear one here for the standalone "Give feedback" path — clearing
      // unconditionally would wipe an unrelated in-progress "Give feedback"
      // draft the same person might separately have going. A requestId that
      // failed verification above stays out of this branch too: it's still
      // "answer" mode as far as the modal that submitted it is concerned.
      await clearFormDraft(admin, ctx.pairId, ctx.role, "feedback").catch(() => {});
    }
    const msg = request ? `${ctx.myName} answered your feedback request` : `${ctx.myName} left you feedback`;
    delayedNotify(admin, ctx.pairId, msg, ctx.role, ctx.otherRole, "performance", "feedback");
  },
  add_feedback_request: async (admin, ctx, v) => {
    const req = await addFeedbackRequest(admin, ctx.pairId, { fromRole: ctx.role, fromName: ctx.myName, about: fieldVal(v, "about"), why: fieldVal(v, "why") });
    // entity_id so the digest DM's "Answer it" button can thread this
    // request's id through (see lib/block-kit.js, lib/slack-send.js).
    delayedNotify(admin, ctx.pairId, `${ctx.myName} asked you for feedback`, ctx.role, ctx.otherRole, "performance", "request", req.id);
  },
  edit_topic: async (admin, ctx, v, view) => {
    const id = view?.private_metadata;
    if (!id) return;
    const text = (fieldVal(v, "text") || "").trim();
    if (!text) return { error: { blockId: "text", message: "Topic can't be empty." } };
    // Runs on the admin (service-role) client, which bypasses RLS entirely —
    // this pair_id check is the only thing stopping a tampered/replayed
    // private_metadata id from editing a different pair's topic. See the
    // governance note in CLAUDE.md.
    const { data: owned } = await admin.from("topics").select("pair_id").eq("id", id).maybeSingle();
    if (!owned || owned.pair_id !== ctx.pairId) return;
    await updateTopic(admin, id, { text, why: fieldVal(v, "why"), category: fieldVal(v, "category") }, fromSlack(ctx));
    // Pushed modals close back to the list beneath them on their own, but
    // that list (payload.view.previous_view_id) still has the pre-edit text
    // baked into its blocks — views.update it too, or the edit would look
    // like it silently didn't take until the next open.
    if (view.previous_view_id) {
      const data = await loadHomeData(admin, ctx.pairId);
      await slackApi("views.update", { view_id: view.previous_view_id, view: listTopicsModal(data.topics, ctx.role) }).catch((e) =>
        console.error("edit topic list refresh:", e)
      );
    }
  },
  edit_goal: async (admin, ctx, v, view) => {
    const id = view?.private_metadata;
    if (!id) return;
    const text = (fieldVal(v, "text") || "").trim();
    if (!text) return { error: { blockId: "text", message: "Goal can't be empty." } };
    // Fetch progress/obstacles/support too, not just for the ownership
    // check — the edit modal has no fields for them, so they'd otherwise get
    // silently wiped by saveGoal's upsert.
    const existing = await verifyOwnedRow(admin, "goals", "pair_id, progress, obstacles, support", id, ctx);
    if (!existing) return;
    await saveGoal(
      admin,
      ctx.pairId,
      {
        id,
        text,
        why: fieldVal(v, "why"),
        measure: fieldVal(v, "measure"),
        // Owner is always the employee — see SUBMISSIONS.add_goal above.
        owner: ctx.role === "manager" ? ctx.partnerName : ctx.myName,
        target: fieldVal(v, "target"),
        status: fieldVal(v, "status"),
        progress: existing.progress,
        obstacles: existing.obstacles,
        support: existing.support,
      },
      ctx.myName
    );
    if (view.previous_view_id) {
      const data = await loadHomeData(admin, ctx.pairId);
      await slackApi("views.update", { view_id: view.previous_view_id, view: listGoalsModal(data.goals) }).catch((e) => console.error("edit goal list refresh:", e));
    }
  },
  edit_action: async (admin, ctx, v, view) => {
    const id = view?.private_metadata;
    if (!id) return;
    const text = (fieldVal(v, "text") || "").trim();
    if (!text) return { error: { blockId: "text", message: "Action can't be empty." } };
    // Fetch status/related/notes too — the edit modal has no fields for
    // them, so they'd otherwise get silently wiped by saveAction's upsert.
    const existing = await verifyOwnedRow(admin, "actions", "pair_id, status, related, notes", id, ctx);
    if (!existing) return;
    await saveAction(
      admin,
      ctx.pairId,
      { id, text, owner: fieldVal(v, "owner"), due: fieldVal(v, "due"), status: existing.status, related: existing.related, notes: existing.notes },
      ctx.myName
    );
    if (view.previous_view_id) {
      const data = await loadHomeData(admin, ctx.pairId);
      await slackApi("views.update", { view_id: view.previous_view_id, view: listActionsModal(data.actions) }).catch((e) => console.error("edit action list refresh:", e));
    }
  },
  wrap_up: async (admin, ctx, v) => {
    const discussedTopicIds = fieldVal(v, "discussed_topics") || [];
    await saveWrapUp(
      admin,
      ctx.pairId,
      { date: fieldVal(v, "date"), discussed: fieldVal(v, "discussed"), agreed: fieldVal(v, "agreed") },
      discussedTopicIds,
      ctx.myName
    );
    await notify(admin, ctx.pairId, `1:1 summary saved by ${ctx.myName}`, ctx.role, ctx.otherRole, "oneOnOne", "wrap");
  },
};

export async function POST(request) {
  const rawBody = await request.text();
  if (!verifySlackSignature(rawBody, request.headers)) {
    return new Response("invalid signature", { status: 401 });
  }

  const form = new URLSearchParams(rawBody);
  const payload = JSON.parse(form.get("payload") || "{}");

  // Opening a modal is the one path with a hard deadline: Slack expires the
  // trigger_id 3s after the click, and a cold start plus a Supabase round trip
  // can miss it. So openers get a fast path that reaches views.open without
  // touching the database at all — see openDeferred.
  const opener = payload.type === "block_actions" ? OPENERS[payload.actions?.[0]?.action_id] : null;
  if (opener) return await openDeferred(opener, payload);

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const slackUserId = payload.user?.id;

  try {
    return await handleInteraction(admin, slackUserId, payload);
  } catch (err) {
    // A Supabase hiccup or a Slack API error here used to raw-500 the whole
    // request — Slack then leaves the button/modal looking stuck with no
    // explanation. Fail soft instead: log it, ack the request either way.
    console.error("slack interactivity failed:", err);
    return Response.json({ ok: true });
  }
}

// Publish a placeholder modal immediately, then fill it in once the data is
// loaded. views.update takes a view_id rather than a trigger_id, so the slow
// half has no deadline. Every exit path replaces the placeholder with
// something, so a click can't leave "Loading…" on screen forever.
async function openDeferred(opener, payload) {
  const opened = await slackApi("views.open", {
    trigger_id: payload.trigger_id,
    view: loadingModal(opener.title),
  }).catch((e) => {
    console.error("loading modal open:", e);
    return null;
  });
  if (!opened?.view?.id) return Response.json({ ok: true });

  after(async () => {
    const viewId = opened.view.id;
    const swap = (view) => slackApi("views.update", { view_id: viewId, view }).catch((e) => console.error("opener view update:", e));
    try {
      const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const ctx = payload.user?.id ? await resolveSlackUser(admin, payload.user.id) : null;
      if (!ctx) {
        await swap(noticeModal(opener.title, "We couldn't match your Slack account to a Performance Pulse profile. Open the app once to link it, then try again."));
        return;
      }
      await swap(await opener.build(admin, ctx, payload.actions?.[0]?.value));
    } catch (err) {
      console.error("opener build failed:", err);
      await swap(noticeModal(opener.title, "Something went wrong loading this. Please close and try again."));
    }
  });

  return Response.json({ ok: true });
}

async function handleInteraction(admin, slackUserId, payload) {
  const ctx = slackUserId ? await resolveSlackUser(admin, slackUserId) : null;
  if (!ctx) return Response.json({ ok: true }); // not linked — nothing we can do

  if (payload.type === "block_actions") {
    const action = payload.actions?.[0];
    if (!action) return Response.json({ ok: true });

    if (SAVE_DRAFT[action.action_id]) {
      const spec = SAVE_DRAFT[action.action_id];
      const values = payload.view?.state?.values;
      const partial = {};
      for (const f of spec.fields) {
        const val = fieldVal(values, f);
        if (val !== undefined) partial[f] = val;
      }
      const existing = await getFormDraft(admin, ctx.pairId, ctx.role, spec.kind).catch(() => null);
      const merged = { ...existing?.draft, ...partial };
      await saveFormDraft(admin, ctx.pairId, ctx.role, spec.kind, merged).catch(() => {});
      if (payload.view?.id) {
        await slackApi("views.update", { view_id: payload.view.id, view: spec.build(ctx, merged) }).catch((e) => console.error("save draft view update:", e));
      }
    } else if (QUICK_ACTIONS[action.action_id]) {
      const spec = QUICK_ACTIONS[action.action_id];
      await spec.run(admin, ctx, action.value);
      // One load feeds both the open list modal and the Home tab republish.
      const data = await loadHomeData(admin, ctx.pairId);
      // The list modal is the visible result of the click, so it stays on the
      // critical path; the Home tab behind it can catch up after the response.
      if (payload.view?.id) {
        await slackApi("views.update", { view_id: payload.view.id, view: spec.refreshList(data, ctx) }).catch((e) => console.error("view update:", e));
      }
      after(() => refreshHome(admin, ctx, data));
    } else if (action.action_id === "topic_edit") {
      // Pushed on top of the open topics-list modal (views.push, not
      // views.open) so Cancel/Save both return to that list rather than the
      // Home tab. A single-row lookup is cheap enough to stay inside
      // Slack's 3s window without the loading-placeholder dance OPENERS uses.
      // pair_id is checked here, not just created_by_role: action.value is a
      // plain string in the interaction payload with no server-side ownership
      // check otherwise — this admin client bypasses RLS entirely, so without
      // this check a tampered value could push another pair's real topic
      // text into this modal. See the governance note in CLAUDE.md.
      const { data: topic } = await admin.from("topics").select("id, pair_id, text, why, category, created_by_role").eq("id", action.value).maybeSingle();
      if (topic && topic.pair_id === ctx.pairId && topic.created_by_role === ctx.role) {
        await slackApi("views.push", { trigger_id: payload.trigger_id, view: editTopicModal(topic) }).catch((e) => console.error("edit topic push:", e));
      }
    } else if (action.action_id === "goal_edit") {
      // Open to both partners (unlike topic_edit) — Goals no longer has a
      // creator-restricted concept now owner is always the employee. Same
      // pair_id check as topic_edit, for the same governance reason.
      const goal = await verifyOwnedRow(admin, "goals", "id, pair_id, text, why, measure, target_date, status", action.value, ctx);
      if (goal) {
        await slackApi("views.push", { trigger_id: payload.trigger_id, view: editGoalModal(goal) }).catch((e) => console.error("edit goal push:", e));
      }
    } else if (action.action_id === "action_edit") {
      const task = await verifyOwnedRow(admin, "actions", "id, pair_id, text, owner_label, due_date", action.value, ctx);
      if (task) {
        await slackApi("views.push", { trigger_id: payload.trigger_id, view: editActionModal(ctx, task) }).catch((e) => console.error("edit action push:", e));
      }
    } else if (action.action_id === "feedback_request_answer") {
      // Clicked from the "Open feedback" list modal (listFeedbackModal) —
      // pushed on top of it (views.push, not views.open) so Cancel/Save
      // both return to that list. action.value is a plain string in the
      // interaction payload with no server-side ownership check otherwise —
      // this admin client bypasses RLS entirely, so pair_id is checked here
      // before threading the id into the modal's private_metadata, same
      // pattern as topic_edit above. Also checked: status === "open", and
      // from_role !== ctx.role — a requester can't answer their own
      // request (listFeedbackModal already hides this button for them; this
      // is the hard guard behind it, since a hidden button on its own isn't
      // enough — see the governance note in CLAUDE.md).
      const request = await verifyOwnedRow(admin, "feedback_requests", "id, pair_id, from_role, status", action.value, ctx, (row) => row.status === "open" && row.from_role !== ctx.role);
      if (request) {
        await slackApi("views.push", { trigger_id: payload.trigger_id, view: addFeedbackModal(ctx, undefined, false, request.id) }).catch((e) =>
          console.error("answer feedback request push:", e)
        );
      }
    } else if (action.action_id === "suggested_pick") {
      // Lives in a section block (see addTopicModal, lib/slack-views.js),
      // not an input block — only section/actions-block elements dispatch
      // block_actions on selection; the same select inside an input block
      // silently never fires at all. Fills in the real, required
      // "text"/"category" fields below, since "suggested_pick" itself is
      // only ever a picker, never saved.
      const picked = action.selected_option?.value || "";
      const sep = picked.indexOf("::");
      const category = sep >= 0 ? picked.slice(0, sep) : undefined;
      const text = sep >= 0 ? picked.slice(sep + 2) : picked;
      // fieldValV2, not fieldVal — after a first suggestion pick the modal
      // is already in v2 mode, so "why" may live under "why_v2". Confirmed
      // live: picking a second suggestion after typing into "Why it
      // matters" silently dropped that text when this used plain fieldVal.
      const why = fieldValV2(payload.view?.state?.values, "why");
      if (payload.view?.id) {
        await slackApi("views.update", { view_id: payload.view.id, view: addTopicModal(ctx, { text, why, category }) }).catch((e) =>
          console.error("suggestion prefill view update:", e)
        );
      }
    } else if (action.action_id === "goal_suggested_pick") {
      // Same section+accessory reasoning as "suggested_pick" above — an
      // input-block select never dispatches block_actions on selection.
      // Goals have no category concept, so this only ever fills "text";
      // every other field's current value is carried forward via
      // fieldValV2 so picking a suggestion doesn't wipe what's already typed.
      const text = action.selected_option?.value || "";
      const values = payload.view?.state?.values;
      const why = fieldValV2(values, "why");
      const measure = fieldValV2(values, "measure");
      const target = fieldValV2(values, "target");
      const status = fieldValV2(values, "status");
      if (payload.view?.id) {
        await slackApi("views.update", { view_id: payload.view.id, view: addGoalModal(ctx, { text, why, measure, target, status }) }).catch((e) =>
          console.error("goal suggestion prefill view update:", e)
        );
      }
    } else if (action.action_id === "switch_pair") {
      const chosenId = action.selected_option?.value;
      if (chosenId && chosenId !== ctx.pairId) {
        try {
          await setSlackPairSelection(admin, ctx.slackUserId, chosenId, ctx.pairs.map((p) => p.id));
          const newCtx = await resolveSlackUser(admin, ctx.slackUserId);
          if (newCtx) await refreshHome(admin, newCtx);
        } catch (e) {
          console.error("switch pair:", e);
        }
      }
    }
    return Response.json({ ok: true });
  }

  if (payload.type === "view_submission") {
    const handler = SUBMISSIONS[payload.view?.callback_id];
    if (handler) {
      const result = await handler(admin, ctx, payload.view.state.values, payload.view);
      if (result?.error) {
        return Response.json({ response_action: "errors", errors: { [result.error.blockId]: result.error.message } });
      }
      // The save already happened above; closing the modal shouldn't wait on
      // the Home-tab republish (see refreshHome). edit_name's ctx.myName
      // mutation lands before this runs, so the refresh still shows the new name.
      after(() => refreshHome(admin, ctx));
    }
    return Response.json({}); // close the modal
  }

  return Response.json({ ok: true });
}
