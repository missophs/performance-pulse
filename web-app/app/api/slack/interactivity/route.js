// Slack Interactivity endpoint — every button click and modal submit in the
// Home tab flows through here. Configure in the Slack app under
// Interactivity & Shortcuts, Request URL: https://<deployed-app>/api/slack/interactivity
//
// Payloads arrive as application/x-www-form-urlencoded with one field,
// `payload`, containing the JSON Slack actually cares about.

import { createClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { verifySlackSignature } from "@/lib/slack-verify";
import { resolveSlackUser } from "@/lib/slack-user";
import { slackApi } from "@/lib/slack-api";
import { loadHomeData } from "@/lib/slack-home-data";
import {
  homeView,
  editNameModal,
  addTopicModal,
  listTopicsModal,
  addActionModal,
  listActionsModal,
  addGoalModal,
  listGoalsModal,
  addDevPlanModal,
  listDevPlansModal,
  addAchievementModal,
  listAchievementsModal,
  addFeedbackModal,
  addFeedbackRequestModal,
  listFeedbackModal,
  wrapUpModal,
  lastMeetingModal,
} from "@/lib/slack-views";
import {
  setTopicStatus,
  toggleActionDone,
  setFeedbackRequestStatus,
  addTopic,
  saveAction,
  saveGoal,
  saveDevelopmentPlan,
  addAchievement,
  addFeedback,
  addFeedbackRequest,
  saveWrapUp,
  notify,
  listMeetings,
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
function delayedNotify(admin, pairId, text, role, otherRole, view, kind) {
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, DELAYED_NOTIFY_MS));
    await notify(admin, pairId, text, role, otherRole, view, kind).catch((e) => console.error("delayed notify:", e));
  });
}

async function refreshHome(admin, ctx) {
  const view = homeView(ctx, await loadHomeData(admin, ctx.pairId));
  await slackApi("views.publish", { user_id: ctx.slackUserId, view }).catch((e) => console.error("home publish:", e));
}

// -------------------------------------------------------- open a modal -----

async function draftFor(admin, ctx, kind) {
  const row = await getFormDraft(admin, ctx.pairId, ctx.role, kind).catch(() => null);
  return row?.draft;
}

const OPENERS = {
  open_edit_name: async (admin, ctx) => editNameModal(ctx),
  open_add_topic: async (admin, ctx) => addTopicModal(ctx, await draftFor(admin, ctx, "topic")),
  open_add_action: async (admin, ctx) => addActionModal(ctx),
  open_wrap_up: async (admin, ctx) => wrapUpModal((await loadHomeData(admin, ctx.pairId)).topics),
  open_add_goal: async (admin, ctx) => addGoalModal(await draftFor(admin, ctx, "goal")),
  open_add_devplan: async (admin, ctx) => addDevPlanModal(await draftFor(admin, ctx, "dev")),
  open_add_achievement: async (admin, ctx) => addAchievementModal(await draftFor(admin, ctx, "achievement")),
  open_add_feedback: async (admin, ctx) => addFeedbackModal(ctx, await draftFor(admin, ctx, "feedback")),
  open_add_feedback_request: async () => addFeedbackRequestModal(),
  open_list_topics: async (admin, ctx) => listTopicsModal((await loadHomeData(admin, ctx.pairId)).topics),
  open_list_actions: async (admin, ctx) => listActionsModal((await loadHomeData(admin, ctx.pairId)).actions),
  open_list_goals: async (admin, ctx) => listGoalsModal((await loadHomeData(admin, ctx.pairId)).goals),
  open_list_devplans: async (admin, ctx) => listDevPlansModal((await loadHomeData(admin, ctx.pairId)).devPlans),
  open_list_achievements: async (admin, ctx) => listAchievementsModal((await loadHomeData(admin, ctx.pairId)).achievements),
  open_list_feedback: async (admin, ctx) => {
    const d = await loadHomeData(admin, ctx.pairId);
    return listFeedbackModal(d.feedback, d.feedbackRequests);
  },
  open_last_meeting: async (admin, ctx) => lastMeetingModal(await listMeetings(admin, ctx.pairId)),
};

// --------------------------------------------- save a draft mid-modal ------

// Slack's view_closed event drops plain_text_input values (confirmed live —
// a real platform limit, not something fixable here), so a modal can't
// autosave on Cancel/X. A button click doesn't have that limit — it carries
// the full current field state — so each add-modal gets an explicit "Save
// draft" button instead. draftFor() above (used when the modal is opened)
// is what shows the saved draft again later.
const SAVE_DRAFT = {
  save_draft_topic: { kind: "topic", fields: ["text", "why", "category"], build: (ctx, draft) => addTopicModal(ctx, draft, true) },
  save_draft_goal: { kind: "goal", fields: ["text", "why", "measure", "target", "status"], build: (ctx, draft) => addGoalModal(draft, true) },
  save_draft_devplan: { kind: "dev", fields: ["area", "type", "activity", "target"], build: (ctx, draft) => addDevPlanModal(draft, true) },
  save_draft_achievement: { kind: "achievement", fields: ["title", "category", "impact", "date"], build: (ctx, draft) => addAchievementModal(draft, true) },
  save_draft_feedback: { kind: "feedback", fields: ["type", "text", "example"], build: (ctx, draft) => addFeedbackModal(ctx, draft, true) },
};

// ----------------------------------------------------- direct mutations ----

const QUICK_ACTIONS = {
  topic_mark_discussed: async (admin, ctx, id) => {
    await setTopicStatus(admin, id, "Discussed");
    await notify(admin, ctx.pairId, `Topic marked Discussed by ${ctx.myName}`, ctx.role, ctx.otherRole, "oneOnOne");
  },
  action_mark_done: async (admin, ctx, id) => {
    await toggleActionDone(admin, id, true);
    await notify(admin, ctx.pairId, `${ctx.myName} marked an action done`, ctx.role, ctx.otherRole, "actions");
  },
  feedback_request_answered: async (admin, ctx, id) => {
    await setFeedbackRequestStatus(admin, id, "closed");
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

const SUBMISSIONS = {
  edit_name: async (admin, ctx, v) => {
    const name = (fieldVal(v, "name") || "").trim();
    if (!name) return;
    await updateProfile(admin, ctx.profileId, { full_name: name });
    ctx.myName = name; // so the Home-tab refresh right after this shows the new name immediately
  },
  add_topic: async (admin, ctx, v) => {
    const suggested = fieldVal(v, "suggested");
    const manualText = (fieldVal(v, "text") || "").trim();
    let text, category;
    if (suggested) {
      const sep = suggested.indexOf("::");
      category = suggested.slice(0, sep);
      text = suggested.slice(sep + 2);
    } else if (manualText) {
      text = manualText;
      category = fieldVal(v, "category") || "Other";
    } else {
      return { error: { blockId: "text", message: "Pick a suggestion above, or write your own topic." } };
    }
    await addTopic(admin, ctx.pairId, { text, why: fieldVal(v, "why"), category, role: ctx.role, name: ctx.myName });
    await clearFormDraft(admin, ctx.pairId, ctx.role, "topic").catch(() => {});
    await notify(admin, ctx.pairId, `${ctx.myName} added a topic: ${text}`, ctx.role, ctx.otherRole, "oneOnOne", "topic");
  },
  add_action: async (admin, ctx, v) => {
    const text = fieldVal(v, "text");
    await saveAction(admin, ctx.pairId, { text, owner: fieldVal(v, "owner"), due: fieldVal(v, "due"), status: "Open" }, ctx.myName);
    await notify(admin, ctx.pairId, `${ctx.myName} added an action: ${text}`, ctx.role, ctx.otherRole, "actions", "action");
  },
  add_goal: async (admin, ctx, v) => {
    const text = fieldVal(v, "text");
    await saveGoal(
      admin,
      ctx.pairId,
      { text, why: fieldVal(v, "why"), measure: fieldVal(v, "measure"), owner: ctx.myName, target: fieldVal(v, "target"), status: fieldVal(v, "status"), progress: 0 },
      ctx.myName
    );
    await clearFormDraft(admin, ctx.pairId, ctx.role, "goal").catch(() => {});
    delayedNotify(admin, ctx.pairId, `${ctx.myName} added a goal: ${text}`, ctx.role, ctx.otherRole, "goals");
  },
  add_devplan: async (admin, ctx, v) => {
    const area = fieldVal(v, "area");
    await saveDevelopmentPlan(
      admin,
      ctx.pairId,
      { area, type: fieldVal(v, "type"), activity: fieldVal(v, "activity"), target: fieldVal(v, "target"), status: "Not Started" },
      ctx.role,
      ctx.myName
    );
    await clearFormDraft(admin, ctx.pairId, ctx.role, "dev").catch(() => {});
    delayedNotify(admin, ctx.pairId, `${ctx.myName} added a development plan: ${area}`, ctx.role, ctx.otherRole, "development");
  },
  add_achievement: async (admin, ctx, v) => {
    const title = fieldVal(v, "title");
    await addAchievement(admin, ctx.pairId, { title, category: fieldVal(v, "category"), impact: fieldVal(v, "impact"), date: fieldVal(v, "date"), role: ctx.role, name: ctx.myName });
    await clearFormDraft(admin, ctx.pairId, ctx.role, "achievement").catch(() => {});
    delayedNotify(admin, ctx.pairId, `${ctx.myName} logged an achievement: ${title}`, ctx.role, ctx.otherRole, "performance");
  },
  add_feedback: async (admin, ctx, v) => {
    await addFeedback(admin, ctx.pairId, { giverRole: ctx.role, fromName: ctx.myName, toName: ctx.partnerName, type: fieldVal(v, "type"), text: fieldVal(v, "text"), example: fieldVal(v, "example") });
    await clearFormDraft(admin, ctx.pairId, ctx.role, "feedback").catch(() => {});
    delayedNotify(admin, ctx.pairId, `${ctx.myName} left you feedback`, ctx.role, ctx.otherRole, "performance", "feedback");
  },
  add_feedback_request: async (admin, ctx, v) => {
    await addFeedbackRequest(admin, ctx.pairId, { fromRole: ctx.role, fromName: ctx.myName, about: fieldVal(v, "about"), why: fieldVal(v, "why") });
    delayedNotify(admin, ctx.pairId, `${ctx.myName} asked you for feedback`, ctx.role, ctx.otherRole, "performance", "request");
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

async function handleInteraction(admin, slackUserId, payload) {
  const ctx = slackUserId ? await resolveSlackUser(admin, slackUserId) : null;
  if (!ctx) return Response.json({ ok: true }); // not linked — nothing we can do

  if (payload.type === "block_actions") {
    const action = payload.actions?.[0];
    if (!action) return Response.json({ ok: true });

    if (OPENERS[action.action_id]) {
      const view = await OPENERS[action.action_id](admin, ctx, action.value);
      await slackApi("views.open", { trigger_id: payload.trigger_id, view });
    } else if (SAVE_DRAFT[action.action_id]) {
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
      await QUICK_ACTIONS[action.action_id](admin, ctx, action.value);
      await refreshHome(admin, ctx);
      // Also refresh the list modal in place, if this click came from one.
      if (payload.view?.id) {
        const listAgain = {
          topic_mark_discussed: async () => listTopicsModal((await loadHomeData(admin, ctx.pairId)).topics),
          action_mark_done: async () => listActionsModal((await loadHomeData(admin, ctx.pairId)).actions),
          feedback_request_answered: async () => {
            const d = await loadHomeData(admin, ctx.pairId);
            return listFeedbackModal(d.feedback, d.feedbackRequests);
          },
        }[action.action_id];
        if (listAgain) {
          await slackApi("views.update", { view_id: payload.view.id, view: await listAgain() }).catch((e) => console.error("view update:", e));
        }
      }
    }
    return Response.json({ ok: true });
  }

  if (payload.type === "view_submission") {
    const handler = SUBMISSIONS[payload.view?.callback_id];
    if (handler) {
      const result = await handler(admin, ctx, payload.view.state.values);
      if (result?.error) {
        return Response.json({ response_action: "errors", errors: { [result.error.blockId]: result.error.message } });
      }
      await refreshHome(admin, ctx);
    }
    return Response.json({}); // close the modal
  }

  return Response.json({ ok: true });
}
