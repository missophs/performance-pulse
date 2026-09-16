// Slack Interactivity endpoint — every button click and modal submit in the
// Home tab flows through here. Configure in the Slack app under
// Interactivity & Shortcuts, Request URL: https://<deployed-app>/api/slack/interactivity
//
// Payloads arrive as application/x-www-form-urlencoded with one field,
// `payload`, containing the JSON Slack actually cares about.

import { createClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { verifySlackSignature } from "@/lib/slack-verify";
import { resolveSlackUser, setSlackPairSelection, resolvePairContext } from "@/lib/slack-user";
import { slackApi } from "@/lib/slack-api";
import { loadHomeData } from "@/lib/slack-home-data";
import { LD_RULES } from "@/lib/development-content";
import {
  homeView,
  editEmployeeLabelModal,
  addTopicModal,
  TOPIC_FIELDS,
  addHardConvoModal,
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
  wrapUpConversationModal,
  addEmployeeModal,
  lastMeetingModal,
  listHandbookLinksModal,
  listMySuggestionsModal,
  addSuggestionModal,
  addMessageModal,
  listMessagesModal,
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
  wrapUpConversation,
  createPairForSlack,
  resolveEmployeeNameToEmail,
  notify,
  listMeetings,
  listHandbookLinks,
  getHandbookFileUrl,
  listCustomSuggestions,
  addCustomSuggestion,
  deleteCustomSuggestion,
  addMessage,
  updatePair,
  closePair,
  getFormDraft,
  saveFormDraft,
  clearFormDraft,
} from "@/lib/data";
import { dmByEmail } from "@/lib/slack-send";

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
  // Whole body in one try/catch, not just the slackApi call — this runs
  // inside after() with nothing else awaiting it, so a rejection from
  // loadHomeData (a Supabase hiccup) would otherwise be an unhandled
  // rejection instead of the same fail-soft/console.error every other path
  // in this file uses.
  try {
    const view = homeView(ctx, data ?? (await loadHomeData(admin, ctx.pairId)));
    await slackApi("views.publish", { user_id: ctx.slackUserId, view });
  } catch (e) {
    console.error("home publish:", e);
  }
}

// No self-DM on save, for any callback id, ever (confirmSaved removed
// 2026-09-16). SLACK_TODO.md's own standing rule already covered this:
// "Topic-add pings batched into one DM per Prepare session instead of one
// per click" -- one DM per click is exactly what confirmSaved did, self or
// not. A trimmed version briefly kept it for edits/private notes (nothing
// else on the Home tab confirms those), but a DM triggers a real Slack
// notification sound -- unacceptable on every button press, no exceptions.
// Accepted tradeoff: an edit or private note now gives no separate
// confirmation beyond the modal closing. notify()/dmByEmail() calls that
// alert the OTHER pair member are untouched -- that ping is for someone
// who needs to know to respond, not the actor confirming their own click.

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
  // Manager-only: sets pairs.employee_label, the same per-pairing name the
  // website's "Name to show you" field writes -- never the employee's own
  // account name (profiles.full_name).
  open_edit_employee_label: {
    title: "Employee's name",
    build: async (admin, ctx) => (ctx.isMgr ? editEmployeeLabelModal(ctx) : noticeModal("Employee's name", "Only managers can do this.")),
  },
  open_add_topic: { title: "Add a topic", build: async (admin, ctx) => addTopicModal(ctx, normalizeDraft(TOPIC_FIELDS, await draftFor(admin, ctx, "topic"))) },
  open_add_action: { title: "Add an action", build: async (admin, ctx) => addActionModal(ctx) },
  open_add_hardconvo: { title: "Hard conversation", build: async () => addHardConvoModal() },
  open_wrap_up: { title: "Wrap up", build: async (admin, ctx) => wrapUpModal((await loadHomeData(admin, ctx.pairId)).topics, ctx.pairId) },
  open_close_pair: { title: "Mark this as done", build: async (admin, ctx) => wrapUpConversationModal(ctx.pairId, await loadHomeData(admin, ctx.pairId)) },
  // Button is manager-only in homeView too — this re-checks server-side in
  // case of a stale/replayed action, same defense-in-depth as every other
  // role-gated opener here.
  open_add_employee: {
    title: "Add or change employee",
    build: async (admin, ctx) =>
      ctx.isMgr ? addEmployeeModal(ctx) : noticeModal("Add or change employee", "Only managers can do this."),
  },
  open_add_goal: { title: "Add a goal", build: async (admin, ctx) => addGoalModal(ctx, normalizeDraft(GOAL_FIELDS, await draftFor(admin, ctx, "goal"))) },
  open_add_devplan: {
    title: "Add a development plan",
    build: async (admin, ctx) => addDevPlanModal(ctx, normalizeDraft(DEVPLAN_FIELDS, await draftFor(admin, ctx, "dev"))),
  },
  open_add_achievement: {
    title: "Log an achievement",
    build: async (admin, ctx) => addAchievementModal(normalizeDraft(ACHIEVEMENT_FIELDS, await draftFor(admin, ctx, "achievement"))),
  },
  // Button is manager-only in homeView too — this re-checks server-side in
  // case of a stale/replayed action, same defense-in-depth as open_add_employee.
  // Employees still give feedback by answering a request — see
  // open_answer_feedback_request below, which this does not touch.
  open_add_feedback: {
    title: "Give feedback",
    build: async (admin, ctx) =>
      ctx.isMgr
        ? addFeedbackModal(ctx, normalizeDraft(FEEDBACK_FIELDS, await draftFor(admin, ctx, "feedback")))
        : noticeModal("Give feedback", "Only managers can give feedback this way. Ask for feedback, or answer a request from your partner."),
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
  open_list_goals: { title: "Goals", build: async (admin, ctx) => listGoalsModal((await loadHomeData(admin, ctx.pairId)).goals, ctx.isMgr) },
  open_list_devplans: { title: "Development plans", build: async (admin, ctx) => listDevPlansModal((await loadHomeData(admin, ctx.pairId)).devPlans, ctx.isMgr) },
  open_list_achievements: { title: "Achievements", build: async (admin, ctx) => listAchievementsModal((await loadHomeData(admin, ctx.pairId)).achievements) },
  open_list_feedback: {
    title: "Feedback",
    build: async (admin, ctx) => {
      const d = await loadHomeData(admin, ctx.pairId);
      return listFeedbackModal(d.feedback, d.feedbackRequests, ctx.role);
    },
  },
  open_last_meeting: { title: "Last 1:1", build: async (admin, ctx) => lastMeetingModal(await listMeetings(admin, ctx.pairId)) },
  // A link added via the old "paste a link" flow already has l.url; one
  // uploaded via the newer HR upload feature (uploadHandbookFile, lib/data.js)
  // only has a storage_path, so the Slack button needs a real (signed) url
  // resolved before it can render as a link -- see getHandbookFileUrl.
  open_list_handbook: {
    title: "Handbook",
    build: async (admin) => {
      const links = await listHandbookLinks(admin);
      const resolved = await Promise.all(links.map(async (l) => ({ ...l, url: await getHandbookFileUrl(admin, l).catch(() => null) })));
      return listHandbookLinksModal(resolved);
    },
  },
  // Manager-only private scratchpad -- re-checked here same as every other
  // role-gated opener, even though the button is already hidden for
  // employees on the Home tab.
  open_list_suggestions: {
    title: "Private notes",
    build: async (admin, ctx) =>
      ctx.isMgr ? listMySuggestionsModal(await listCustomSuggestions(admin, ctx.pairId), ctx.role) : noticeModal("Private notes", "This is manager-only."),
  },
  open_add_suggestion: {
    title: "Write a private note",
    build: async (admin, ctx) => (ctx.isMgr ? addSuggestionModal(ctx.role) : noticeModal("Write a private note", "This is manager-only.")),
  },
  // Two-way, no isMgr gate -- see the homeView comment on this section.
  open_add_message: { title: "Send a message", build: async () => addMessageModal() },
  open_list_messages: {
    title: "Between you two",
    build: async (admin, ctx) => listMessagesModal((await loadHomeData(admin, ctx.pairId)).messages),
  },
};

// "Edit" buttons clicked from inside an already-open list modal. Same
// trigger_id deadline as OPENERS above, but views.push (not views.open) —
// this used to run inline in handleInteraction's block_actions branch, doing
// resolveSlackUser plus a row lookup before ever touching Slack, which a cold
// start could push past the 3s window with the click then just silently
// doing nothing. Routed through deferredModal now so the placeholder goes up
// first, same as every OPENERS entry. build returning null (row missing,
// wrong pair, already closed, etc.) falls back to deferredModal's own notice.
const PUSH_ACTIONS = {
  topic_edit: {
    title: "Edit topic",
    build: async (admin, ctx, value) => {
      // action.value is a plain string in the interaction payload with no
      // server-side ownership check otherwise — this admin client bypasses
      // RLS entirely, so verifyOwnedRow's pair_id check (plus the
      // created_by_role extraCheck, same as SUBMISSIONS.edit_topic) is what
      // stops a tampered value from pushing another pair's real topic text
      // into this modal. See the governance note in CLAUDE.md.
      const topic = await verifyOwnedRow(admin, "topics", "id, pair_id, text, why, category, created_by_role", value, ctx, (row) => row.created_by_role === ctx.role);
      return topic ? editTopicModal(topic) : null;
    },
  },
  goal_edit: {
    title: "Edit goal",
    build: async (admin, ctx, value) => {
      // Open to both partners (unlike topic_edit) — Goals no longer has a
      // creator-restricted concept now owner is always the employee. Same
      // pair_id check as topic_edit, for the same governance reason.
      const goal = await verifyOwnedRow(admin, "goals", "id, pair_id, text, why, measure, target_date, status", value, ctx);
      return goal ? editGoalModal(goal) : null;
    },
  },
  action_edit: {
    title: "Edit action",
    build: async (admin, ctx, value) => {
      const task = await verifyOwnedRow(admin, "actions", "id, pair_id, text, owner_label, due_date, notes", value, ctx);
      return task ? editActionModal(ctx, task) : null;
    },
  },
  feedback_request_answer: {
    title: "Give feedback",
    build: async (admin, ctx, value) => {
      // action.value is a plain string in the interaction payload with no
      // server-side ownership check otherwise — pair_id is checked here
      // before threading the id into the modal's private_metadata, same
      // pattern as topic_edit above. Also checked: status === "open", and
      // from_role !== ctx.role — a requester can't answer their own
      // request (listFeedbackModal already hides this button for them;
      // this is the hard guard behind it, since a hidden button on its
      // own isn't enough — see the governance note in CLAUDE.md).
      const request = await verifyOwnedRow(admin, "feedback_requests", "id, pair_id, from_role, status", value, ctx, (row) => row.status === "open" && row.from_role !== ctx.role);
      return request ? addFeedbackModal(ctx, undefined, false, request.id) : null;
    },
  },
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
    build: (ctx, draft) => addDevPlanModal(ctx, normalizeDraft(DEVPLAN_FIELDS, draft), true),
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
    // Manager-only per Melissa's 2026-09-13 decision — an employee can edit
    // a goal but must never be able to remove one the manager set. Gated
    // here, not just in the UI, because Slack handlers run on the
    // service-role admin client and bypass RLS entirely (see the
    // governance note in CLAUDE.md); the matching database-level rule is
    // in supabase/migrations/0026_manager_only_delete_goals_devplans.sql.
    run: async (admin, ctx, id) => {
      if (!ctx.isMgr) return;
      const goal = await verifyOwnedRow(admin, "goals", "pair_id, text", id, ctx);
      if (!goal) return;
      await deleteGoal(admin, id);
      // Matches the website (goals/page.js handleDelete): in-app bell only,
      // no "kind" — deleting a goal doesn't fire a real Slack DM.
      await notify(admin, ctx.pairId, `Goal removed: ${goal.text}`, ctx.role, ctx.otherRole);
    },
    refreshList: (data, ctx) => listGoalsModal(data.goals, ctx.isMgr),
  },
  devplan_delete: {
    // Manager-only, same reasoning and same date as goal_delete above.
    run: async (admin, ctx, id) => {
      if (!ctx.isMgr) return;
      const plan = await verifyOwnedRow(admin, "development_plans", "pair_id, area", id, ctx);
      if (!plan) return;
      await deleteDevelopmentPlan(admin, id);
      // Matches the website (development/page.js handleDeleteDev).
      await notify(admin, ctx.pairId, `Development plan removed: ${plan.area}`, ctx.role, ctx.otherRole);
    },
    refreshList: (data, ctx) => listDevPlansModal(data.devPlans, ctx.isMgr),
  },
  achievement_delete: {
    run: async (admin, ctx, id) => {
      const item = await verifyOwnedRow(admin, "achievements", "pair_id", id, ctx);
      if (!item) return;
      await deleteAchievement(admin, id);
    },
    refreshList: (data) => listAchievementsModal(data.achievements),
  },
  // Mirrors addFromSuggestion (page.js): creates a plain unsubmitted topic,
  // no ping until Submit — same as adding one by hand. role, not just
  // pair_id, is checked (extraCheck) since a saved suggestion is scoped to
  // one side of the pair, same as the website's mine.filter(role) gate.
  suggestion_add: {
    run: async (admin, ctx, id) => {
      const s = await verifyOwnedRow(admin, "custom_suggestions", "pair_id, role, text, category", id, ctx, (row) => row.role === ctx.role);
      if (!s) return;
      await addTopic(admin, ctx.pairId, { text: s.text, why: "", category: s.category, role: ctx.role, name: ctx.myName });
    },
    refreshList: (data, ctx) => listMySuggestionsModal(data.customSuggestions, ctx.role),
  },
  suggestion_delete: {
    run: async (admin, ctx, id) => {
      const s = await verifyOwnedRow(admin, "custom_suggestions", "pair_id, role", id, ctx, (row) => row.role === ctx.role);
      if (!s) return;
      await deleteCustomSuggestion(admin, id);
    },
    refreshList: (data, ctx) => listMySuggestionsModal(data.customSuggestions, ctx.role),
  },
  // The explicit "close without answering" action (see listFeedbackModal) —
  // real, distinct product behavior from "Answer" (feedback_request_answer
  // below), matching the website's own Dismiss/Withdraw buttons
  // (app/(dashboard)/performance/page.js), not a stand-in for it.
  feedback_request_answered: {
    run: async (admin, ctx, id) => {
      // id is a plain string in the interaction payload with no
      // server-side ownership check otherwise — this admin client bypasses
      // RLS entirely, so pair_id is checked here before closing anything,
      // via the same shared verifyOwnedRow guard every other handler in
      // this file uses. See the governance note in CLAUDE.md.
      const request = await verifyOwnedRow(admin, "feedback_requests", "pair_id", id, ctx);
      if (!request) return;
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
  // Manager-only: writes pairs.employee_label, never the employee's own
  // profiles.full_name -- see editEmployeeLabelModal in lib/slack-views.js.
  edit_employee_label: async (admin, ctx, v) => {
    if (!ctx.isMgr) return { skip: true };
    const label = (fieldVal(v, "label") || "").trim();
    await updatePair(admin, ctx.pairId, { employee_label: label || null });
    // So the Home-tab refresh right after this shows the new label
    // immediately, same trick as edit_name's ctx.myName above.
    ctx.partnerName = label || ctx.pair.employee?.full_name || ctx.pair.employee_email;
  },
  // Closes out open topics/goals/actions for the pair (see wrapUpConversation
  // in lib/data.js) -- the pairing itself is never touched, unlike the old
  // behavior this replaced. Nothing about the OTHER side's Home tab data
  // changes on its own without a fresh open, so this DMs them directly, by
  // email, to make sure they actually see it and know they can keep adding
  // to the pairing.
  // Same staleness risk as wrap_up above: a multi-pair manager can switch
  // their active pair via "switch_pair" while this modal is still open, so
  // ctx.pairId can be a DIFFERENT pair than the one open_close_pair actually
  // opened this for. Pin/re-resolve exactly like wrap_up does — see the
  // governance note in CLAUDE.md and the comment on that handler.
  wrap_up_conversation: async (admin, ctx, v, view) => {
    const pinnedPairId = view?.private_metadata;
    if (!pinnedPairId || !ctx.pairs.some((p) => p.id === pinnedPairId)) return { skip: true };
    const pairCtx = pinnedPairId === ctx.pairId ? ctx : await resolvePairContext(admin, ctx.email, pinnedPairId);
    if (!pairCtx) return { skip: true }; // pair closed/deleted between open and submit
    const note = (fieldVal(v, "note") || "").trim();
    // Each checked option is "type:id" (see wrapUpConversationModal) -- one
    // parse covers all three checkbox blocks. Only what was actually picked
    // closes; anything left unchecked is never touched (Melissa, 2026-09-16).
    const picked = [...(fieldVal(v, "done_topics") || []), ...(fieldVal(v, "done_goals") || []), ...(fieldVal(v, "done_actions") || [])];
    const idsOf = (type) => picked.filter((p) => p.startsWith(`${type}:`)).map((p) => p.slice(type.length + 1));
    const selectedIds = { topicIds: idsOf("topic"), goalIds: idsOf("goal"), actionIds: idsOf("action") };
    const { topics, goals, actions } = await wrapUpConversation(admin, pairCtx.pairId, selectedIds, fromSlack(pairCtx));
    if (!topics && !goals && !actions && !note) return; // nothing picked, nothing written -- no need to DM an empty summary
    const otherEmail = pairCtx.isMgr ? pairCtx.pair.employee_email : pairCtx.pair.manager_email;
    const text = `${pairCtx.myName} marked some things done on your 1:1 -- ${topics} topic(s), ${goals} goal(s), and ${actions} action(s) closed out. Your pairing is unaffected, and you can keep adding topics or actions any time.${note ? `\n\nNote: ${note}` : ""}`;
    await dmByEmail(otherEmail, { text }).catch((e) => console.error("wrap up conversation notify:", e));
  },
  // Manager-only (also gated in OPENERS above). createPairForSlack takes
  // ctx.profileId/ctx.email -- the caller's own already-verified Slack
  // identity -- never anything from the submitted form, so there's no way to
  // create a pair naming someone other than yourself as manager. The new
  // pair doesn't show up in ctx.pairs until the Home tab is next reopened
  // (resolveSlackUser re-runs fresh then) -- same lazy staleness a reopened
  // pairing already accepts for the other side.
  add_employee: async (admin, ctx, v) => {
    if (!ctx.isMgr) return { skip: true };
    const raw = (fieldVal(v, "email") || "").trim();
    // Accept either a real email or an exact name already on the HR roster
    // (see resolveEmployeeNameToEmail, lib/data.js) -- a manager typing a
    // name they got wrong just fails the same "not a valid email, and no
    // roster match" check below, rather than silently creating a pairing to
    // a fabricated address.
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
    const email = looksLikeEmail ? raw.toLowerCase() : await resolveEmployeeNameToEmail(admin, raw).catch(() => null);
    if (!email) {
      return { error: { blockId: "email", message: "That doesn't look like a valid email or an exact name already on the roster." } };
    }
    if (email === ctx.email) {
      return { error: { blockId: "email", message: "That's your own email." } };
    }
    // "archive" closes the pairing this modal was opened from (ctx.pairId,
    // already verified as this manager's own -- never a Slack-supplied id),
    // same closePair() the website/HR route uses. "keep" leaves it
    // untouched -- the original "Add a new employee" behavior. New pair
    // created FIRST, archive only on success -- if createPairForSlack fails
    // (e.g. a duplicate-pairing constraint), nothing is archived, so a
    // failed attempt never leaves the manager with the old employee gone
    // and no replacement.
    const keepCurrent = fieldVal(v, "keep_current");
    try {
      await createPairForSlack(admin, ctx.profileId, ctx.email, email);
      if (keepCurrent === "archive") {
        await closePair(admin, ctx.pairId, `Replaced by ${email}`);
      }
    } catch (e) {
      return { error: { blockId: "email", message: e.message } };
    }
    // Deferred, not awaited here -- the pair is already created; a slow DM
    // send shouldn't risk pushing the view_submission response past Slack's
    // ack window, same reasoning as every other post-write side effect in
    // this file (see refreshHome below).
    after(() =>
      dmByEmail(email, { text: `${ctx.myName} added you as their direct report on Performance Pulse. Open the app to say hello.` }).catch((e) =>
        console.error("add employee notify:", e)
      )
    );
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
    // Same whitespace-only gap add_topic's own comment above already
    // guards against: Slack's required-field check only verifies non-empty,
    // not non-whitespace.
    const text = (fieldVal(v, "text") || "").trim();
    if (!text) return { error: { blockId: "text", message: "Action can't be empty." } };
    await saveAction(admin, ctx.pairId, { text, owner: fieldVal(v, "owner"), due: fieldVal(v, "due"), notes: fieldVal(v, "notes"), status: "Open" }, ctx.myName);
    await notify(admin, ctx.pairId, `${ctx.myName} added an action: ${text}`, ctx.role, ctx.otherRole, "actions", "action");
  },
  add_goal: async (admin, ctx, v) => {
    // fieldValV2, not fieldVal, for every field here — see the SAVE_DRAFT
    // comment above: an already-open Goal modal patched via views.update
    // (the "Save draft" confirmation re-render) can visibly show the right
    // value while submitting empty under the base block_id.
    // Same whitespace-only gap add_topic's own comment above already
    // guards against: Slack's required-field check only verifies non-empty,
    // not non-whitespace.
    const text = (fieldValV2(v, "text") || "").trim();
    if (!text) return { error: { blockId: v?.text_v2 ? "text_v2" : "text", message: "Goal can't be empty." } };
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
      {
        area,
        why: fieldValV2(v, "why"),
        type: fieldValV2(v, "type"),
        activity: fieldValV2(v, "activity"),
        support: fieldValV2(v, "support"),
        measure: fieldValV2(v, "measure"),
        target: fieldValV2(v, "target"),
        status: "Not Started",
      },
      ctx.role,
      ctx.myName
    );
    await clearFormDraft(admin, ctx.pairId, ctx.role, "dev").catch(() => {});
    delayedNotify(admin, ctx.pairId, `${ctx.myName} added a development plan: ${area}`, ctx.role, ctx.otherRole, "development", "dev");
  },
  // Mirrors addFromHardConvo (app/(dashboard)/one-on-one/page.js) exactly:
  // writes a submitted:true topic (Slack-silent — notify()'s kind is left
  // undefined so it never earns a real DM, same as the website path) rather
  // than a fresh "Add a topic" that would show a Submit button.
  add_hardconvo: async (admin, ctx, v) => {
    const outcome = fieldValV2(v, "outcome");
    const facts = fieldValV2(v, "facts");
    const theirView = fieldValV2(v, "theirView");
    const ask = fieldValV2(v, "ask");
    const body = [
      outcome && `Outcome I want: ${outcome}`,
      facts && `The facts: ${facts}`,
      theirView && `How they might see it: ${theirView}`,
      ask && `What I'm asking for: ${ask}`,
    ]
      .filter(Boolean)
      .join("\n");
    await addTopic(admin, ctx.pairId, { text: outcome, why: body, category: "Other", role: ctx.role, name: ctx.myName, submitted: true });
    await notify(admin, ctx.pairId, `${ctx.myName} added a topic to the agenda`, ctx.role, ctx.otherRole, "oneOnOne");
  },
  // Matches saveCustomSuggestion (page.js): no notify() call at all, same as
  // the website — a saved suggestion is a private note-to-self, not
  // something the partner is told about.
  add_suggestion: async (admin, ctx, v) => {
    if (!ctx.isMgr) return { skip: true }; // manager-only -- re-checked same as the opener
    const text = fieldValV2(v, "text");
    const category = fieldValV2(v, "category");
    await addCustomSuggestion(admin, ctx.pairId, ctx.role, text, category);
  },
  // No isMgr gate (two-way) and no notify() call -- matches
  // sendMessage/addMessage on the website exactly (see the homeView
  // comment): deliberately quiet, not something the partner is pinged
  // about.
  add_message: async (admin, ctx, v) => {
    const kind = fieldVal(v, "kind");
    const text = (fieldVal(v, "text") || "").trim();
    if (!text) return { error: { blockId: "text", message: "Message can't be empty." } };
    await addMessage(admin, ctx.pairId, kind, text, ctx.role, ctx.myName);
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
    // Standalone giving (no verified request behind it) is manager-only,
    // same as open_add_feedback above and add_employee's !ctx.isMgr guard —
    // the Home tab button being hidden isn't enough on its own (governance
    // note in CLAUDE.md). An employee answering a real request still passes,
    // since `request` is truthy for them.
    if (!request && !ctx.isMgr) return { skip: true };
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
    if (!id) return { skip: true };
    const text = (fieldVal(v, "text") || "").trim();
    if (!text) return { error: { blockId: "text", message: "Topic can't be empty." } };
    // Runs on the admin (service-role) client, which bypasses RLS entirely —
    // this check is the only thing stopping a tampered/replayed
    // private_metadata id from editing a topic it shouldn't. Re-checks both
    // pair_id AND created_by_role here, independently of the same checks
    // PUSH_ACTIONS.topic_edit already did when it pushed this modal:
    // private_metadata is exactly as replayable/tamperable as action.value,
    // so (matching add_feedback's same reasoning below) it needs the same
    // re-check at the point it's actually used to write something, not just
    // at open time. Without created_by_role here, a forged submission naming
    // a same-pair-but-other-role topic id would silently pass the pair_id
    // check alone. See the governance note in CLAUDE.md.
    const owned = await verifyOwnedRow(admin, "topics", "pair_id, created_by_role", id, ctx, (row) => row.created_by_role === ctx.role);
    if (!owned) return { skip: true };
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
    if (!id) return { skip: true };
    const text = (fieldVal(v, "text") || "").trim();
    if (!text) return { error: { blockId: "text", message: "Goal can't be empty." } };
    // Fetch progress/obstacles/support too, not just for the ownership
    // check — the edit modal has no fields for them, so they'd otherwise get
    // silently wiped by saveGoal's upsert.
    const existing = await verifyOwnedRow(admin, "goals", "pair_id, progress, obstacles, support", id, ctx);
    if (!existing) return { skip: true };
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
      await slackApi("views.update", { view_id: view.previous_view_id, view: listGoalsModal(data.goals, ctx.isMgr) }).catch((e) => console.error("edit goal list refresh:", e));
    }
  },
  edit_action: async (admin, ctx, v, view) => {
    const id = view?.private_metadata;
    if (!id) return { skip: true };
    const text = (fieldVal(v, "text") || "").trim();
    if (!text) return { error: { blockId: "text", message: "Action can't be empty." } };
    // Fetch status/related too — the edit modal has no fields for them, so
    // they'd otherwise get silently wiped by saveAction's upsert.
    const existing = await verifyOwnedRow(admin, "actions", "pair_id, status, related", id, ctx);
    if (!existing) return { skip: true };
    await saveAction(
      admin,
      ctx.pairId,
      { id, text, owner: fieldVal(v, "owner"), due: fieldVal(v, "due"), notes: fieldVal(v, "notes"), status: existing.status, related: existing.related },
      ctx.myName
    );
    if (view.previous_view_id) {
      const data = await loadHomeData(admin, ctx.pairId);
      await slackApi("views.update", { view_id: view.previous_view_id, view: listActionsModal(data.actions) }).catch((e) => console.error("edit action list refresh:", e));
    }
  },
  wrap_up: async (admin, ctx, v, view) => {
    // The modal was opened for a specific pair (view.private_metadata, set
    // by wrapUpModal) — a multi-pair Slack user (manager with 2+ reports)
    // can switch their active pair via "switch_pair" while this modal is
    // still open, so ctx.pairId here can be a DIFFERENT pair than the one
    // this wrap-up is actually about. Verify the pinned id is one of THIS
    // Slack user's own pairs (not a fresh ownership check against ctx.pairId
    // — that's exactly the stale value being guarded against here), then use
    // that pair's own role/name context for the whole save. See the
    // governance note in CLAUDE.md and the comment on wrapUpModal.
    const pinnedPairId = view?.private_metadata;
    if (!pinnedPairId || !ctx.pairs.some((p) => p.id === pinnedPairId)) return { skip: true };
    const pairCtx = pinnedPairId === ctx.pairId ? ctx : await resolvePairContext(admin, ctx.email, pinnedPairId);
    if (!pairCtx) return { skip: true }; // pair closed/deleted between open and submit
    const discussed = (fieldVal(v, "discussed") || "").trim();
    const agreed = (fieldVal(v, "agreed") || "").trim();
    if (!discussed && !agreed) return { error: { blockId: "discussed", message: "Add at least what you discussed or what you agreed on." } };
    // discussed_topics is a Slack checkboxes value — its ids come straight
    // from the payload with no server-side ownership check otherwise, and
    // saveWrapUp's delete (lib/data.js) has no pair_id filter of its own
    // (it relies on RLS, which this admin client bypasses entirely). Filter
    // down to ids that actually belong to this pair before anything gets
    // deleted, same pattern as every other id-from-Slack write in this file.
    // See the governance note in CLAUDE.md.
    const rawTopicIds = fieldVal(v, "discussed_topics") || [];
    let discussedTopicIds = [];
    if (rawTopicIds.length) {
      const { data: owned, error: ownedErr } = await admin.from("topics").select("id").eq("pair_id", pairCtx.pairId).in("id", rawTopicIds);
      if (ownedErr) throw ownedErr;
      discussedTopicIds = (owned || []).map((t) => t.id);
    }
    await saveWrapUp(
      admin,
      pairCtx.pairId,
      {
        date: fieldVal(v, "date"),
        // Same source as the website's wrap-up: the pair's scheduled 1:1 time, not a form field.
        time: pairCtx.pair.next_1on1_time || null,
        discussed,
        agreed,
        revisit: fieldVal(v, "revisit"),
        start: fieldVal(v, "start"),
        stop: fieldVal(v, "stop"),
        keep: fieldVal(v, "keep"),
        checkin90: fieldVal(v, "checkin90"),
      },
      discussedTopicIds,
      pairCtx.myName
    );
    const next = fieldVal(v, "next");
    if (next) {
      await updatePair(admin, pairCtx.pairId, { next_1on1_date: next });
      if (pairCtx === ctx) ctx.pair.next_1on1_date = next; // so the Home-tab refresh right after this shows the new date (same as edit_name) — only meaningful when the wrap-up's pair is still the active one
    }
    await notify(admin, pairCtx.pairId, `1:1 summary saved by ${pairCtx.myName}`, pairCtx.role, pairCtx.otherRole, "oneOnOne", "wrap");
  },
};

export async function POST(request) {
  const rawBody = await request.text();
  if (!verifySlackSignature(rawBody, request.headers)) {
    return new Response("invalid signature", { status: 401 });
  }

  const form = new URLSearchParams(rawBody);
  const payload = JSON.parse(form.get("payload") || "{}");

  // Opening (or pushing) a modal is the one path with a hard deadline: Slack
  // expires the trigger_id 3s after the click, and a cold start plus a
  // Supabase round trip can miss it. So both kinds of modal-launch get a fast
  // path that reaches Slack without touching the database at all — see
  // deferredModal.
  const actionId = payload.type === "block_actions" ? payload.actions?.[0]?.action_id : null;
  if (actionId && OPENERS[actionId]) return await deferredModal("views.open", OPENERS[actionId], payload);
  if (actionId && PUSH_ACTIONS[actionId]) return await deferredModal("views.push", PUSH_ACTIONS[actionId], payload);

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

// Publish a placeholder modal immediately (views.open for a fresh modal,
// views.push when landing on top of one already open), then fill it in once
// the data is loaded. views.update takes a view_id rather than a trigger_id,
// so the slow half has no deadline. Every exit path replaces the placeholder
// with something — including opener.build returning null/undefined, which
// falls back to the "no longer available" notice below — so a click can't
// leave "Loading…" on screen forever.
async function deferredModal(method, opener, payload) {
  const opened = await slackApi(method, {
    trigger_id: payload.trigger_id,
    view: loadingModal(opener.title),
  }).catch((e) => {
    console.error(`loading modal ${method}:`, e);
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
      const view = await opener.build(admin, ctx, payload.actions?.[0]?.value);
      await swap(view || noticeModal(opener.title, "That's no longer available. Close and try again from the list."));
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
    } else if (action.action_id === "devplan_suggested_pick") {
      // Same section+accessory reasoning as suggested_pick/goal_suggested_pick
      // above. Value is "ruleIndex::pickIndex" (see devSuggestionOptionGroups,
      // lib/slack-views.js) — looked back up against LD_RULES rather than
      // carried in the option itself, since a rule's why/support/measure
      // don't fit in a select value.
      const [ruleIdx, pickIdx] = (action.selected_option?.value || "").split("::").map(Number);
      const rule = LD_RULES[ruleIdx];
      const pick = rule?.picks[pickIdx];
      if (rule && pick && payload.view?.id) {
        const target = fieldValV2(payload.view?.state?.values, "target");
        await slackApi("views.update", {
          view_id: payload.view.id,
          view: addDevPlanModal(ctx, { area: rule.area, why: rule.why, type: pick[0], activity: pick[1], support: rule.support, measure: rule.measure, target }),
        }).catch((e) => console.error("devplan suggestion prefill view update:", e));
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
      // A handler's guard (permission check, a stale pinned pair id, a
      // verifyOwnedRow lookup that found nothing) returns { skip: true } to
      // mean "nothing was saved" -- distinct from a real save returning
      // undefined. Without this, every guard's silent no-op would still
      // trigger the Home-tab refresh below as if something had changed.
      // Found in review 2026-09-13.
      if (!result?.skip) {
        // The save already happened above; closing the modal shouldn't wait
        // on the Home-tab republish -- ctx's own in-place mutations (e.g.
        // edit_employee_label's ctx.partnerName) land before this runs, so
        // the refresh still shows the new value.
        after(() => refreshHome(admin, ctx));
      }
    }
    return Response.json({}); // close the modal
  }

  return Response.json({ ok: true });
}
