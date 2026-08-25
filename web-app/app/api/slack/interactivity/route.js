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
  loadingModal,
  noticeModal,
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

// `title` is shown in the placeholder modal that opens instantly, so it should
// match the title `build` returns — only the body swaps when the data lands.
const OPENERS = {
  open_edit_name: { title: "Your name", build: async (admin, ctx) => editNameModal(ctx) },
  open_add_topic: { title: "Add a topic", build: async (admin, ctx) => addTopicModal(ctx, await draftFor(admin, ctx, "topic")) },
  open_add_action: { title: "Add an action", build: async (admin, ctx) => addActionModal(ctx) },
  open_wrap_up: { title: "Wrap up", build: async (admin, ctx) => wrapUpModal((await loadHomeData(admin, ctx.pairId)).topics) },
  open_add_goal: { title: "Add a goal", build: async (admin, ctx) => addGoalModal(await draftFor(admin, ctx, "goal")) },
  open_add_devplan: { title: "Add a development plan", build: async (admin, ctx) => addDevPlanModal(await draftFor(admin, ctx, "dev")) },
  open_add_achievement: { title: "Log an achievement", build: async (admin, ctx) => addAchievementModal(await draftFor(admin, ctx, "achievement")) },
  open_add_feedback: { title: "Give feedback", build: async (admin, ctx) => addFeedbackModal(ctx, await draftFor(admin, ctx, "feedback")) },
  open_add_feedback_request: { title: "Ask for feedback", build: async () => addFeedbackRequestModal() },
  open_list_topics: { title: "Open topics", build: async (admin, ctx) => listTopicsModal((await loadHomeData(admin, ctx.pairId)).topics) },
  open_list_actions: { title: "Open actions", build: async (admin, ctx) => listActionsModal((await loadHomeData(admin, ctx.pairId)).actions) },
  open_list_goals: { title: "Goals", build: async (admin, ctx) => listGoalsModal((await loadHomeData(admin, ctx.pairId)).goals) },
  open_list_devplans: { title: "Development plans", build: async (admin, ctx) => listDevPlansModal((await loadHomeData(admin, ctx.pairId)).devPlans) },
  open_list_achievements: { title: "Achievements", build: async (admin, ctx) => listAchievementsModal((await loadHomeData(admin, ctx.pairId)).achievements) },
  open_list_feedback: {
    title: "Feedback",
    build: async (admin, ctx) => {
      const d = await loadHomeData(admin, ctx.pairId);
      return listFeedbackModal(d.feedback, d.feedbackRequests);
    },
  },
  open_last_meeting: { title: "Last 1:1", build: async (admin, ctx) => lastMeetingModal(await listMeetings(admin, ctx.pairId)) },
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

// Each quick action pairs its mutation with how to redraw the list modal it
// was clicked from (if any) — kept together so adding one can't mean
// forgetting the other, which used to silently leave a stale list modal.
const QUICK_ACTIONS = {
  topic_mark_discussed: {
    run: async (admin, ctx, id) => {
      await setTopicStatus(admin, id, "Discussed");
      await notify(admin, ctx.pairId, `Topic marked Discussed by ${ctx.myName}`, ctx.role, ctx.otherRole, "oneOnOne");
    },
    refreshList: (data) => listTopicsModal(data.topics),
  },
  action_mark_done: {
    run: async (admin, ctx, id) => {
      await toggleActionDone(admin, id, true);
      await notify(admin, ctx.pairId, `${ctx.myName} marked an action done`, ctx.role, ctx.otherRole, "actions");
    },
    refreshList: (data) => listActionsModal(data.actions),
  },
  feedback_request_answered: {
    run: async (admin, ctx, id) => {
      await setFeedbackRequestStatus(admin, id, "closed");
    },
    refreshList: (data) => listFeedbackModal(data.feedback, data.feedbackRequests),
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
    delayedNotify(admin, ctx.pairId, `${ctx.myName} added a topic: ${text}`, ctx.role, ctx.otherRole, "oneOnOne", "topic");
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
        await slackApi("views.update", { view_id: payload.view.id, view: spec.refreshList(data) }).catch((e) => console.error("view update:", e));
      }
      after(() => refreshHome(admin, ctx, data));
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
      // The save already happened above; closing the modal shouldn't wait on
      // the Home-tab republish (see refreshHome). edit_name's ctx.myName
      // mutation lands before this runs, so the refresh still shows the new name.
      after(() => refreshHome(admin, ctx));
    }
    return Response.json({}); // close the modal
  }

  return Response.json({ ok: true });
}
