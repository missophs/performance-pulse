// Block Kit builders for the in-Slack experience: the Home tab and every
// modal it opens. Mirrors the fields/options used on the website
// (app/(dashboard)/*) so filling something out in Slack produces the same
// kind of row filling it out on the site would. Presentation only — no
// Supabase calls here, see app/api/slack/interactivity/route.js.
//
// Privacy (revised, Melissa's call, 2026-09-17): Slack is the product now,
// not a gateway to the website, so list modals below show real feedback,
// concern, and 1:1-summary text -- not just counts/categories/dates. This is
// safe specifically because a modal (views.open/views.push) is never saved
// by Slack anywhere -- it's not a message, it has no history, and it is not
// covered by Slack's Discovery/export tooling the way a real posted message
// is (verified against Slack's own Discovery API docs, 2026-09-17). That
// distinction is the whole rule: keep real content OUT of anything that's an
// actual posted Slack message (see lib/block-kit.js -- DM pings stay
// counts-only, on purpose, since those genuinely are exportable messages),
// and it's fine INSIDE a modal, which no one but the two people looking at
// it right now can ever see. Dev plans and achievements are the exception --
// Melissa's call: keep those structural-fields-only, no full text, no link
// anywhere -- log the actual plan/achievement content somewhere else.
//
// Built with slack-block-builder (https://blockbuilder.dev), Melissa's call
// 2026-09-18 -- every block/element below is a Block Builder instance
// (Blocks.*/Elements.*/Bits.*) instead of hand-rolled Block Kit JSON, only
// actually turned into the plain object Slack's API wants at the very end
// (modal()/plainModal()/homeTab() below, the only places that call
// .buildToObject()). This is a construction-syntax change only -- every
// Slack platform quirk documented throughout this file (the "_v2" block_id
// workaround, "select in an input block never fires," character caps, etc.)
// is still exactly as real and still handled exactly the same way; the
// library doesn't know about any of that, it just gives the object
// construction a real, chainable API instead of raw literals.

import { Surfaces, Blocks, Elements, Bits } from "slack-block-builder";
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

// Every function below returns an UNBUILT Block Builder instance (never a
// plain object) so it can be embedded as a child of another builder
// (Blocks.Input().element(...), Blocks.Section().accessory(...), etc.) --
// only the top-level surface builders (modal/plainModal/homeTab) ever call
// .buildToObject() to turn the whole tree into what Slack's API wants.
const opt = (label, value) => Bits.Option({ text: truncateOptionText(label), value: String(value ?? label).slice(0, 150) });
const optionGroup = (label, options) => Bits.OptionGroup({ label: label.slice(0, 75) }).options(options);
const staticSelect = (actionId, options, initial) =>
  Elements.StaticSelect({ actionId })
    .options(options.map((o) => opt(o, o)))
    .initialOption(initial ? opt(initial, initial) : undefined);
const plainInput = (actionId, opts = {}) =>
  Elements.TextInput({
    actionId,
    multiline: opts.multiline || undefined,
    placeholder: opts.placeholder || undefined,
    initialValue: opts.initial || undefined,
  });
const datePicker = (actionId, initial) => Elements.DatePicker({ actionId, initialDate: initial ? new Date(initial) : undefined });
const checkboxes = (actionId, options) => Elements.Checkboxes({ actionId }).options(options);
const radioButtons = (actionId, options) =>
  Elements.RadioButtons({ actionId }).options(options.map((o) => Bits.Option({ text: o.text, value: o.value })));
const userSelect = (actionId, placeholder) => Elements.UserSelect({ actionId, placeholder });
const inputBlock = (blockId, label, element, optional = false) => Blocks.Input({ blockId, label }).element(element).optional(optional);
const section = (md, accessory) => Blocks.Section({ text: md }).accessory(accessory);
const context = (md) => Blocks.Context().elements(md);
const actions = (elements, blockId) => Blocks.Actions({ blockId }).elements(elements);
const header = (text) => Blocks.Header({ text });
const divider = () => Blocks.Divider();
// Green means "you've actually used this," never "click me" (Melissa's
// call, 2026-09-12) -- a create button starts default/white and only turns
// primary/green once the count backing it is real, derived from data
// homeView already loads, not a new tracked flag.
const usedStyle = (count) => (count > 0 ? "primary" : undefined);
const button = (text, actionId, value, style) => {
  const b = Elements.Button({ text, actionId, value: value !== undefined && value !== "" ? String(value) : undefined });
  if (style === "primary") return b.primary();
  if (style === "danger") return b.danger();
  return b;
};
// action_id must be unique across an entire published view, not just within
// one block -- Slack rejects the whole views.publish/views.open call
// otherwise. homeView calls this more than once, so the id is derived from
// the label rather than hardcoded (see SEP 09 incident: a hardcoded
// "open_app" id on every button silently broke every Slack Home tab publish).
const openInApp = (label = "Open in app", path = "") =>
  Elements.Button({
    text: label,
    url: `${APP_URL}${path}`,
    actionId: `open_app_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`,
  });
const modal = (callbackId, title, blocks, submit = "Save", privateMetadata) =>
  Surfaces.Modal({
    callbackId,
    title: title.slice(0, 24),
    // Slack hard-caps submit button text at 24 chars too (same as title) and
    // rejects the whole views.update if it's longer -- silently, from this
    // repo's own perspective, since the caller only sees a caught/logged
    // error while the modal stays stuck on "Loading..." forever. Found live:
    // wrapUpConversationModal's original 27-char label did exactly this.
    submit: submit.slice(0, 24),
    close: "Cancel",
    privateMetaData: privateMetadata,
  })
    .blocks(blocks)
    .buildToObject();
const homeTab = (blocks) => Surfaces.HomeTab().blocks(blocks).buildToObject();

// ------------------------------------------------- placeholder modals -----

// A one-line modal with nothing to submit. Can't use modal() above: that
// always emits a `submit` button, and a modal with no input block must not
// declare one.
const plainModal = (callbackId, title, body, close) =>
  Surfaces.Modal({ callbackId, title: title.slice(0, 24), close })
    .blocks(section(body))
    .buildToObject();

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
    header("Performance Pulse"),
    ...(ctx.pairs.length > 1
      ? [
          actions(
            [
              Elements.StaticSelect({ actionId: "switch_pair", placeholder: "Switch pairing" })
                .options(ctx.pairs.map((p) => opt(p.partnerName, p.id)))
                .initialOption(opt(ctx.partnerName, ctx.pairId)),
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
    // call). "Edit their name" (the manager-only pairs.employee_label
    // rename) is gone too, 2026-09-17 -- Melissa's call, once "switch
    // pairing" covered picking between employees. Confirmed capability loss
    // (relabeling a wrong display name) accepted; nothing replaces it.
    // Wording spells out the relationship directly (Melissa's explicit
    // rewrite) instead of the old dry "Your 1:1 partner: X · you're the
    // role" line, which tested as unclear.
    ...(ctx.isMgr
      ? [
          context(`*${ctx.myName}* (manager)`),
          section(`*${ctx.partnerName}* is your employee — they'll be your 1:1 partner.`),
        ]
      : [context(`*${ctx.partnerName}* is your manager — they'll be your 1:1 partner.`)]),
    // Opens a real Slack conversation (bot + both people), not a modal --
    // Performance Pulse never reads what's said in it after the one-time
    // intro message (Melissa's call, 2026-09-17: private, no HR visibility;
    // an escalation is a person sharing/exporting their own Slack thread,
    // not something this app logs). See "message_partner" in
    // app/api/slack/interactivity/route.js.
    actions([button(`Message ${ctx.partnerName}`, "message_partner", "", usedStyle(ctx.pair.chat_opened_at ? 1 : 0))]),
    // No usedStyle() here on purpose: "Add a new employee" always creates a
    // brand-new pairing, so there's no open/closed count of THIS pair's own
    // history that could mean "already used" for it the way there is for
    // "Add a topic"/"Add an action" -- ctx.pairs.length - 1 (a count of
    // OTHER pairs) is unrelated to this button and lit it green permanently
    // for any manager with 2+ reports, which is exactly the decorative
    // highlight the 2026-09-12 rule forbids (see CLAUDE.md/memory).
    ...(ctx.isMgr ? [actions([button("Add or change employee", "open_add_employee")])] : []),
    context(`Next 1:1: ${next1on1}  ·  ${openTopics.length} open topic${openTopics.length === 1 ? "" : "s"}  ·  ${openActions.length} open action${openActions.length === 1 ? "" : "s"}`),
    divider(),
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
    divider(),
    section(`*Goals* — ${d.goals.length} on record`),
    actions([button("Add a goal", "open_add_goal", "", usedStyle(openGoals.length)), button("View goals", "open_list_goals")]),
    section(`*Learning & development* — ${d.devPlans.length} plan${d.devPlans.length === 1 ? "" : "s"}`),
    context("Tracked here by date and status only — keep the actual plan write-up somewhere else."),
    actions([button("Add a plan", "open_add_devplan", "", usedStyle(openDevPlans.length)), button("View plans", "open_list_devplans")]),
    section(`*Achievements* — ${d.achievements.length} logged`),
    context("Tracked here by date and category only — keep the actual write-up somewhere else."),
    actions([button("Log one", "open_add_achievement", "", usedStyle(d.achievements.length)), button("View achievements", "open_list_achievements")]),
    ...(ctx.isMgr
      ? [
          section(`*Concerns* — ${d.concerns.length} logged${d.concerns.filter((c) => !c.shared_at).length ? `, ${d.concerns.filter((c) => !c.shared_at).length} not yet shared` : ""}`),
          actions([button("Note a concern", "open_add_concern", "", usedStyle(d.concerns.length)), button("View concerns", "open_list_concerns")]),
        ]
      : d.concerns.filter((c) => c.shared_at).length
        ? [
            section(`*Concerns* — ${d.concerns.filter((c) => c.shared_at).length} shared with you`),
            actions([button("View concerns", "open_list_concerns")]),
          ]
        : []),
    section(`*Feedback* — ${d.feedback.length} entries${openRequests.length ? `, ${openRequests.length} request${openRequests.length === 1 ? "" : "s"} waiting` : ""}`),
    context(
      ctx.isMgr
        ? "*Give feedback:* write feedback for them, they'll see it. *Ask for feedback:* ask them to evaluate you. *View feedback:* read the full history."
        : "*Ask for feedback:* ask your manager to evaluate you. *View feedback:* read the full history, including anything they've given you."
    ),
    actions([
      ...(ctx.isMgr ? [button("Give feedback", "open_add_feedback", "", usedStyle(d.feedback.length))] : []),
      button(
        "Ask for feedback",
        "open_add_feedback_request",
        "",
        ctx.isMgr ? undefined : usedStyle(openRequests.filter((r) => r.from_role === ctx.role).length)
      ),
      button("View feedback", "open_list_feedback"),
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
    // Uploading still needs a real file, so that stays website-only -- but
    // viewing now has a real in-Slack list (listDocumentsModal), same as
    // Handbook already does, once the missing-signed-url guard was in place.
    section(`*Documents* — ${d.documents.length}`),
    actions([openInApp("Upload a document", "/dashboard"), button("View documents", "open_list_documents")]),
    section("*Handbook*"),
    actions([button("View handbook", "open_list_handbook")]),
    // Manager-only (Melissa's call, 2026-09-18): "the manager is the only
    // one that sees the history" -- History now also carries the AI
    // conversation summary (see historyModal), which is manager-reviewed
    // content, not something to expose to the employee side of the pair.
    ...(ctx.isMgr
      ? [section("*History*\nEvery wrapped-up 1:1, right here."), actions([button("View history", "open_history")])]
      : []),
    divider(),
    // Wording rewritten (Melissa, 2026-09-16): "Clear out" read as deleting
    // the information, which this never does -- it only marks open items
    // Discussed/Complete/Done (see wrapUpConversation, lib/data.js -- update
    // only, never delete). "Mark ... as done" says what actually happens.
    section("If a topic, goal, or action is done, mark it so — nothing is deleted, the pairing stays open, and either of you can keep adding to it any time:"),
    actions([button("Mark topics & actions as done", "open_close_pair")]),
    divider(),
    context(":lock: Everything here is shared only between you and your 1:1 partner — never with HR."),
    // Governance disclosure, visible on every Home tab load -- Melissa's
    // call, 2026-09-17, modeled on Slack's own Marketplace policy, which
    // prohibits "AI mak[ing] consequential decisions without human review"
    // and names an HR agent auto-approving/denying requests as exactly what
    // not to build (see web-app/CLAUDE.md's governance rule for the source).
    // Updated 2026-09-18 for the one real exception: the manager-only AI
    // conversation summary (see historyModal) -- always labeled, always
    // manager-reviewed/editable before it's final, never automatic.
    context(":shield: No AI writes, scores, or decides anything about your performance here — every entry is from you or your manager. The one exception: a manager can generate an AI summary of the topics, goals, actions, and past meeting notes already logged for your 1:1 — it never reads the private Message conversation. It's always labeled as such and reviewed/editable by them before it's final. A human reviews and approves how this app works before it changes."),
  ];
  return homeTab(blocks);
}

export function notLinkedHomeView() {
  return homeTab([
    header("Performance Pulse"),
    section(
      "This Slack account isn't linked to a Performance Pulse pair yet. Sign in on the website with the same email address this Slack account uses, and this tab will pick it up automatically."
    ),
  ]);
}

// Real self-serve entry point (migration 0030): shown instead of the
// generic notLinkedHomeView above when this workspace's company has
// installed the app but hasn't created a single pairing yet -- otherwise a
// brand-new customer would install, open the Home tab, and hit a dead end
// with nothing to click. Matches the app's existing "no self-serve for
// employees" rule (SLACK_TODO.md, 2026-09-05) by staying manager-initiated:
// whoever clicks this becomes the manager of the pair they create.
export function firstSetupHomeView() {
  return homeTab([
    header("Welcome to Performance Pulse"),
    section("Nobody's set up yet on this team. Add the person you'll be having 1:1s with to get started — you'll be their manager."),
    actions([button("Add your first employee", "open_setup_first_pair", "", "primary")]),
  ]);
}

export function setupFirstPairModal() {
  return modal("setup_first_pair", "Add your employee", [
    inputBlock("employee_email", "Their email address", plainInput("val", { placeholder: "name@company.com" })),
  ]);
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
  return Object.entries(roleSuggestions).map(([cat, texts]) => optionGroup(cat, texts.map((t) => opt(t, `${cat}::${t}`))));
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
        Elements.StaticSelect({ actionId: "suggested_pick", placeholder: "Browse suggested topics" }).optionGroups(groups)
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
    inputBlock("due", "Due date", datePicker("val"), true),
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

export function listActionsModal(list, notice) {
  const open = list.filter((a) => a.status !== "Done");
  const blocks = open.length
    ? open.flatMap((a) => [
        section(`*${a.text}*\n${a.owner_label}${a.due_date ? ` · due ${a.due_date}` : " · no due date"}${a.notes ? `\n_${a.notes}_` : ""}`),
        actions([button("Mark done", "action_mark_done", a.id, "primary"), button("Edit", "action_edit", a.id), button("Delete", "action_delete", a.id, "danger")]),
      ])
    : [section("No open actions. Add one from the Home tab.")];
  return modal("view_actions", "Open actions", notice ? [section(`✅ ${notice}`), divider(), ...blocks] : blocks, "Close");
}

// -------------------------------------------------------------- concerns ---

// Rebuilt 2026-09-16 (SLACK_TODO.md/CLAUDE.md's "removed entirely" note) --
// the old version was a manager-only dead end with no response path. Now a
// concern can be shared (manager's explicit choice; drafts stay private
// until then), and once shared the employee sees it and can respond. This
// modal only ever writes; listConcernsModal below shows the real text and
// a Respond action, in-Slack only (Melissa's call, 2026-09-17: see this
// file's header comment) -- no link to the app.
export function addConcernModal(ctx) {
  return modal(
    "add_concern",
    "Note a concern",
    [
      context(`Only you see this until you choose to share it with ${ctx.partnerName}.`),
      inputBlock("what", "What's the concern", plainInput("val", { multiline: true })),
      inputBlock("date", "Date it happened", datePicker("val"), true),
      inputBlock("expectation", "What you expect instead", plainInput("val", { multiline: true }), true),
      inputBlock("communicated", "How/when you've already raised this", plainInput("val", { multiline: true }), true),
      inputBlock("previously", "Has this come up before?", plainInput("val", { multiline: true }), true),
      inputBlock("support", "Support you're offering", plainInput("val", { multiline: true }), true),
    ],
    "Save"
  );
}

const concernText = (c) =>
  `${c.what}` +
  (c.expectation ? `\n*Expected instead:* ${c.expectation}` : "") +
  (c.communicated ? `\n*Already raised:* ${c.communicated}` : "") +
  (c.previously ? `\n*Come up before:* ${c.previously}` : "") +
  (c.support ? `\n*Support offered:* ${c.support}` : "");

export function listConcernsModal(concerns, isMgr) {
  if (isMgr) {
    const blocks = concerns.length
      ? concerns.flatMap((c, i) => [
          section(
            `*Concern ${i + 1}*${c.concern_date ? ` — ${c.concern_date}` : ""}\n${concernText(c)}\n${c.shared_at ? `Shared ${c.shared_at.slice(0, 10)}${c.response ? " · responded" : " · no response yet"}` : "Not yet shared"}` +
              (c.response ? `\n*Response:* ${c.response}` : "")
          ),
          actions([...(c.shared_at ? [] : [button("Share it", "concern_share", c.id, "primary")]), button("Delete", "concern_delete", c.id, "danger")]),
        ])
      : [section("No concerns logged. Add one from the Home tab.")];
    return modal("view_concerns", "Concerns", blocks, "Close");
  }
  const shared = concerns.filter((c) => c.shared_at);
  const blocks = shared.length
    ? shared.flatMap((c) => [
        section(`*Concern*${c.concern_date ? ` — ${c.concern_date}` : ""}\n${concernText(c)}` + (c.response ? `\n*Your response:* ${c.response}` : "")),
        actions([button(c.response ? "Edit your response" : "Respond", "concern_respond", c.id, c.response ? undefined : "primary")]),
      ])
    : [section("Nothing shared with you yet.")];
  return modal("view_concerns", "Concerns", blocks, "Close");
}

export function respondConcernModal(concern) {
  return modal(
    "respond_concern",
    "Respond",
    [section(concernText(concern)), inputBlock("response", "Your response", plainInput("val", { multiline: true, initial: concern.response || "" }))],
    "Send",
    concern.id
  );
}

// ---------------------------------------------------------------- goals ----

export const GOAL_FIELDS = ["text", "why", "measure", "target", "status"];

// Same relationship to GOAL_SUGGESTIONS as suggestionOptionGroups above has
// to SUGGESTIONS — goals have no per-role library, just one shared list.
function goalSuggestionOptionGroups() {
  return Object.entries(GOAL_SUGGESTIONS).map(([cat, items]) => optionGroup(cat, items.map((s) => opt(s.label, s.text))));
}

// Same picker pattern, matched against lib/development-content.js's fixed,
// hand-written LD_RULES (see that file — "not a language model"). Each rule
// becomes one option group (its area), each of its picks one option, encoded
// as "ruleIndex::pickIndex" so devplan_suggested_pick (route.js) can look the
// whole rule back up without re-matching anything.
function devSuggestionOptionGroups() {
  return LD_RULES.map((r, ri) => optionGroup(r.area, r.picks.map((p, pi) => opt(`${p[0]}: ${p[1]}`, `${ri}::${pi}`))));
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
      // Whose goal this becomes was never stated anywhere in this modal --
      // goals always belong to the employee (see the website's Goals page,
      // "they would never give their manager assigned goals") regardless of
      // who's adding it, but nothing said so before you opened it. Found
      // confusing live, 2026-09-16. Title stays generic -- Slack modal
      // titles cap at 24 chars (see wrapUpConversationModal's own note on
      // this same file for why that trap matters), so the name goes here
      // in the body instead.
      context(ctx?.isMgr ? `This becomes a goal for *${ctx.partnerName}*, not you.` : "This becomes *your* goal — your manager can help set it, but it's always yours."),
      context(SMART_GOAL_CONTEXT),
      // Verbatim match to the website's Add Goal modal (Melissa's
      // instruction) — shown only to the employee, same as there.
      ...(ctx?.role === "employee" ? [context(EMPLOYEE_GOAL_PROMPT)] : []),
      section(
        "*Pick a suggestion (optional)*",
        Elements.StaticSelect({ actionId: "goal_suggested_pick", placeholder: "Browse suggested goals" }).optionGroups(goalSuggestionOptionGroups())
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
        Elements.StaticSelect({ actionId: "devplan_suggested_pick", placeholder: "Get a suggestion" }).optionGroups(devSuggestionOptionGroups())
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

// Structural fields only, no full text -- Melissa's call, 2026-09-17: keep
// dev plans out of Slack beyond title/status/date, track the actual plan
// content elsewhere. Delete only, no Edit (item 0d's scope is Goals +
// Actions). Delete is manager-only, same reasoning and same date as
// listGoalsModal above.
export function listDevPlansModal(plans, isMgr) {
  const blocks = plans.length
    ? plans.flatMap((p, i) => [
        section(`*Plan ${i + 1}* — ${p.type}${p.status ? ` · ${p.status}` : ""}${p.target_date ? ` · target ${p.target_date}` : ""}`),
        ...(isMgr ? [actions([button("Delete", "devplan_delete", p.id, "danger")])] : []),
      ])
    : [section("No development plans yet. Add one from the Home tab.")];
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

// Same reasoning as Dev plans above — structural fields only, no full text.
// Delete only, no Edit (item 0d's scope is Goals + Actions).
export function listAchievementsModal(list) {
  const blocks = list.length
    ? list.flatMap((a, i) => [
        section(`*Achievement ${i + 1}* — ${a.category}${a.achievement_date ? ` · ${a.achievement_date}` : ""}`),
        actions([button("Delete", "achievement_delete", a.id, "danger")]),
      ])
    : [section("Nothing logged yet. Add one from the Home tab.")];
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
  const fbBlocks = feedback.length
    ? feedback.flatMap((f) => [
        section(
          `*${f.type}* — ${f.from_name} → ${f.to_name} · ${ago(f.created_at)}\n${f.text}` +
            (f.example ? `\n*For example:* ${f.example}` : "") +
            (f.response ? `\n*Response:* ${f.response}` : "")
        ),
        actions([
          ...(viewerRole === "employee" ? [button(f.response ? "Edit your response" : "Respond", "feedback_respond", f.id, f.response ? undefined : "primary")] : []),
          button("Delete", "feedback_delete", f.id, "danger"),
        ]),
      ])
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
    ...(reqBlocks.length ? [divider(), section("*Open requests*")] : []),
    ...reqBlocks.flatMap((r) => [
      section(`Requested ${ago(r.created_at)}`),
      actions([
        ...(r.from_role === viewerRole ? [] : [button("Answer", "feedback_request_answer", r.id, "primary")]),
        button("Close without answering", "feedback_request_answered", r.id),
      ]),
    ]),
  ];
  return modal("view_feedback", "Feedback", blocks, "Close");
}

export function respondFeedbackModal(feedback) {
  return modal(
    "respond_feedback",
    "Respond",
    [
      section(`*${feedback.type}*\n${feedback.text}` + (feedback.example ? `\n*For example:* ${feedback.example}` : "")),
      inputBlock("response", "Your response", plainInput("val", { multiline: true, initial: feedback.response || "" })),
    ],
    "Send",
    feedback.id
  );
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

// Kind/sender/when only -- never the real text (this file's own privacy
// rule, see the header comment: Slack workspace admins can export view/
// message history, so a Slack view is not a safe place for what someone
// actually typed). Most recent first, capped at 6; "Open in app" is where
// the real text is read.
export function listMessagesModal(messages) {
  const recent = messages.slice().reverse().slice(0, 6);
  const blocks = recent.length
    ? [
        ...recent.flatMap((m) => [context(`*${m.kind}* · ${m.created_by_name} · ${ago(m.created_at)}`), actions([button("Delete", "message_delete", m.id, "danger")])]),
        divider(),
        actions([openInApp("Open in app")]),
      ]
    : [section("No messages yet.")];
  return modal("list_messages", "Between you two", blocks, "Close");
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
// Same guard as listHandbookLinksModal below, for the exact same reason:
// Documents used to have its own in-Slack list, and it broke Slack's whole
// modal (stuck on "Loading…") the first time a signed URL failed to
// generate, because it emitted an invalid `url` field instead of guarding
// it -- see the file's git history and the note on listHandbookLinksModal.
// Melissa's call at the time was to replace the whole thing with a plain
// link to the app rather than fix the guard; SLACK_TODO.md 0g asks for the
// real in-Slack view back now that the actual bug (missing guard, not the
// list itself) is understood.
export function listDocumentsModal(docs) {
  const blocks = docs.length
    ? docs.flatMap((d) => [
        section(`*${d.name}*\n${ago(d.created_at)} · uploaded by ${d.created_by_name}`),
        d.url
          ? actions([Elements.Button({ text: "Open", url: d.url, actionId: "open_document_link" })])
          : context("Couldn't generate a link for this file — try again from the app."),
      ])
    : [section("No documents uploaded yet.")];
  blocks.push(divider(), actions([openInApp("Upload a document", "/dashboard")]));
  return modal("view_documents", "Documents", blocks, "Close");
}

export function listHandbookLinksModal(links) {
  const blocks = links.length
    ? links.flatMap((l) => [
        section(`*${l.title}*`),
        l.url
          ? actions([Elements.Button({ text: "Open handbook", url: l.url, actionId: "open_handbook_link" })])
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

// Real in-Slack history -- replaces the old "Open History in the app"
// website link (Melissa's call, 2026-09-18: this is a Slack plugin, nothing
// should route out to the website). Every wrapped-up 1:1, most recent
// first, capped at 10 for the same reason wrapUpConversationModal's
// checkboxes are -- ponytail: page or raise the cap if a real pair's
// history ever gets that long.
function meetingBlocks(m) {
  return [
    section(`*1:1 on ${m.meeting_date}*`),
    ...(m.discussed ? [section(`*Discussed:*\n${m.discussed}`)] : []),
    ...(m.agreed ? [section(`*Agreed:*\n${m.agreed}`)] : []),
    ...(m.revisit ? [section(`*Revisit next time:*\n${m.revisit}`)] : []),
    ...(m.start_line || m.stop_line || m.keep_line
      ? [
          section(
            [m.start_line && `*Start:* ${m.start_line}`, m.stop_line && `*Stop:* ${m.stop_line}`, m.keep_line && `*Keep:* ${m.keep_line}`]
              .filter(Boolean)
              .join("\n")
          ),
        ]
      : []),
  ];
}

// Manager-only (Melissa's call, 2026-09-18): "the manager is the only one
// that sees the history" -- both this AI summary and the wrapped-up-1:1
// list below it. The one place in the whole app that ever calls AI (see
// lib/ai-summary.js) -- summarizes the topics/goals/actions/past-notes
// already logged for this pair, not the private Message conversation
// (revised same day once Melissa confirmed the source; the DM read this
// originally used is gone). Generated on demand only (never automatic --
// costs a real API call), always labeled as AI-generated, and editable by
// the manager before it's final -- matches the governance rule in
// web-app/CLAUDE.md.
function summaryBlocks(ctx) {
  const { conversation_summary: summary, conversation_summary_generated_at: generatedAt, conversation_summary_edited_at: editedAt } = ctx.pair;
  if (!summary) {
    return [
      section(`*AI summary of your 1:1 history with ${ctx.partnerName}*\n${ctx._summaryNotice || "Nothing generated yet."}`),
      actions([button("Summarize", "summary_generate")]),
    ];
  }
  return [
    section(`*AI summary of your 1:1 history — reviewed by ${ctx.myName}*\n${summary}`),
    context(`Generated ${ago(generatedAt)}${editedAt ? ` · edited ${ago(editedAt)}` : ""}`),
    actions([button("Refresh", "summary_generate"), button("Edit", "summary_edit")]),
  ];
}

export function historyModal(meetings, ctx) {
  const recent = meetings.slice(0, 10);
  const meetingList = recent.length
    ? recent.flatMap((m, i) => [...meetingBlocks(m), ...(i < recent.length - 1 ? [divider()] : [])])
    : [section("No 1:1s wrapped up yet.")];
  const blocks = ctx.isMgr ? [...summaryBlocks(ctx), divider(), ...meetingList] : meetingList;
  return modal("view_history", "History", blocks, "Close");
}

export function editSummaryModal(currentText) {
  return modal(
    "edit_summary",
    "Edit summary",
    [inputBlock("summary", "AI summary", plainInput("val", { multiline: true, initial: currentText }))],
    "Save changes"
  );
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
    inputBlock("date", "Meeting date", datePicker("val", new Date().toISOString().slice(0, 10))),
    inputBlock("discussed", "What you discussed", plainInput("val", { multiline: true, placeholder: "The headline of what you talked about." }), true),
    inputBlock("agreed", "What you agreed", plainInput("val", { multiline: true, placeholder: "Decisions, expectations, anything you both signed up for." }), true),
    inputBlock("revisit", "Topics to revisit next time", plainInput("val", { multiline: true, placeholder: "Anything you ran out of time for." }), true),
    ...(checkboxOptions.length
      ? [inputBlock("discussed_topics", "Topics covered", checkboxes("val", checkboxOptions), true)]
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
// real user (flagged 2026-09-16). closePair() in lib/data.js is the
// hard-close action this modal doesn't do -- it's still called from the
// website/HR admin route, and now ALSO from this file's own add_employee
// handler for the "archive it" choice below, when a manager is replacing
// someone rather than adding a second report.
// -------------------------------------------------- add a new employee -----

// Manager-only, mirrors the website's "Add another pairing" (/onboarding/add)
// but scoped to manager-adds-employee, the one real request this exists for
// (SLACK_TODO.md) -- see createPairForSlack (lib/data.js) for why this can't
// just reuse the website's create_pair RPC.
//
// "Add a new employee" and "Edit their name" used to be two separate,
// confusing buttons that didn't cover the actual case a manager runs into
// most: an employee leaving and being replaced. This modal now asks
// explicitly what should happen to the CURRENT pairing (ctx.pairId) --
// kept open (the old "just add a second report" case) or archived (the new
// "replace them" case) -- rather than silently always keeping it open,
// which is what "Add a new employee" always did before.
//
// Picks from Slack's own member list (users_select) instead of typing an
// email or roster name, 2026-09-17 -- Melissa's call: IT already adds new
// hires to the Slack channel before a manager ever pairs with them here, so
// everyone a manager would add is already a pickable Slack member. Replaces
// the old free-text field and resolveEmployeeNameToEmail (lib/data.js),
// removed since nothing else called it -- the picker can't return a typo,
// so the roster-name-fallback it existed for no longer applies.
export function addEmployeeModal(ctx) {
  return modal(
    "add_employee",
    "Add or change employee",
    [
      section("Starts a new 1:1 pairing with you as their manager. Pick them from the workspace — it links right away if they already use Performance Pulse, or the moment they sign up otherwise."),
      inputBlock("employee_picker", "Employee", userSelect("val", "Choose a person")),
      inputBlock(
        "keep_current",
        `Your current pairing with ${ctx.partnerName}`,
        radioButtons("val", [
          { text: "Keep it open — adding another employee", value: "keep" },
          // Slack caps option text at 75 chars -- a long real name here
          // could blow that, found in review 2026-09-16 (same class of
          // silent-Slack-limit bug as the wrap-up modal title earlier
          // tonight). "Archive it — replacing " leaves ~50 chars of
          // headroom for the name, comfortably more than any real name.
          { text: `Archive it — replacing ${ctx.partnerName}`.slice(0, 75), value: "archive" },
        ])
      ),
    ],
    "Add employee"
  );
}

// d is the same shape homeView(ctx, d) already takes (loadHomeData's
// result) -- this used to take no data at all and just close *every* open
// topic/goal/action for the pair sight unseen. Rebuilt as a picker (Melissa,
// 2026-09-16: "I might not wanna clear out the conversation, especially if
// the person didn't respond") -- nothing is pre-checked, so leaving
// something unchecked leaves it exactly as it was, open and untouched.
export function wrapUpConversationModal(pairId, d) {
  const openTopics = (d?.topics || []).filter(isOpenTopic);
  const openGoals = (d?.goals || []).filter((g) => g.status !== "Complete" && g.status !== "Deferred");
  const openActions = (d?.actions || []).filter((a) => a.status !== "Done");
  // Slack's checkboxes element caps out at 10 options -- same ceiling
  // wrapUpModal's own "Topics covered" checkboxes already lives with.
  // ponytail: 10-item cap per list, page or switch to multi_static_select
  // if a real pair's backlog ever gets that long.
  const topicOptions = openTopics.slice(0, 10).map((t) => opt(t.text, `topic:${t.id}`));
  const goalOptions = openGoals.slice(0, 10).map((g) => opt(g.text, `goal:${g.id}`));
  const actionOptions = openActions.slice(0, 10).map((a) => opt(a.text, `action:${a.id}`));
  const nothingOpen = !topicOptions.length && !goalOptions.length && !actionOptions.length;
  return modal(
    "wrap_up_conversation",
    "Mark this as done",
    [
      section(
        nothingOpen
          ? "Nothing open right now — you're all caught up. Add a note below if you still want to send one."
          : "Check off what's actually done. Anything still waiting on a response — leave it unchecked and it stays open, untouched."
      ),
      ...(topicOptions.length ? [inputBlock("done_topics", "Topics", checkboxes("val", topicOptions), true)] : []),
      ...(goalOptions.length ? [inputBlock("done_goals", "Goals", checkboxes("val", goalOptions), true)] : []),
      ...(actionOptions.length ? [inputBlock("done_actions", "Actions", checkboxes("val", actionOptions), true)] : []),
      // inputBlock's 4th arg is Slack's own `optional` flag -- this was
      // hardcoded false (required) since the very first version of this
      // modal despite the label and placeholder both saying "Optional,"
      // silently blocking every submission with "Please complete this
      // required field" unless something was typed. Found live 2026-09-16
      // testing the wrap-up flow end to end, not caught by any prior review
      // because nothing before tonight actually submitted this modal.
      inputBlock("note", "Anything worth noting as this closes", plainInput("val", { multiline: true, placeholder: "Optional — goes in the note to your partner." }), true),
    ],
    "Mark as done",
    pairId
  );
}
