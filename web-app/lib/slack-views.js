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
import { TOPIC_CATEGORIES, SUGGESTIONS, MSG_KINDS } from "@/lib/one-on-one-content";
import { GOAL_SUGGESTIONS, SMART_GOAL_HELP, EMPLOYEE_GOAL_PROMPT } from "@/lib/goals-content";
import { LD_RULES } from "@/lib/development-content";
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
const actions = (elements, blockId) => ({ type: "actions", elements, ...(blockId ? { block_id: blockId } : {}) });
// Green means "you've actually used this," never "click me" (Melissa's
// call, 2026-09-12) -- a create button starts default/white and only turns
// primary/green once the count backing it is real, derived from data
// homeView already loads, not a new tracked flag.
const usedStyle = (count) => (count > 0 ? "primary" : undefined);
const button = (text, actionId, value, style) => ({
  type: "button",
  text: { type: "plain_text", text, emoji: true },
  action_id: actionId,
  ...(value !== undefined && value !== "" ? { value: String(value) } : {}),
  ...(style ? { style } : {}),
});
// action_id must be unique across an entire published view, not just within
// one block -- Slack rejects the whole views.publish/views.open call
// otherwise. homeView calls this more than once, so the id is derived from
// the label rather than hardcoded (see SEP 09 incident: a hardcoded
// "open_app" id on every button silently broke every Slack Home tab publish).
const openInApp = (label = "Open in app", path = "") => ({
  type: "button",
  text: { type: "plain_text", text: label, emoji: true },
  url: `${APP_URL}${path}`,
  action_id: `open_app_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`,
});
const datePicker = (actionId, initial) => ({ type: "datepicker", action_id: actionId, ...(initial ? { initial_date: initial } : {}) });
const modal = (callbackId, title, blocks, submit = "Save", privateMetadata) => ({
  type: "modal",
  callback_id: callbackId,
  title: { type: "plain_text", text: title.slice(0, 24) },
  // Slack hard-caps submit button text at 24 chars too (same as title) and
  // rejects the whole views.update if it's longer -- silently, from this
  // repo's own perspective, since the caller only sees a caught/logged
  // error while the modal stays stuck on "Loading..." forever. Found live:
  // wrapUpConversationModal's original 27-char label did exactly this.
  submit: { type: "plain_text", text: submit.slice(0, 24) },
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
  // Same closed-state pair used on the website for goals/dev plans
  // (app/(dashboard)/performance/page.js, lib/badges.js DEV_STATES).
  const isOpenGoalOrPlan = (g) => g.status !== "Complete" && g.status !== "Deferred";
  const openGoals = d.goals.filter(isOpenGoalOrPlan);
  const openDevPlans = d.devPlans.filter(isOpenGoalOrPlan);
  const next1on1 = ctx.pair.next_1on1_date ? `${ctx.pair.next_1on1_date}${ctx.pair.next_1on1_time ? " " + ctx.pair.next_1on1_time : ""}` : "not scheduled";

  const blocks = [
    { type: "header", text: { type: "plain_text", text: "Performance Pulse", emoji: true } },
    // Slack is the primary way people use this (that's why it was built),
    // but everything saved here already lives in the same database the
    // website reads -- this is just a fast way to get to the website too,
    // for the option to look at either one (Melissa, 2026-09-13). Still
    // requires the normal Google sign-in there -- a one-time auto-sign-in
    // link was tried and rejected as a security downgrade (anyone who saw
    // the link could get in without it).
    actions([openInApp("Open Performance Pulse (Google sign-in)", "/dashboard")]),
    ...(ctx.pairs.length > 1
      ? [
          actions(
            [
              {
                type: "static_select",
                action_id: "switch_pair",
                placeholder: { type: "plain_text", text: "Switch pairing" },
                options: ctx.pairs.map((p) => opt(p.partnerName, p.id)),
                initial_option: opt(ctx.partnerName, ctx.pairId),
              },
            ],
            // Slack's static_select can report a stale selected_option after
            // a views.publish that reuses the same block_id (same platform
            // quirk as addTopicModal's category/text "_v2" fields above) —
            // keying the block_id to the current pair forces Slack to treat
            // it as a fresh element on every switch instead of a cached one.
            `pair_switch_${ctx.pairId}`
          ),
        ]
      : []),
    // No self-name-edit at all, either role -- names are set once at signup
    // (OnboardingForm.js) and carry through everywhere, including here, so a
    // separate "edit your own name" entry point was pure confusion (Melissa's
    // call). Managers keep "Edit their name" -- a distinct feature, a
    // manager-only per-pairing label (pairs.employee_label, migration 0015)
    // that never touches the employee's real account name.
    // Wording spells out the relationship directly (Melissa's explicit
    // rewrite) instead of the old dry "Your 1:1 partner: X · you're the
    // role" line, which tested as unclear.
    ...(ctx.isMgr
      ? [
          context(`*${ctx.myName}* (manager)`),
          section(`*${ctx.partnerName}* is your employee — they'll be your 1:1 partner.`, button("Edit their name", "open_edit_employee_label")),
        ]
      : [context(`*${ctx.partnerName}* is your manager — they'll be your 1:1 partner.`)]),
    // No usedStyle() here on purpose: "Add a new employee" always creates a
    // brand-new pairing, so there's no open/closed count of THIS pair's own
    // history that could mean "already used" for it the way there is for
    // "Add a topic"/"Add an action" -- ctx.pairs.length - 1 (a count of
    // OTHER pairs) is unrelated to this button and lit it green permanently
    // for any manager with 2+ reports, which is exactly the decorative
    // highlight the 2026-09-12 rule forbids (see CLAUDE.md/memory).
    ...(ctx.isMgr ? [actions([button("Add a new employee", "open_add_employee")])] : []),
    context(`Next 1:1: ${next1on1}  ·  ${openTopics.length} open topic${openTopics.length === 1 ? "" : "s"}  ·  ${openActions.length} open action${openActions.length === 1 ? "" : "s"}`),
    { type: "divider" },
    section("*My 1:1*\nPrepare, talk, and wrap up — right here."),
    actions([
      button("Add a topic", "open_add_topic", "", usedStyle(openTopics.length)),
      button(`Topics (${openTopics.length})`, "open_list_topics"),
      button("Add an action", "open_add_action", "", usedStyle(openActions.length)),
      button(`Actions (${openActions.length})`, "open_list_actions"),
      button("Wrap up a 1:1", "open_wrap_up"),
      button("Prepare a hard conversation", "open_add_hardconvo"),
    ]),
    // Manager-only private scratchpad -- Melissa's explicit call, since the
    // old per-role "My suggestions" (both sides had their own private list)
    // read as if it were a suggestion TO the other person, which it never
    // was. Hidden from the employee's Home tab entirely, not just relabeled
    // -- re-checked server-side too (see open_list_suggestions/
    // open_add_suggestion in route.js), same defense-in-depth as every
    // other role-gated feature here.
    ...(ctx.isMgr
      ? [
          section(`*Private notes* — only you see this, never ${ctx.partnerName}.`),
          actions([button("View notes", "open_list_suggestions"), button("Write a note", "open_add_suggestion", "", usedStyle(d.customSuggestions.length))]),
        ]
      : []),
    { type: "divider" },
    section(`*Goals* — ${d.goals.length} on record`),
    actions([button("Add a goal", "open_add_goal", "", usedStyle(openGoals.length)), button("View goals", "open_list_goals")]),
    section(`*Learning & development* — ${d.devPlans.length} plan${d.devPlans.length === 1 ? "" : "s"}`),
    actions([button("Add a plan", "open_add_devplan", "", usedStyle(openDevPlans.length)), button("View plans", "open_list_devplans")]),
    section(`*Achievements* — ${d.achievements.length} logged`),
    actions([button("Log one", "open_add_achievement", "", usedStyle(d.achievements.length)), button("View achievements", "open_list_achievements")]),
    section(`*Feedback* — ${d.feedback.length} entries${openRequests.length ? `, ${openRequests.length} request${openRequests.length === 1 ? "" : "s"} waiting` : ""}`),
    context(
      ctx.isMgr
        ? "*Give feedback:* write feedback for them, they'll see it. *Ask for feedback:* ask them to evaluate you. *View feedback in the app:* read the full history."
        : "*Ask for feedback:* ask your manager to evaluate you. *View feedback in the app:* read the full history, including anything they've given you."
    ),
    actions([
      ...(ctx.isMgr ? [button("Give feedback", "open_add_feedback", "", usedStyle(d.feedback.length))] : []),
      button(
        "Ask for feedback",
        "open_add_feedback_request",
        "",
        ctx.isMgr ? undefined : usedStyle(openRequests.filter((r) => r.from_role === ctx.role).length)
      ),
      button("View feedback in the app", "open_list_feedback"),
    ]),
    // Two-way, both roles, no notify() -- matches the website's "Between you
    // two" card exactly (sendMessage in app/(dashboard)/dashboard/page.js
    // has no notify() call either): deliberately quiet, seen next time
    // either side opens the app/tab, not pushed. Message text itself is
    // never echoed here (see the file header comment) -- View messages
    // shows kind/sender/when only, with a link to read the real text.
    section(`*Between you two* — ${d.messages.length} sent`),
    context("No meeting needed — send it when it's on your mind. Quiet by design: no Slack ping, just seen next time they open the app."),
    actions([button("Send a message", "open_add_message", "", usedStyle(d.messages.length)), button("View messages", "open_list_messages")]),
    // Both buttons just open the app -- no in-Slack list or upload flow at
    // all (Melissa's call). Uploading needs a real file, which only works on
    // the website; viewing pointed there too rather than maintaining two
    // copies of the same list.
    section(`*Documents* — ${d.documents.length}`),
    actions([openInApp("Upload a document", "/dashboard"), openInApp("View documents", "/dashboard")]),
    section("*Handbook*"),
    actions([button("View handbook", "open_list_handbook")]),
    section("*History*\nEverything past — meetings, goals, feedback, all of it — lives in the app."),
    actions([openInApp("Open History in the app", "/history")]),
    { type: "divider" },
    section("Clear out open topics, goals, and actions so this doesn't sit stuck — the pairing stays, and either of you can keep adding to it any time:"),
    actions([button("Clear out old topics & actions", "open_close_pair")]),
    { type: "divider" },
    context(":lock: Everything here is shared only between you and your 1:1 partner — never with HR."),
  ];
  return { type: "home", blocks };
}

// Manager-only (see the governance re-check on open_edit_employee_label in
// route.js): sets pairs.employee_label (migration 0015), the same
// manager-only per-pairing display name the website's "Name to show you"
// field writes -- never the employee's own profiles.full_name, so it can't
// leak into any other pairing that employee is in and the employee's own
// account name is untouched.
export function editEmployeeLabelModal(ctx) {
  const realName = ctx.pair.employee?.full_name || ctx.pair.employee_email;
  return modal("edit_employee_label", "Employee's name", [
    section(`Their account name is *${realName}*. This only changes what you call them here — it doesn't rename their account, and only you see it.`),
    inputBlock("label", "Name to show you", plainInput("val", { initial: ctx.pair.employee_label || "", placeholder: realName })),
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
      ...draftControls("save_draft_topic", saved),
    ],
    "Save"
  );
}

// Mirrors the website's "Help me prepare a hard conversation" tool
// (components/one-on-one/SuggestionsCard.js's openHardConvo/saveHardConvo) —
// same four prompts, same body format, same Slack-silent behavior (see
// SUBMISSIONS.add_hardconvo in app/api/slack/interactivity/route.js).
export function addHardConvoModal() {
  return modal("add_hardconvo", "Hard conversation", [
    inputBlock("outcome", "Outcome I want", plainInput("val", { multiline: true })),
    inputBlock("facts", "The facts", plainInput("val", { multiline: true }), true),
    inputBlock("theirView", "How they might see it", plainInput("val", { multiline: true }), true),
    inputBlock("ask", "What I'm asking for", plainInput("val", { multiline: true }), true),
  ]);
}

// Manager-only private scratchpad (Melissa's explicit call, see homeView) --
// a personal list only the manager ever sees, filed under the manager's
// fixed SUGGESTIONS categories plus "Other". "Add to agenda" mirrors
// addFromSuggestion (page.js): creates a plain unsubmitted topic, same as
// adding one by hand — no ping until Submit. `role` param stays (rather
// than assuming "manager") so the underlying list/filter logic doesn't need
// to change if this ever needs to support both roles again.
function mySuggestionCategories(role) {
  return Object.keys(SUGGESTIONS[role] || {}).concat("Other");
}

export function listMySuggestionsModal(list, role) {
  const mine = list.filter((s) => s.role === role);
  const blocks = mine.length
    ? mine.flatMap((s) => [
        section(`*${s.text}*\n${s.category}`),
        actions([button("Add to agenda", "suggestion_add", s.id), button("Remove", "suggestion_delete", s.id, "danger")]),
      ])
    : [section("Nothing saved yet. Use \"Write a note\" on the Home tab.")];
  return modal("view_suggestions", "Private notes", blocks, "Close");
}

export function addSuggestionModal(role) {
  const cats = mySuggestionCategories(role);
  return modal("add_suggestion", "Write a private note", [
    inputBlock("text", "The question or topic", plainInput("val", { multiline: true, placeholder: "Something you want to remember to raise." })),
    inputBlock("category", "File it under", staticSelect("val", cats, cats[0])),
  ]);
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
        section(
          `*${t.text}*\n${t.category} · added ${ago(t.created_at)}${t.submitted_at ? "" : " · _not yet submitted_"}${t.why ? `\n_${t.why}_` : ""}`
        ),
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
  // No "open in the app for full notes" link here anymore -- text + why are
  // both already shown above (real text has been shown since 2026-08-28,
  // "why" was the one thing still missing). Unlike Actions/Dev
  // plans/Achievements below, which stay deliberately redacted, there's
  // nothing left in the app that isn't already in this modal.
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
    inputBlock("notes", "Notes", plainInput("val", { multiline: true, placeholder: "Anything that would help whoever picks this up." }), true),
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
      inputBlock("notes", "Notes", plainInput("val", { multiline: true, initial: action.notes }), true),
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

// Same picker pattern, matched against lib/development-content.js's fixed,
// hand-written LD_RULES (see that file — "not a language model"). Each rule
// becomes one option group (its area), each of its picks one option, encoded
// as "ruleIndex::pickIndex" so devplan_suggested_pick (route.js) can look the
// whole rule back up without re-matching anything.
function devSuggestionOptionGroups() {
  return LD_RULES.map((r, ri) => ({
    label: { type: "plain_text", text: r.area.slice(0, 75) },
    options: r.picks.map((p, pi) => opt(`${p[0]}: ${p[1]}`, `${ri}::${pi}`)),
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
      context(SMART_GOAL_CONTEXT),
      // Verbatim match to the website's Add Goal modal (Melissa's
      // instruction) — shown only to the employee, same as there.
      ...(ctx?.role === "employee" ? [context(EMPLOYEE_GOAL_PROMPT)] : []),
      section(
        "*Pick a suggestion (optional)*",
        { type: "static_select", action_id: "goal_suggested_pick", option_groups: goalSuggestionOptionGroups(), placeholder: { type: "plain_text", text: "Browse suggested goals" } }
      ),
      inputBlock(id("text"), "Goal", plainInput("val", { initial: draft?.text })),
      inputBlock(id("why"), "What's the plan to accomplish this?", plainInput("val", { multiline: true, initial: draft?.why }), true),
      inputBlock(id("measure"), "How you'll know it's met", plainInput("val", { initial: draft?.measure }), true),
      inputBlock(id("target"), "Target date", datePicker("val", draft?.target), true),
      inputBlock(id("status"), "Status", staticSelect("val", GOAL_STATES, draft?.status || GOAL_STATES[0])),
      ...draftControls("save_draft_goal", saved),
    ],
    "Save"
  );
}

// Shows real text (matches Topics, per Melissa's decision, SLACK_TODO.md item
// 0b) — Edit stays open to both partners, but per Melissa's 2026-09-13
// decision, Delete is manager-only: an employee can tweak a goal with their
// manager but should never be able to unilaterally remove one the manager set.
export function listGoalsModal(goals, isMgr) {
  const blocks = goals.length
    ? goals.flatMap((g) => [
        section(
          `*${g.text}*\n${g.status} · ${g.progress || 0}%${g.target_date ? ` · target ${g.target_date}` : ""}${g.why ? `\n_${g.why}_` : ""}${g.measure ? `\n*How you'll know it's met:* ${g.measure}` : ""}`
        ),
        actions([button("Edit", "goal_edit", g.id), ...(isMgr ? [button("Delete", "goal_delete", g.id, "danger")] : [])]),
      ])
    : [section("No goals yet. Add one from the Home tab.")];
  // Same reasoning as listTopicsModal above -- real text, why, and measure
  // are all shown here now, so there's nothing left the app has that this
  // modal doesn't.
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
      inputBlock("why", "What's the plan to accomplish this?", plainInput("val", { multiline: true, initial: goal.why }), true),
      inputBlock("measure", "How you'll know it's met", plainInput("val", { initial: goal.measure }), true),
      inputBlock("target", "Target date", datePicker("val", goal.target_date), true),
      inputBlock("status", "Status", staticSelect("val", GOAL_STATES, goal.status)),
    ],
    "Save changes",
    goal.id
  );
}

// --------------------------------------------------------- development -----

export const DEVPLAN_FIELDS = ["area", "why", "type", "activity", "support", "measure", "target"];

export function addDevPlanModal(ctx, draft, saved = false) {
  // See lib/slack-form-fields.js: rebuilding this modal with a non-empty
  // draft only ever happens while patching an already-open view, so every
  // field renders under a "_v2" block_id then instead of its normal one.
  const v2 = Boolean(draft);
  const id = (f) => fieldBlockId(f, v2);
  const managerName = ctx.isMgr ? ctx.myName : ctx.partnerName;
  return modal(
    "add_devplan",
    "Add a plan",
    [
      section(
        "*Pick a suggestion (optional)*",
        { type: "static_select", action_id: "devplan_suggested_pick", option_groups: devSuggestionOptionGroups(), placeholder: { type: "plain_text", text: "Get a suggestion" } }
      ),
      inputBlock(id("area"), "Area", plainInput("val", { placeholder: "e.g. Executive presentation skills", initial: draft?.area })),
      inputBlock(id("why"), "Why it matters", plainInput("val", { multiline: true, placeholder: "e.g. Increase effectiveness presenting to senior stakeholders", initial: draft?.why }), true),
      inputBlock(id("type"), "Type", staticSelect("val", DEV_TYPES, draft?.type || DEV_TYPES[0])),
      inputBlock(id("activity"), "Activity", plainInput("val", { multiline: true, placeholder: "e.g. Present the monthly business update", initial: draft?.activity }), true),
      inputBlock(id("support"), `What ${managerName} will do to support this`, plainInput("val", { multiline: true, placeholder: "e.g. Review the first two decks and give feedback", initial: draft?.support }), true),
      inputBlock(id("target"), "Target date", datePicker("val", draft?.target), true),
      inputBlock(id("measure"), "How we'll know it worked", plainInput("val", { multiline: true, placeholder: "e.g. Confidently leads the quarterly leadership presentation", initial: draft?.measure }), true),
      ...draftControls("save_draft_devplan", saved),
    ],
    "Save"
  );
}

// No content-parity decision for Dev plans (unlike Goals/Actions, see
// SLACK_TODO.md item 0b) — stays redacted to structural fields only (type,
// status, target date), same reasoning as the pre-existing Actions
// redaction. Delete only, no Edit (item 0d's scope is Goals + Actions).
// Delete is manager-only, same reasoning and same date as listGoalsModal above.
export function listDevPlansModal(plans, isMgr) {
  const blocks = plans.length
    ? plans.flatMap((p, i) => [
        section(`*Plan ${i + 1}* — ${p.type}${p.status ? ` · ${p.status}` : ""}${p.target_date ? ` · target ${p.target_date}` : ""}`),
        ...(isMgr ? [actions([button("Delete", "devplan_delete", p.id, "danger")])] : []),
      ])
    : [section("No development plans yet. Add one from the Home tab.")];
  blocks.push({ type: "divider" }, actions([openInApp("Open plans in the app for the full text")]));
  return modal("view_devplans", "Learning plans", blocks, "Close");
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
      inputBlock(id("title"), "What happened", plainInput("val", { initial: draft?.title })),
      inputBlock(id("category"), "Category", staticSelect("val", ACH_CATS, draft?.category || ACH_CATS[0])),
      inputBlock(id("impact"), "Impact", plainInput("val", { multiline: true, initial: draft?.impact }), true),
      inputBlock(id("date"), "Date", datePicker("val", draft?.date), true),
      ...draftControls("save_draft_achievement", saved),
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
      ...(requestId ? [context(`Answering ${ctx.partnerName}'s feedback request.`)] : []),
      inputBlock(id("type"), "Type", staticSelect("val", types, draft?.type || types[0])),
      inputBlock(id("text"), "Feedback", plainInput("val", { multiline: true, initial: draft?.text })),
      inputBlock(id("example"), "A specific example", plainInput("val", { multiline: true, initial: draft?.example }), true),
      ...(requestId ? [] : draftControls("save_draft_feedback", saved)),
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
    // Feedback text is deliberately never echoed into Slack (see the file
    // header comment) -- so "respond" here means a real, working link
    // straight to the Feedback tab, not a build-in-Slack reply box.
    // Wording is role-specific: an employee is the one who actually
    // responds; a manager is just reading their own full history.
    actions([openInApp(viewerRole === "employee" ? "Respond in the app" : "View full feedback in the app", "/performance")]),
  ];
  return modal("view_feedback", "Feedback", blocks, "Close");
}

// ------------------------------------------------------ between you two ---

// Mirrors the website's "Between you two" card (app/(dashboard)/dashboard/
// page.js) -- both roles, no draft/prefill machinery since it's one field
// plus a kind picker, not a multi-field form like topics/goals.
export function addMessageModal() {
  return modal(
    "add_message",
    "Send a message",
    [
      section("No meeting needed — sent the moment you submit. Quiet by design: no Slack ping, they'll see it next time they open the app."),
      inputBlock("kind", "Kind", staticSelect("val", MSG_KINDS, MSG_KINDS[0])),
      inputBlock("text", "What's on your mind?", plainInput("val", { multiline: true })),
    ],
    "Send"
  );
}

// Message text is deliberately never echoed into Slack, same rule as
// feedback above (see the file header comment) -- this shows who sent what
// kind and when, with a real link to read the actual text in the app.
export function listMessagesModal(messages) {
  const byKind = {};
  messages.forEach((m) => (byKind[m.kind] = (byKind[m.kind] || 0) + 1));
  const summary = Object.entries(byKind)
    .map(([k, n]) => `${n} ${k}`)
    .join(" · ");
  const recent = messages.slice().reverse().slice(0, 6);
  const blocks = messages.length
    ? [
        section(`*${messages.length} message${messages.length === 1 ? "" : "s"}*\n${summary}`),
        { type: "divider" },
        ...recent.map((m) => context(`*${m.kind}* · ${m.created_by_name} · ${ago(m.created_at)}`)),
      ]
    : [section("No messages yet.")];
  return modal("list_messages", "Between you two", [...blocks, actions([openInApp("Read in the app", "/dashboard")])], "Close");
}

// -------------------------------------------------------------- handbook ---

// View-only, per the item 0g decision — no add/edit from Slack (uploading is
// now HR-passcode-gated on the website, see app/api/handbook/route.js — not
// a role any Slack account has, so there's nothing to link to here).
// `l.url` may be null if getHandbookFileUrl (route.js) failed to sign it --
// guard the button rather than emit an invalid `url` field, which Slack
// rejects and silently sticks the whole modal on "Loading…" (the exact bug
// that used to hit Documents' own in-Slack list, before it was replaced by
// a plain link to the app -- see the comment above the Documents section in
// homeView).
export function listHandbookLinksModal(links) {
  const blocks = links.length
    ? links.flatMap((l) => [
        section(`*${l.title}*`),
        l.url
          ? actions([{ type: "button", text: { type: "plain_text", text: "Open handbook", emoji: true }, url: l.url, action_id: "open_handbook_link" }])
          : context("Couldn't generate a link for this file — try again from the app."),
      ])
    : [section("No handbook uploaded yet.")];
  return modal("view_handbook_links", "Handbook", blocks, "Close");
}

// Career was removed from Slack entirely (Melissa's call, 2026-09-04) --
// too confusing mid-redesign to leave half-built. The website's nav link
// was pulled too (AppShell.js), but the underlying /career page, its data
// functions (lib/data.js's listCareerAnswers/saveCareerAnswers), and the
// career_answers table are all untouched -- easy to bring back if needed.

export function lastMeetingModal(meetings) {
  const last = meetings[0];
  const blocks = last
    ? [section(`*1:1 on ${last.meeting_date}*\nRead what you discussed and agreed on in the app.`), { type: "divider" }, actions([openInApp("Open the summary")])]
    : [section("No 1:1s wrapped up yet.")];
  return modal("view_last_meeting", "Last 1:1 summary", blocks, "Close");
}

// ------------------------------------------------------------- wrap up -----

// pairId is pinned into private_metadata so the submission handler can use
// the pair this modal was actually opened for, not whatever pair happens to
// be active if the Slack user switches pairs before submitting -- see the
// governance note in CLAUDE.md (private_metadata is exactly as
// replayable/tamperable as any other Slack-supplied id, but it's still the
// only way to carry "which pair" across the open->submit gap for a
// multi-pair user).
export function wrapUpModal(topics, pairId) {
  const open = topics.filter(isOpenTopic);
  const checkboxOptions = open.map((t) => opt(t.text, t.id));
  return modal("wrap_up", "Wrap up your 1:1", [
    inputBlock("date", "Meeting date", { type: "datepicker", action_id: "val", initial_date: new Date().toISOString().slice(0, 10) }),
    inputBlock("discussed", "What you discussed", plainInput("val", { multiline: true, placeholder: "The headline of what you talked about." }), true),
    inputBlock("agreed", "What you agreed", plainInput("val", { multiline: true, placeholder: "Decisions, expectations, anything you both signed up for." }), true),
    inputBlock("revisit", "Topics to revisit next time", plainInput("val", { multiline: true, placeholder: "Anything you ran out of time for." }), true),
    ...(checkboxOptions.length
      ? [inputBlock("discussed_topics", "Topics covered", { type: "checkboxes", action_id: "val", options: checkboxOptions }, true)]
      : []),
    context("*Start · Stop · Continue* — the only rating here. No numbers, no scores."),
    inputBlock("start", "Start", plainInput("val", { placeholder: "One thing to start doing" }), true),
    inputBlock("stop", "Stop", plainInput("val", { placeholder: "One thing to stop doing" }), true),
    inputBlock("keep", "Continue", plainInput("val", { placeholder: "One thing that works — keep doing it" }), true),
    inputBlock("next", "Next conversation", datePicker("val"), true),
    inputBlock("checkin90", "We will check in with you in 90 days — on", datePicker("val"), true),
  ], "Save", pairId);
}

// -------------------------------------------------- close this pairing -----

// Despite the name, this does NOT end the pairing or the conversation --
// see wrapUpConversation in lib/data.js. It only clears out the *backlog*
// (marks open topics/goals/actions Discussed/Complete/Done) so the Home tab
// isn't cluttered with old items; either side can add new topics/actions
// immediately after, same as always. A stale version of this comment used
// to say it ended the whole pairing -- that hasn't been true since this was
// refactored to a soft clear, but the comment (and the UI copy/styling)
// never caught up, which is exactly what read as "this ends things" to a
// real user (flagged 2026-09-16). The actual hard-close action is
// closePair() in lib/data.js, used only by the website/HR admin route --
// never called from Slack.
// -------------------------------------------------- add a new employee -----

// Manager-only, mirrors the website's "Add another pairing" (/onboarding/add)
// but scoped to manager-adds-employee, the one real request this exists for
// (SLACK_TODO.md) -- see createPairForSlack (lib/data.js) for why this can't
// just reuse the website's create_pair RPC.
export function addEmployeeModal() {
  return modal(
    "add_employee",
    "Add a new employee",
    [
      section(
        "Starts a new 1:1 pairing with you as their manager. Type their work email, or their exact name if HR already has them on the roster — it links right away if they already use Performance Pulse, or the moment they sign up otherwise."
      ),
      inputBlock("email", "Their work email or roster name", plainInput("val", { placeholder: "name@company.com, or their full name" }), true),
    ],
    "Add employee"
  );
}

export function wrapUpConversationModal(pairId) {
  return modal(
    "wrap_up_conversation",
    "Clear out old topics",
    [
      section(
        "This closes out any open topics, goals, and actions — marking them Discussed / Complete / Done — so your Home tab starts fresh. Nothing is deleted, your pairing keeps going exactly as before, and either of you can add a new topic or action right away — this doesn't end the conversation."
      ),
      // inputBlock's 4th arg is Slack's own `optional` flag -- this was
      // hardcoded false (required) since the very first version of this
      // modal despite the label and placeholder both saying "Optional,"
      // silently blocking every submission with "Please complete this
      // required field" unless something was typed. Found live 2026-09-16
      // testing the wrap-up flow end to end, not caught by any prior review
      // because nothing before tonight actually submitted this modal.
      inputBlock("note", "Anything worth noting as this closes", plainInput("val", { multiline: true, placeholder: "Optional — goes in the note to your partner." }), true),
    ],
    "Clear it out",
    pairId
  );
}
