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
import { GOAL_SUGGESTIONS, SMART_GOAL_HELP, EMPLOYEE_GOAL_PROMPT } from "@/lib/goals-content";
import { fieldBlockId } from "@/lib/slack-form-fields";

const APP_URL = "https://performance-pulse-lyart.vercel.app";
const GOAL_STATES = ["Not Started", "In Progress", "At Risk", "Complete", "Deferred"];
const DEV_TYPES = ["Course", "Training", "Coaching", "Mentoring", "Job shadowing", "Stretch assignment", "New project", "Conference", "Certification", "Reading / resource", "Peer learning", "Leadership exposure", "Cross-functional experience"];
const ACH_CATS = ["Business results", "Customer impact", "Collaboration", "Leadership", "Problem solving", "Innovation", "Operational improvement", "Team contribution", "Other"];
const MGR_FB_TYPES = ["Recognition", "Coaching", "Performance feedback", "Expectations", "Development feedback"];
const EMP_FB_TYPES = ["What's working", "What could improve", "Support I need", "What would help me succeed"];

// Slack hard-caps option text at 75 characters — cut at the last whole
// word instead of slicing mid-word, since several goal/topic suggestions
// are full sentences longer than that.
function truncateOptionText(label) {
  const text = String(label);
  if (text.length <= 75) return text;
  return text.slice(0, 74).replace(/\s+\S*$/, "") + "…";
}

const opt = (label, value) => ({ text: { type: "plain_text", text: truncateOptionText(label) }, value: String(value ?? label).slice(0, 150) });
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
    ...(ctx.pairs.length > 1
      ? [
          actions([
            {
              type: "static_select",
              action_id: "switch_pair",
              placeholder: { type: "plain_text", text: "Switch pairing" },
              options: ctx.pairs.map((p) => opt(p.partnerName, p.id)),
              initial_option: opt(ctx.partnerName, ctx.pairId),
            },
          ]),
        ]
      : []),
    section(`Your 1:1 partner: *${ctx.partnerName}* · you're the ${ctx.role}.`, button("Edit your name", "open_edit_name")),
    context(`Next 1:1: ${next1on1}  ·  ${openTopics.length} open topic${openTopics.length === 1 ? "" : "s"}  ·  ${openActions.length} open action${openActions.length === 1 ? "" : "s"}`),
    { type: "divider" },
    section("*My 1:1*\nPrepare, talk, and wrap up — right here."),
    actions([
      button("Add a topic", "open_add_topic", "", "primary"),
      button(`Topics (${openTopics.length})`, "open_list_topics"),
      button("Add an action", "open_add_action"),
      button(`Actions (${openActions.length})`, "open_list_actions"),
      button("Wrap up a 1:1", "open_wrap_up"),
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

// The "suggested" picker is a convenience only — picking one round-trips
// through a block_actions event (see the "suggested_pick" branch in
// app/api/slack/interactivity/route.js) that fills in "text"/"category"
// below via views.update. "text" is the one true required field, so Slack
// itself blocks submission when it's empty instead of a custom
// after-the-fact server error for "neither field filled in".
//
// This picker MUST live in a section block, not an input block: elements
// inside an "input" block never auto-dispatch block_actions on selection
// (only plain_text_input can, via dispatch_action_config, which doesn't
// apply to selects) — Slack silently drops the interaction, no error, no
// request, nothing. Confirmed live: an input-block version of this picker
// never sent a single request to the interactivity endpoint on selection,
// with build/lint/deploy all green — this only breaks when actually
// clicked in Slack. A section+accessory select dispatches immediately, at
// the cost of not appearing in view.state.values on submit — fine here
// since its value only ever flows into "text" via the prefill, never read
// directly at submission.
// This modal's field base names — drives the shared views.update-refresh
// workaround (see lib/slack-form-fields.js) instead of a bespoke copy of it.
export const TOPIC_FIELDS = ["text", "why", "category"];

export function addTopicModal(ctx, draft, saved = false) {
  const groups = suggestionOptionGroups(ctx.role);
  // Whenever this modal is rebuilt with a non-empty draft via views.update
  // on an ALREADY-OPEN view (a suggestion pick, or the "Save draft"
  // confirmation re-render) — as opposed to a brand-new views.open — every
  // pre-filled field uses a "_v2" block_id instead of its normal one. See
  // lib/slack-form-fields.js for why. The read side (both
  // SUBMISSIONS.add_topic and the open_add_topic/save_draft_topic openers
  // in app/api/slack/interactivity/route.js) checks both id variants.
  const v2 = Boolean(draft);
  const id = (f) => fieldBlockId(f, v2);
  return modal(
    "add_topic",
    "Add a topic",
    [
      ...draftControls("save_draft_topic", saved),
      section(
        "*Pick a suggestion (optional)*",
        { type: "static_select", action_id: "suggested_pick", option_groups: groups, placeholder: { type: "plain_text", text: "Browse suggested topics" } }
      ),
      inputBlock(
        id("text"),
        "What do you want to discuss",
        plainInput("val", { placeholder: "What do you want to talk about?", initial: draft?.text })
      ),
      inputBlock(id("why"), "Why it matters", plainInput("val", { multiline: true, initial: draft?.why }), true),
      // A picked suggestion's category is a SUGGESTIONS group name (e.g.
      // "Where things stand"), not necessarily one of TOPIC_CATEGORIES —
      // same mismatch as editTopicModal below. Without merging it in here,
      // views.update rejects the whole modal with invalid_arguments the
      // instant a suggestion is picked (confirmed live, not just in theory).
      inputBlock(
        id("category"),
        "Category",
        staticSelect(
          "val",
          draft?.category && !TOPIC_CATEGORIES.includes(draft.category) ? [...TOPIC_CATEGORIES, draft.category] : TOPIC_CATEGORIES,
          draft?.category || TOPIC_CATEGORIES[0]
        ),
        true
      ),
    ],
    "Save"
  );
}

// Shows the real topic text (changed at Melissa's request, 2026-08-28): the
// redaction here used to be counts/categories only, same rule as goals/
// achievements/feedback below, on the theory that Slack is a wider trust
// boundary (workspace admins can export message/view history) than the
// app's own database, which RLS limits to just the two people in the pair.
// Decided this doesn't apply the same way to topics: unlike feedback or
// achievements, a topic is just an agenda line either person already wrote
// with the expectation their partner will read it aloud in the 1:1 — and
// without seeing it, neither person could tell which topic a "Mark
// discussed"/"Edit" button on this list actually refers to. Editing is
// still creator-only (viewerRole gate below); marking discussed stays open
// to both, unchanged.
export function listTopicsModal(topics, viewerRole) {
  const open = topics.filter(isOpenTopic);
  const blocks = open.length
    ? open.flatMap((t) => [
        section(`*${t.text}*\n${t.category} · added ${ago(t.created_at)}${t.submitted_at ? "" : " · _not yet submitted_"}`),
        actions([
          button("Mark discussed", "topic_mark_discussed", t.id, "primary"),
          // Submit is the explicit "let them know" action (SLACK_TODO.md item
          // 0) — creator-gated, same as Edit right next to it, since it's
          // finalizing your own entry, not something either pair member can
          // do to the other's topic.
          ...(t.created_by_role === viewerRole ? [...(t.submitted_at ? [] : [button("Submit", "topic_submit", t.id)]), button("Edit", "topic_edit", t.id)] : []),
          // Delete, unlike Edit/Submit, is open to both partners — matches
          // the website (TopicList.js has no creator gate on Remove).
          button("Delete", "topic_delete", t.id, "danger"),
        ]),
      ])
    : [section("No open topics. Add one from the Home tab.")];
  blocks.push({ type: "divider" }, actions([openInApp("Open topics in the app for full notes")]));
  return modal("view_topics", "Open topics", blocks, "Close");
}

// Pre-filled with the topic's current text/category/why — pushed on top of
// listTopicsModal (views.push) rather than opened fresh, so Cancel returns
// to the list instead of the Home tab. private_metadata carries the topic
// id since view_submission payloads don't otherwise include it.
export function editTopicModal(topic) {
  // A topic added from a suggestion (see suggestionOptionGroups) carries a
  // SUGGESTIONS category, a different list than TOPIC_CATEGORIES — the
  // website's plain <select> just fails to preselect an unmatched value,
  // but Slack's static_select hard-rejects an initial_option not present
  // in options. Add the topic's real category if it's not already one of
  // the standard ones, so opening Edit can't crash on a topic like that.
  const categoryOptions = TOPIC_CATEGORIES.includes(topic.category) ? TOPIC_CATEGORIES : [...TOPIC_CATEGORIES, topic.category];
  return modal(
    "edit_topic",
    "Edit topic",
    [
      inputBlock("text", "I want to discuss…", plainInput("val", { initial: topic.text })),
      inputBlock("why", "Why it matters", plainInput("val", { multiline: true, initial: topic.why }), true),
      inputBlock("category", "Category", staticSelect("val", categoryOptions, topic.category)),
    ],
    "Save changes",
    topic.id
  );
}

// -------------------------------------------------------------- actions ----

export function addActionModal(ctx) {
  return modal("add_action", "Add an action", [
    inputBlock("text", "Action", plainInput("val", { placeholder: "What needs to happen?" })),
    inputBlock("owner", "Owner", staticSelect("val", [ctx.myName, ctx.partnerName, "Both of us"], ctx.myName)),
    inputBlock("due", "Due date", { type: "datepicker", action_id: "val" }, true),
  ]);
}

// Pushed on top of listActionsModal (views.push), same pattern as
// editTopicModal/editGoalModal — open to both partners, matching Delete.
export function editActionModal(ctx, action) {
  return modal(
    "edit_action",
    "Edit action",
    [
      inputBlock("text", "Action", plainInput("val", { initial: action.text })),
      inputBlock("owner", "Owner", staticSelect("val", [ctx.myName, ctx.partnerName, "Both of us"], action.owner_label)),
      inputBlock("due", "Due date", datePicker("val", action.due_date), true),
    ],
    "Save changes",
    action.id
  );
}

export function listActionsModal(list) {
  const open = list.filter((a) => a.status !== "Done");
  const blocks = open.length
    ? open.flatMap((a, i) => [
        section(`*Action ${i + 1}* — ${a.owner_label}${a.due_date ? ` · due ${a.due_date}` : " · no due date"}`),
        actions([button("Mark done", "action_mark_done", a.id, "primary"), button("Edit", "action_edit", a.id), button("Delete", "action_delete", a.id, "danger")]),
      ])
    : [section("No open actions. Add one from the Home tab.")];
  blocks.push({ type: "divider" }, actions([openInApp("Open actions in the app for full notes")]));
  return modal("view_actions", "Open actions", blocks, "Close");
}

// ---------------------------------------------------------------- goals ----

export const GOAL_FIELDS = ["text", "why", "measure", "target", "status"];

// Same relationship to GOAL_SUGGESTIONS as suggestionOptionGroups above has
// to SUGGESTIONS — goals have no per-role library, just one shared list.
function goalSuggestionOptionGroups() {
  return Object.entries(GOAL_SUGGESTIONS).map(([cat, items]) => ({
    label: { type: "plain_text", text: cat.slice(0, 75) },
    options: items.map((s) => opt(s.label, s.text)),
  }));
}

const SMART_GOAL_CONTEXT = [SMART_GOAL_HELP.intro, ...SMART_GOAL_HELP.criteria.map(([k, v]) => `*${k}:* ${v}`)].join("\n");

export function addGoalModal(ctx, draft, saved = false) {
  // See lib/slack-form-fields.js: rebuilding this modal with a non-empty
  // draft only ever happens while patching an already-open view, so every
  // field renders under a "_v2" block_id then instead of its normal one.
  const v2 = Boolean(draft);
  const id = (f) => fieldBlockId(f, v2);
  return modal(
    "add_goal",
    "Add a goal",
    [
      ...draftControls("save_draft_goal", saved),
      context(SMART_GOAL_CONTEXT),
      // Verbatim match to the website's Add Goal modal (Melissa's
      // instruction) — shown only to the employee, same as there.
      ...(ctx?.role === "employee" ? [context(EMPLOYEE_GOAL_PROMPT)] : []),
      section(
        "*Pick a suggestion (optional)*",
        { type: "static_select", action_id: "goal_suggested_pick", option_groups: goalSuggestionOptionGroups(), placeholder: { type: "plain_text", text: "Browse suggested goals" } }
      ),
      inputBlock(id("text"), "Goal", plainInput("val", { initial: draft?.text })),
      inputBlock(id("why"), "Why it matters", plainInput("val", { multiline: true, initial: draft?.why }), true),
      inputBlock(id("measure"), "How you'll know it's met", plainInput("val", { initial: draft?.measure }), true),
      inputBlock(id("target"), "Target date", datePicker("val", draft?.target), true),
      inputBlock(id("status"), "Status", staticSelect("val", GOAL_STATES, draft?.status || GOAL_STATES[0])),
    ],
    "Save"
  );
}

// Shows real text (matches Topics, per Melissa's decision, SLACK_TODO.md item
// 0b) — Edit/Delete both open to both partners, since Goals no longer has a
// meaningful "creator" concept now owner is always the employee.
export function listGoalsModal(goals) {
  const blocks = goals.length
    ? goals.flatMap((g) => [
        section(`*${g.text}*\n${g.status} · ${g.progress || 0}%${g.target_date ? ` · target ${g.target_date}` : ""}`),
        actions([button("Edit", "goal_edit", g.id), button("Delete", "goal_delete", g.id, "danger")]),
      ])
    : [section("No goals yet. Add one from the Home tab.")];
  blocks.push({ type: "divider" }, actions([openInApp("Open goals in the app for the full text")]));
  return modal("view_goals", "Goals", blocks, "Close");
}

// Pushed on top of listGoalsModal (views.push), same pattern as
// editTopicModal — private_metadata carries the goal id.
export function editGoalModal(goal) {
  return modal(
    "edit_goal",
    "Edit goal",
    [
      inputBlock("text", "Goal", plainInput("val", { initial: goal.text })),
      inputBlock("why", "Why it matters", plainInput("val", { multiline: true, initial: goal.why }), true),
      inputBlock("measure", "How you'll know it's met", plainInput("val", { initial: goal.measure }), true),
      inputBlock("target", "Target date", datePicker("val", goal.target_date), true),
      inputBlock("status", "Status", staticSelect("val", GOAL_STATES, goal.status)),
    ],
    "Save changes",
    goal.id
  );
}

// --------------------------------------------------------- development -----

export const DEVPLAN_FIELDS = ["area", "type", "activity", "target"];

export function addDevPlanModal(draft, saved = false) {
  // See lib/slack-form-fields.js: rebuilding this modal with a non-empty
  // draft only ever happens while patching an already-open view, so every
  // field renders under a "_v2" block_id then instead of its normal one.
  const v2 = Boolean(draft);
  const id = (f) => fieldBlockId(f, v2);
  return modal(
    "add_devplan",
    "Add a development plan",
    [
      ...draftControls("save_draft_devplan", saved),
      inputBlock(id("area"), "Area", plainInput("val", { placeholder: "e.g. Executive presentation skills", initial: draft?.area })),
      inputBlock(id("type"), "Type", staticSelect("val", DEV_TYPES, draft?.type || DEV_TYPES[0])),
      inputBlock(id("activity"), "Activity", plainInput("val", { multiline: true, initial: draft?.activity }), true),
      inputBlock(id("target"), "Target date", datePicker("val", draft?.target), true),
    ],
    "Save"
  );
}

// No content-parity decision for Dev plans (unlike Goals/Actions, see
// SLACK_TODO.md item 0b) — stays redacted to structural fields only (type,
// status, target date), same reasoning as the pre-existing Actions
// redaction. Delete only, no Edit (item 0d's scope is Goals + Actions).
export function listDevPlansModal(plans) {
  const blocks = plans.length
    ? plans.flatMap((p, i) => [
        section(`*Plan ${i + 1}* — ${p.type}${p.status ? ` · ${p.status}` : ""}${p.target_date ? ` · target ${p.target_date}` : ""}`),
        actions([button("Delete", "devplan_delete", p.id, "danger")]),
      ])
    : [section("No development plans yet. Add one from the Home tab.")];
  blocks.push({ type: "divider" }, actions([openInApp("Open plans in the app for the full text")]));
  return modal("view_devplans", "Development plans", blocks, "Close");
}

// ---------------------------------------------------------- achievements ---

export const ACHIEVEMENT_FIELDS = ["title", "category", "impact", "date"];

export function addAchievementModal(draft, saved = false) {
  // See lib/slack-form-fields.js: rebuilding this modal with a non-empty
  // draft only ever happens while patching an already-open view, so every
  // field renders under a "_v2" block_id then instead of its normal one.
  const v2 = Boolean(draft);
  const id = (f) => fieldBlockId(f, v2);
  return modal(
    "add_achievement",
    "Log an achievement",
    [
      ...draftControls("save_draft_achievement", saved),
      inputBlock(id("title"), "What happened", plainInput("val", { initial: draft?.title })),
      inputBlock(id("category"), "Category", staticSelect("val", ACH_CATS, draft?.category || ACH_CATS[0])),
      inputBlock(id("impact"), "Impact", plainInput("val", { multiline: true, initial: draft?.impact }), true),
      inputBlock(id("date"), "Date", datePicker("val", draft?.date), true),
    ],
    "Save"
  );
}

// Same redaction reasoning as Dev plans above — structural fields only.
// Delete only, no Edit (item 0d's scope is Goals + Actions).
export function listAchievementsModal(list) {
  const blocks = list.length
    ? list.flatMap((a, i) => [
        section(`*Achievement ${i + 1}* — ${a.category}${a.achievement_date ? ` · ${a.achievement_date}` : ""}`),
        actions([button("Delete", "achievement_delete", a.id, "danger")]),
      ])
    : [section("Nothing logged yet. Add one from the Home tab.")];
  blocks.push({ type: "divider" }, actions([openInApp("Open achievements in the app for the full text")]));
  return modal("view_achievements", "Achievements", blocks, "Close");
}

// ------------------------------------------------------------- feedback ----

export const FEEDBACK_FIELDS = ["type", "text", "example"];

// requestId, when present, means this modal is answering a specific open
// feedback request (see the "Answer" flow in route.js) rather than a
// standalone "Give feedback" — carried in private_metadata the same way
// editTopicModal carries a topic id, so SUBMISSIONS.add_feedback can both
// save the entry and close that exact request in one step. Answering a
// request is deliberately not a standalone draft (matching the website's
// own rule in app/(dashboard)/performance/page.js — "'answer' mode is tied
// to a specific feedback request and isn't a standalone draft"), so no
// "Save draft" controls show in that case, and callers never pass a draft
// alongside a requestId.
export function addFeedbackModal(ctx, draft, saved = false, requestId) {
  const types = ctx.isMgr ? MGR_FB_TYPES : EMP_FB_TYPES;
  // See lib/slack-form-fields.js: rebuilding this modal with a non-empty
  // draft only ever happens while patching an already-open view, so every
  // field renders under a "_v2" block_id then instead of its normal one.
  const v2 = Boolean(draft);
  const id = (f) => fieldBlockId(f, v2);
  return modal(
    "add_feedback",
    `Feedback for ${ctx.partnerName}`,
    [
      ...(requestId ? [context(`Answering ${ctx.partnerName}'s feedback request.`)] : draftControls("save_draft_feedback", saved)),
      inputBlock(id("type"), "Type", staticSelect("val", types, draft?.type || types[0])),
      inputBlock(id("text"), "Feedback", plainInput("val", { multiline: true, initial: draft?.text })),
      inputBlock(id("example"), "A specific example", plainInput("val", { multiline: true, initial: draft?.example }), true),
    ],
    "Save",
    requestId
  );
}

export function addFeedbackRequestModal() {
  return modal("add_feedback_request", "Ask for feedback", [
    inputBlock("about", "What about", plainInput("val", { placeholder: "e.g. How I handled the Northwind escalation" }), true),
    inputBlock("why", "Why now", plainInput("val", { multiline: true }), true),
  ]);
}

// viewerRole gates the "Answer" button the same way the website does
// (app/(dashboard)/performance/page.js's `forMe = r.from_role !== role`,
// shown only when forMe): a feedback request is answered by the *other*
// pair member, never by whoever asked for it, so a request the viewer
// themselves created never renders "Answer" here. "Close without
// answering" stays available regardless of who's viewing — it's the
// website's Dismiss/Withdraw action, which either side can do.
export function listFeedbackModal(feedback, requests, viewerRole) {
  const byType = {};
  feedback.forEach((f) => (byType[f.type] = (byType[f.type] || 0) + 1));
  const summary = Object.entries(byType)
    .map(([t, n]) => `${n} ${t}`)
    .join(" · ");
  const fbBlocks = feedback.length
    ? [section(`*${feedback.length} feedback entr${feedback.length === 1 ? "y" : "ies"}*\n${summary}`)]
    : [section("No feedback yet.")];
  // The website (app/(dashboard)/performance/page.js) offers two genuinely
  // different actions on an open request: "Answer" (writes a real feedback
  // entry and closes the request, atomically — see SUBMISSIONS.add_feedback
  // in route.js) and "Dismiss"/"Withdraw" (closes with no content, for
  // whoever decides the request doesn't need a written answer). Both are
  // real, distinct product behavior, not one being a stand-in for the
  // other, so both get a button here rather than collapsing back to the
  // single "Mark answered" no-content action this used to be.
  const reqBlocks = requests.filter((r) => r.status === "open");
  const blocks = [
    ...fbBlocks,
    ...(reqBlocks.length ? [{ type: "divider" }, section("*Open requests*")] : []),
    ...reqBlocks.flatMap((r) => [
      section(`Requested ${ago(r.created_at)}`),
      actions([
        ...(r.from_role === viewerRole ? [] : [button("Answer", "feedback_request_answer", r.id, "primary")]),
        button("Close without answering", "feedback_request_answered", r.id),
      ]),
    ]),
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
