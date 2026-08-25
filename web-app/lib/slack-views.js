// Block Kit builders for the in-Slack experience: the Home tab and every
// modal it opens. Mirrors the fields/options used on the website
// (app/(dashboard)/*) so filling something out in Slack produces the same
// kind of row filling it out on the site would. Presentation only — no
// Supabase calls here, see app/api/slack/interactivity/route.js.
//
// Privacy: same rule as lib/block-kit.js — nothing written in a topic, goal,
// achievement, feedback entry, or meeting summary ever gets echoed back into
// a Slack view. "List" modals below show counts/categories/dates only, with
// a link back to the app for the actual text. Slack workspace admins can
// export view/message history, so the real content never transits Slack.

import { isOpenTopic, ago } from "@/lib/format";
import { TOPIC_CATEGORIES, SUGGESTIONS } from "@/lib/one-on-one-content";

const APP_URL = "https://performance-pulse-lyart.vercel.app";
const GOAL_STATES = ["Not Started", "In Progress", "At Risk", "Complete", "Deferred"];
const DEV_TYPES = ["Course", "Training", "Coaching", "Mentoring", "Job shadowing", "Stretch assignment", "New project", "Conference", "Certification", "Reading / resource", "Peer learning", "Leadership exposure", "Cross-functional experience"];
const ACH_CATS = ["Business results", "Customer impact", "Collaboration", "Leadership", "Problem solving", "Innovation", "Operational improvement", "Team contribution", "Other"];
const MGR_FB_TYPES = ["Recognition", "Coaching", "Performance feedback", "Expectations", "Development feedback"];
const EMP_FB_TYPES = ["What's working", "What could improve", "Support I need", "What would help me succeed"];

const opt = (label, value) => ({ text: { type: "plain_text", text: String(label).slice(0, 75) }, value: String(value ?? label).slice(0, 150) });
const staticSelect = (actionId, options, initial) => ({
  type: "static_select",
  action_id: actionId,
  options: options.map((o) => opt(o, o)),
  ...(initial ? { initial_option: opt(initial, initial) } : {}),
});
const plainInput = (actionId, opts = {}) => ({
  type: "plain_text_input",
  action_id: actionId,
  ...(opts.multiline ? { multiline: true } : {}),
  ...(opts.placeholder ? { placeholder: { type: "plain_text", text: opts.placeholder } } : {}),
  ...(opts.initial ? { initial_value: opts.initial } : {}),
});
const inputBlock = (blockId, label, element, optional = false) => ({
  type: "input",
  block_id: blockId,
  label: { type: "plain_text", text: label },
  element,
  optional,
});
const section = (md, accessory) => ({ type: "section", text: { type: "mrkdwn", text: md }, ...(accessory ? { accessory } : {}) });
const context = (md) => ({ type: "context", elements: [{ type: "mrkdwn", text: md }] });
const actions = (elements) => ({ type: "actions", elements });
const button = (text, actionId, value, style) => ({
  type: "button",
  text: { type: "plain_text", text, emoji: true },
  action_id: actionId,
  ...(value !== undefined && value !== "" ? { value: String(value) } : {}),
  ...(style ? { style } : {}),
});
const openInApp = (label = "Open in app") => ({ type: "button", text: { type: "plain_text", text: label, emoji: true }, url: APP_URL, action_id: "open_app" });
const datePicker = (actionId, initial) => ({ type: "datepicker", action_id: actionId, ...(initial ? { initial_date: initial } : {}) });
const modal = (callbackId, title, blocks, submit = "Save", privateMetadata) => ({
  type: "modal",
  callback_id: callbackId,
  title: { type: "plain_text", text: title.slice(0, 24) },
  submit: { type: "plain_text", text: submit },
  close: { type: "plain_text", text: "Cancel" },
  blocks,
  ...(privateMetadata ? { private_metadata: privateMetadata } : {}),
});

// ------------------------------------------------- placeholder modals -----

// A one-line modal with nothing to submit. Can't use modal() above: that
// always emits a `submit` button, and a modal with no input block must not
// declare one.
const plainModal = (callbackId, title, body, close) => ({
  type: "modal",
  callback_id: callbackId,
  title: { type: "plain_text", text: title.slice(0, 24) },
  close: { type: "plain_text", text: close },
  blocks: [section(body)],
});

// Slack expires a trigger_id 3 seconds after the click, and a cold start plus
// a Supabase round trip can miss that — the person then sees a raw "operation
// timed out" error. So openers publish this placeholder immediately (no data
// needed to build it), then swap in the real view with views.update, which
// takes a view_id instead of a trigger_id and so has no deadline.
export const loadingModal = (title) => plainModal("loading", title, "_Loading…_", "Cancel");

// Shown in place of the placeholder when the real view can't be built, so a
// failure never leaves someone staring at "Loading…" forever.
export const noticeModal = (title, message) => plainModal("notice", title, message, "Close");

// ---------------------------------------------------------------- home -----

export function homeView(ctx, d) {
  const openTopics = d.topics.filter(isOpenTopic);
  const openActions = d.actions.filter((a) => a.status !== "Done");
  const openRequests = d.feedbackRequests.filter((r) => r.status === "open");
  const next1on1 = ctx.pair.next_1on1_date ? `${ctx.pair.next_1on1_date}${ctx.pair.next_1on1_time ? " " + ctx.pair.next_1on1_time : ""}` : "not scheduled";

  const blocks = [
    { type: "header", text: { type: "plain_text", text: "Performance Pulse", emoji: true } },
    section(`Your 1:1 partner: *${ctx.partnerName}* · you're the ${ctx.role}.`, button("Edit your name", "open_edit_name")),
    context(`Next 1:1: ${next1on1}  ·  ${openTopics.length} open topic${openTopics.length === 1 ? "" : "s"}  ·  ${openActions.length} open action${openActions.length === 1 ? "" : "s"}`),
    { type: "divider" },
    section("*My 1:1*\nPrepare, talk, and wrap up — right here."),
    actions([
      button("Add a topic", "open_add_topic"),
      button(`Topics (${openTopics.length})`, "open_list_topics"),
      button("Add an action", "open_add_action"),
      button(`Actions (${openActions.length})`, "open_list_actions"),
      button("Wrap up a 1:1", "open_wrap_up", "", "primary"),
    ]),
    { type: "divider" },
    section(`*Goals* — ${d.goals.length} on record`),
    actions([button("View goals", "open_list_goals"), button("Add a goal", "open_add_goal")]),
    section(`*Development* — ${d.devPlans.length} plan${d.devPlans.length === 1 ? "" : "s"}`),
    actions([button("View plans", "open_list_devplans"), button("Add a plan", "open_add_devplan")]),
    section(`*Achievements* — ${d.achievements.length} logged`),
    actions([button("View achievements", "open_list_achievements"), button("Log one", "open_add_achievement")]),
    section(`*Feedback* — ${d.feedback.length} entries${openRequests.length ? `, ${openRequests.length} request${openRequests.length === 1 ? "" : "s"} waiting` : ""}`),
    actions([
      button("View feedback", "open_list_feedback"),
      button("Give feedback", "open_add_feedback"),
      button("Ask for feedback", "open_add_feedback_request"),
    ]),
    { type: "divider" },
    context(":lock: Everything here is shared only between you and your 1:1 partner — never with HR."),
  ];
  return { type: "home", blocks };
}

export function editNameModal(ctx) {
  return modal("edit_name", "Your display name", [
    inputBlock("name", "Your name", plainInput("val", { initial: ctx.myName, placeholder: "e.g. Melissa Weiss" })),
  ]);
}

export function notLinkedHomeView() {
  return {
    type: "home",
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Performance Pulse" } },
      section(
        "This Slack account isn't linked to a Performance Pulse pair yet. Sign in on the website with the same email address this Slack account uses, and this tab will pick it up automatically."
      ),
    ],
  };
}

// Shown when one email is on more than one pair (see resolveSlackUser). No
// pair is named: we deliberately haven't picked one, and naming them would
// tell each pair something about the other.
export function multiplePairsHomeView() {
  return {
    type: "home",
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Performance Pulse" } },
      section(
        "This email address is on more than one Performance Pulse pair, and the app doesn't handle that yet. Rather than guess which pair to show you here, we're showing nothing — you'd have no way to tell whose numbers you were looking at."
      ),
    ],
  };
}

export const MULTIPLE_PAIRS_NOTICE =
  "This email address is on more than one Performance Pulse pair, and the app doesn't handle that yet. We'd rather not guess which pair you meant.";

// -------------------------------------------------------------- topics -----

// Suggestion values carry their category so the interactivity route doesn't
// need a second lookup: "<category>::<suggestion text>". Combined length
// tops out around 113 chars across the whole fixed library, well inside
// Slack's 150-char option-value cap.
// Slack strips plain_text_input values from the view_closed event, so a
// modal can't autosave on Cancel/X the way the website does — confirmed
// live, not fixable here. Instead each add-modal gets an explicit "Save
// draft" button; button clicks (unlike view_closed) carry the full current
// field state, so that works. Draft prefill on open (see draftFor() in
// app/api/slack/interactivity/route.js) is what shows it again later.
function draftControls(actionId, saved) {
  return [...(saved ? [context("✅ *Draft saved* — safe to close, it'll be here when you reopen this.")] : []), actions([button("Save draft", actionId)])];
}

function suggestionOptionGroups(role) {
  const roleSuggestions = SUGGESTIONS[role] || {};
  return Object.entries(roleSuggestions).map(([cat, texts]) => ({
    label: { type: "plain_text", text: cat.slice(0, 75) },
    options: texts.map((t) => opt(t, `${cat}::${t}`)),
  }));
}

export function addTopicModal(ctx, draft, saved = false) {
  const groups = suggestionOptionGroups(ctx.role);
  return modal(
    "add_topic",
    "Add a topic",
    [
      ...draftControls("save_draft_topic", saved),
      inputBlock(
        "suggested",
        "Pick a suggestion (optional)",
        { type: "static_select", action_id: "val", option_groups: groups, placeholder: { type: "plain_text", text: "Browse suggested topics" } },
        true
      ),
      inputBlock("text", "Or write your own", plainInput("val", { placeholder: "What do you want to talk about?", initial: draft?.text }), true),
      inputBlock("why", "Why it matters", plainInput("val", { multiline: true, initial: draft?.why }), true),
      inputBlock("category", "Category (for your own topic)", staticSelect("val", TOPIC_CATEGORIES, draft?.category || TOPIC_CATEGORIES[0]), true),
    ],
    "Save"
  );
}

export function listTopicsModal(topics) {
  const open = topics.filter(isOpenTopic);
  const blocks = open.length
    ? open.flatMap((t, i) => [
        section(`*Topic ${i + 1}* — ${t.category} · added ${ago(t.created_at)}`, button("Mark discussed", "topic_mark_discussed", t.id, "primary")),
      ])
    : [section("No open topics. Add one from the Home tab.")];
  blocks.push({ type: "divider" }, actions([openInApp("Open topics in the app for full notes")]));
  return modal("view_topics", "Open topics", blocks, "Close");
}

// -------------------------------------------------------------- actions ----

export function addActionModal(ctx) {
  return modal("add_action", "Add an action", [
    inputBlock("text", "Action", plainInput("val", { placeholder: "What needs to happen?" })),
    inputBlock("owner", "Owner", staticSelect("val", [ctx.myName, ctx.partnerName, "Both of us"], ctx.myName)),
    inputBlock("due", "Due date", { type: "datepicker", action_id: "val" }, true),
  ]);
}

export function listActionsModal(list) {
  const open = list.filter((a) => a.status !== "Done");
  const blocks = open.length
    ? open.flatMap((a, i) => [
        section(`*Action ${i + 1}* — ${a.owner_label}${a.due_date ? ` · due ${a.due_date}` : " · no due date"}`, button("Mark done", "action_mark_done", a.id, "primary")),
      ])
    : [section("No open actions. Add one from the Home tab.")];
  blocks.push({ type: "divider" }, actions([openInApp("Open actions in the app for full notes")]));
  return modal("view_actions", "Open actions", blocks, "Close");
}

// ---------------------------------------------------------------- goals ----

export function addGoalModal(draft, saved = false) {
  return modal(
    "add_goal",
    "Add a goal",
    [
      ...draftControls("save_draft_goal", saved),
      inputBlock("text", "Goal", plainInput("val", { initial: draft?.text })),
      inputBlock("why", "Why it matters", plainInput("val", { multiline: true, initial: draft?.why }), true),
      inputBlock("measure", "How you'll know it's met", plainInput("val", { initial: draft?.measure }), true),
      inputBlock("target", "Target date", datePicker("val", draft?.target), true),
      inputBlock("status", "Status", staticSelect("val", GOAL_STATES, draft?.status || GOAL_STATES[0])),
    ],
    "Save"
  );
}

export function listGoalsModal(goals) {
  const byStatus = {};
  goals.forEach((g) => (byStatus[g.status] = (byStatus[g.status] || 0) + 1));
  const summary = Object.entries(byStatus)
    .map(([s, n]) => `${n} ${s}`)
    .join(" · ");
  const blocks = goals.length
    ? [section(`*${goals.length} goal${goals.length === 1 ? "" : "s"} on record*\n${summary}`)]
    : [section("No goals yet. Add one from the Home tab.")];
  blocks.push({ type: "divider" }, actions([openInApp("Open goals in the app for the full text")]));
  return modal("view_goals", "Goals", blocks, "Close");
}

// --------------------------------------------------------- development -----

export function addDevPlanModal(draft, saved = false) {
  return modal(
    "add_devplan",
    "Add a development plan",
    [
      ...draftControls("save_draft_devplan", saved),
      inputBlock("area", "Area", plainInput("val", { placeholder: "e.g. Executive presentation skills", initial: draft?.area })),
      inputBlock("type", "Type", staticSelect("val", DEV_TYPES, draft?.type || DEV_TYPES[0])),
      inputBlock("activity", "Activity", plainInput("val", { multiline: true, initial: draft?.activity }), true),
      inputBlock("target", "Target date", datePicker("val", draft?.target), true),
    ],
    "Save"
  );
}

export function listDevPlansModal(plans) {
  const byStatus = {};
  plans.forEach((p) => (byStatus[p.status] = (byStatus[p.status] || 0) + 1));
  const summary = Object.entries(byStatus)
    .map(([s, n]) => `${n} ${s}`)
    .join(" · ");
  const blocks = plans.length
    ? [section(`*${plans.length} development plan${plans.length === 1 ? "" : "s"}*\n${summary}`)]
    : [section("No development plans yet. Add one from the Home tab.")];
  blocks.push({ type: "divider" }, actions([openInApp("Open plans in the app for the full text")]));
  return modal("view_devplans", "Development plans", blocks, "Close");
}

// ---------------------------------------------------------- achievements ---

export function addAchievementModal(draft, saved = false) {
  return modal(
    "add_achievement",
    "Log an achievement",
    [
      ...draftControls("save_draft_achievement", saved),
      inputBlock("title", "What happened", plainInput("val", { initial: draft?.title })),
      inputBlock("category", "Category", staticSelect("val", ACH_CATS, draft?.category || ACH_CATS[0])),
      inputBlock("impact", "Impact", plainInput("val", { multiline: true, initial: draft?.impact }), true),
      inputBlock("date", "Date", datePicker("val", draft?.date), true),
    ],
    "Save"
  );
}

export function listAchievementsModal(list) {
  const byCat = {};
  list.forEach((a) => (byCat[a.category] = (byCat[a.category] || 0) + 1));
  const summary = Object.entries(byCat)
    .map(([c, n]) => `${n} ${c}`)
    .join(" · ");
  const blocks = list.length
    ? [section(`*${list.length} achievement${list.length === 1 ? "" : "s"} logged*\n${summary}`)]
    : [section("Nothing logged yet. Add one from the Home tab.")];
  blocks.push({ type: "divider" }, actions([openInApp("Open achievements in the app for the full text")]));
  return modal("view_achievements", "Achievements", blocks, "Close");
}

// ------------------------------------------------------------- feedback ----

export function addFeedbackModal(ctx, draft, saved = false) {
  const types = ctx.isMgr ? MGR_FB_TYPES : EMP_FB_TYPES;
  return modal(
    "add_feedback",
    `Feedback for ${ctx.partnerName}`,
    [
      ...draftControls("save_draft_feedback", saved),
      inputBlock("type", "Type", staticSelect("val", types, draft?.type || types[0])),
      inputBlock("text", "Feedback", plainInput("val", { multiline: true, initial: draft?.text })),
      inputBlock("example", "A specific example", plainInput("val", { multiline: true, initial: draft?.example }), true),
    ],
    "Save"
  );
}

export function addFeedbackRequestModal() {
  return modal("add_feedback_request", "Ask for feedback", [
    inputBlock("about", "What about", plainInput("val", { placeholder: "e.g. How I handled the Northwind escalation" }), true),
    inputBlock("why", "Why now", plainInput("val", { multiline: true }), true),
  ]);
}

export function listFeedbackModal(feedback, requests) {
  const byType = {};
  feedback.forEach((f) => (byType[f.type] = (byType[f.type] || 0) + 1));
  const summary = Object.entries(byType)
    .map(([t, n]) => `${n} ${t}`)
    .join(" · ");
  const fbBlocks = feedback.length
    ? [section(`*${feedback.length} feedback entr${feedback.length === 1 ? "y" : "ies"}*\n${summary}`)]
    : [section("No feedback yet.")];
  const reqBlocks = requests.filter((r) => r.status === "open");
  const blocks = [
    ...fbBlocks,
    ...(reqBlocks.length ? [{ type: "divider" }, section("*Open requests*")] : []),
    ...reqBlocks.map((r) => section(`Requested ${ago(r.created_at)}`, button("Mark answered", "feedback_request_answered", r.id, "primary"))),
    { type: "divider" },
    actions([openInApp("Open feedback in the app for the full text")]),
  ];
  return modal("view_feedback", "Feedback", blocks, "Close");
}

export function lastMeetingModal(meetings) {
  const last = meetings[0];
  const blocks = last
    ? [section(`*1:1 on ${last.meeting_date}*\nRead what you discussed and agreed on in the app.`), { type: "divider" }, actions([openInApp("Open the summary")])]
    : [section("No 1:1s wrapped up yet.")];
  return modal("view_last_meeting", "Last 1:1 summary", blocks, "Close");
}

// ------------------------------------------------------------- wrap up -----

export function wrapUpModal(topics) {
  const open = topics.filter(isOpenTopic);
  const checkboxOptions = open.map((t) => opt(t.text, t.id));
  return modal("wrap_up", "Wrap up your 1:1", [
    inputBlock("date", "Meeting date", { type: "datepicker", action_id: "val", initial_date: new Date().toISOString().slice(0, 10) }),
    inputBlock("discussed", "What you discussed", plainInput("val", { multiline: true }), true),
    inputBlock("agreed", "What you agreed", plainInput("val", { multiline: true }), true),
    ...(checkboxOptions.length
      ? [inputBlock("discussed_topics", "Topics covered", { type: "checkboxes", action_id: "val", options: checkboxOptions }, true)]
      : []),
  ]);
}
