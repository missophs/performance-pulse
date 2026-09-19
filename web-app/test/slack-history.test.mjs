// historyModal (lib/slack-views.js) changed shape entirely this session
// (Melissa's request, 2026-09-19: AI summary viewable by both roles, a
// manager-only Delete per 1:1, topics_snapshot rendered, and an "Other
// activity" feed for anything exchanged outside a wrap-up) -- pinning the
// real behavior with a test rather than trust-by-reading, same reasoning as
// slack-views-messages.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";

const { historyModal } = await import("@/lib/slack-views");

function actionIds(view) {
  const ids = [];
  for (const b of view.blocks) if (b.type === "actions") for (const el of b.elements) ids.push(el.action_id);
  return ids;
}
function allText(view) {
  return JSON.stringify(view);
}

const pair = { conversation_summary: "Talked about growth and Q3 goals.", conversation_summary_generated_at: "2026-09-19T10:00:00Z", conversation_summary_edited_at: null };
const mgrCtx = { pair, isMgr: true, myName: "Melissa", partnerName: "Monty", role: "manager", otherRole: "employee" };
const empCtx = { pair, isMgr: false, myName: "Monty", partnerName: "Melissa", role: "employee", otherRole: "manager" };
const data = {
  meetings: [
    {
      id: "m1",
      meeting_date: "2026-09-15",
      discussed: "Talked about Q3",
      agreed: "",
      revisit: "",
      start_line: "",
      stop_line: "",
      keep_line: "",
      topics_snapshot: [{ text: "Career path", status: "done", notes: "Wants to move into management" }],
      created_at: "2026-09-15T10:00:00Z",
      created_by_name: "Melissa",
    },
  ],
  feedback: [{ created_at: "2026-09-18T09:00:00Z", type: "Growth", from_name: "Melissa", text: "Great job on the launch" }],
  goals: [{ created_at: "2026-09-10T09:00:00Z", text: "Improve public speaking", why: "upcoming presentation" }],
  actions: [{ created_at: "2026-09-11T09:00:00Z", text: "Schedule 1:1s", notes: "weekly" }],
  devPlans: [{ created_at: "2026-09-12T09:00:00Z", type: "Coaching", status: "In progress" }],
  achievements: [{ created_at: "2026-09-13T09:00:00Z", category: "Delivery", achievement_date: "2026-09-13" }],
};

test("historyModal: AI summary text is view-only for the employee, not manager-gated out entirely", () => {
  const mgrView = historyModal(data, mgrCtx);
  const empView = historyModal(data, empCtx);
  assert.match(allText(mgrView), /Talked about growth and Q3 goals\./);
  assert.match(allText(empView), /Talked about growth and Q3 goals\./);
});

test("historyModal: Refresh/Edit summary buttons stay manager-only", () => {
  const mgrView = historyModal(data, mgrCtx);
  const empView = historyModal(data, empCtx);
  assert.ok(actionIds(mgrView).includes("summary_generate") && actionIds(mgrView).includes("summary_edit"));
  assert.ok(!actionIds(empView).includes("summary_generate") && !actionIds(empView).includes("summary_edit"));
});

test("historyModal: summary 'reviewed by' names the manager even when the employee is viewing", () => {
  const empView = historyModal(data, empCtx);
  assert.match(allText(empView), /reviewed by Melissa/, "must name the manager (Melissa), not the viewer (Monty)");
});

test("historyModal: Delete on a 1:1 is manager-only", () => {
  const mgrView = historyModal(data, mgrCtx);
  const empView = historyModal(data, empCtx);
  assert.ok(actionIds(mgrView).includes("meeting_delete"));
  assert.ok(!actionIds(empView).includes("meeting_delete"));
});

test("historyModal: renders topics_snapshot per-topic notes for both roles", () => {
  const mgrView = historyModal(data, mgrCtx);
  const empView = historyModal(data, empCtx);
  for (const view of [mgrView, empView]) {
    assert.match(allText(view), /Career path/);
    assert.match(allText(view), /Wants to move into management/);
  }
});

test("historyModal: 'Other activity' surfaces feedback/goals/actions given outside a wrap-up", () => {
  const view = historyModal(data, mgrCtx);
  const rendered = allText(view);
  assert.match(rendered, /Other activity/);
  assert.match(rendered, /Great job on the launch/);
  assert.match(rendered, /Improve public speaking/);
  assert.match(rendered, /Schedule 1:1s/);
});

test("historyModal: dev plans/achievements in 'Other activity' stay structural-fields-only (no full text)", () => {
  const view = historyModal(data, mgrCtx);
  const rendered = allText(view);
  assert.match(rendered, /Development plan.*Coaching/);
  assert.match(rendered, /Achievement.*Delivery/);
  assert.ok(!rendered.includes("undefined"));
});

test("historyModal: empty state doesn't throw, no Summarize button for an employee with nothing generated yet", () => {
  const emptyData = { meetings: [], feedback: [], goals: [], actions: [], devPlans: [], achievements: [] };
  const emptyPair = { conversation_summary: null, conversation_summary_generated_at: null, conversation_summary_edited_at: null };
  const view = historyModal(emptyData, { ...empCtx, pair: emptyPair });
  assert.match(allText(view), /No 1:1s wrapped up yet\./);
  assert.match(allText(view), /your manager can create one/);
  assert.ok(!actionIds(view).includes("summary_generate"));
});
