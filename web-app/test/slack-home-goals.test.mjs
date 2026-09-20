// homeView + listGoalsModal + listDocumentsModal changes, 2026-09-19
// (Melissa's requests, same session as slack-history.test.mjs): employee's
// goal button reads "Suggest a goal" not "Add a goal", employees get a
// one-click "Mark complete" on their own goals, "Upload a document" (a dead
// link to the website's login page) and the whole Handbook section are
// gone, and the "Mark ... done" button names who you're confirming with.
import { test } from "node:test";
import assert from "node:assert/strict";

const { homeView, listGoalsModal, listDocumentsModal, addEmployeeModal } = await import("@/lib/slack-views");

function allText(view) {
  return JSON.stringify(view.blocks ?? view);
}
function actionIds(view) {
  const ids = [];
  for (const b of view.blocks) if (b.type === "actions") for (const el of b.elements) ids.push(el.action_id);
  return ids;
}

const baseCtx = {
  pairs: [{ id: "p1", partnerName: "Partner" }],
  pairId: "p1",
  pair: { next_1on1_date: null, next_1on1_time: null, chat_opened_at: null },
  myName: "Me",
  partnerName: "Partner",
};
const baseData = {
  topics: [],
  actions: [],
  goals: [],
  devPlans: [],
  achievements: [],
  feedback: [],
  feedbackRequests: [],
  documents: [],
  customSuggestions: [],
  messages: [],
  concerns: [],
};

test("homeView: goal button reads 'Suggest a goal' for the employee, 'Add a goal' for the manager", () => {
  const mgrView = homeView({ ...baseCtx, isMgr: true, role: "manager", otherRole: "employee" }, baseData);
  const empView = homeView({ ...baseCtx, isMgr: false, role: "employee", otherRole: "manager" }, baseData);
  assert.match(allText(mgrView), /Add a goal/);
  assert.doesNotMatch(allText(mgrView), /Suggest a goal/);
  assert.match(allText(empView), /Suggest a goal/);
  assert.doesNotMatch(allText(empView), /"text":"Add a goal"/);
});

test("homeView: no 'Upload a document' link and no Handbook section for either role", () => {
  for (const isMgr of [true, false]) {
    const ctx = { ...baseCtx, isMgr, role: isMgr ? "manager" : "employee", otherRole: isMgr ? "employee" : "manager" };
    const rendered = allText(homeView(ctx, baseData));
    assert.doesNotMatch(rendered, /Upload a document/, `Upload a document leaked for ${ctx.role}`);
    assert.doesNotMatch(rendered, /Handbook/, `Handbook leaked for ${ctx.role}`);
  }
});

test("homeView: mark-done button names who you're confirming with, per role", () => {
  const mgrView = homeView({ ...baseCtx, isMgr: true, role: "manager", otherRole: "employee" }, baseData);
  const empView = homeView({ ...baseCtx, isMgr: false, role: "employee", otherRole: "manager" }, baseData);
  assert.match(allText(mgrView), /Confirmed with employee — actions done/);
  assert.match(allText(empView), /Confirmed with manager — actions done/);
});

test("homeView: History section renders after the mark-done section, not before it", () => {
  const view = homeView({ ...baseCtx, isMgr: true, role: "manager", otherRole: "employee" }, baseData);
  const rendered = allText(view);
  const markDoneIdx = rendered.indexOf("actions done");
  const historyIdx = rendered.indexOf("Every wrapped-up 1:1");
  assert.ok(markDoneIdx > -1 && historyIdx > -1, "expected both sections to be present");
  assert.ok(historyIdx > markDoneIdx, "History should render after the mark-done section");
});

test("listGoalsModal: employee sees Mark complete on an incomplete goal, not on an already-complete one; manager never sees it", () => {
  const goals = [
    { id: "g1", text: "Ship the thing", status: "In Progress", progress: 40 },
    { id: "g2", text: "Already done", status: "Complete", progress: 100 },
  ];
  const empView = listGoalsModal(goals, false, "employee");
  const mgrView = listGoalsModal(goals, true, "manager");
  const empIds = actionIds(empView);
  const mgrIds = actionIds(mgrView);
  assert.equal(empIds.filter((id) => id === "goal_complete").length, 1, "expected exactly one Mark complete button (for g1 only)");
  assert.ok(!mgrIds.includes("goal_complete"), "manager should never see Mark complete");
});

test("listDocumentsModal: no Upload a document button regardless of contents", () => {
  const empty = listDocumentsModal([]);
  const withDocs = listDocumentsModal([{ id: "d1", name: "Handbook.pdf", url: "https://example.com/f", created_at: new Date().toISOString(), created_by_name: "Alex" }]);
  assert.doesNotMatch(allText(empty), /Upload a document/);
  assert.doesNotMatch(allText(withDocs), /Upload a document/);
});

test("addEmployeeModal: asks for the employee's name, not just the Slack picker", () => {
  const view = addEmployeeModal({ ...baseCtx, isMgr: true, role: "manager", otherRole: "employee" });
  const inputBlocks = view.blocks.filter((b) => b.type === "input").map((b) => b.block_id);
  assert.ok(inputBlocks.includes("employee_picker"), "expected the Slack user picker to still be there");
  assert.ok(inputBlocks.includes("employee_name"), "expected a text field asking for the employee's name");
  const nameBlock = view.blocks.find((b) => b.block_id === "employee_name");
  assert.equal(nameBlock.optional, false, "the name field must be required, not optional");
});
