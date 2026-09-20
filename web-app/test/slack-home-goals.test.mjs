// homeView + listGoalsModal + listDocumentsModal changes, 2026-09-19
// (Melissa's requests, same session as slack-history.test.mjs): employee's
// goal button reads "Suggest a goal" not "Add a goal", employees get a
// one-click "Mark complete" on their own goals, the whole Handbook section
// is gone, the "Mark ... done" button names who you're confirming with, and
// "Upload a document" -- first removed for linking to a dead website login,
// then rebuilt the same night as a real in-Slack file_input upload.
import { test } from "node:test";
import assert from "node:assert/strict";

const { homeView, listGoalsModal, listDocumentsModal, addEmployeeModal, addDocumentModal } = await import("@/lib/slack-views");

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

test("homeView: no Handbook section, but Upload a document is back pointing at the real in-Slack modal", () => {
  for (const isMgr of [true, false]) {
    const ctx = { ...baseCtx, isMgr, role: isMgr ? "manager" : "employee", otherRole: isMgr ? "employee" : "manager" };
    const view = homeView(ctx, baseData);
    const rendered = allText(view);
    assert.doesNotMatch(rendered, /Handbook/, `Handbook leaked for ${ctx.role}`);
    assert.match(rendered, /Upload a document/, `expected Upload a document for ${ctx.role}`);
    assert.ok(actionIds(view).includes("open_add_document"), `Upload a document should open the real in-Slack modal for ${ctx.role}`);
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

test("listDocumentsModal: Upload a document opens the real in-Slack modal (2026-09-19: replaced the dead website link)", () => {
  const empty = listDocumentsModal([]);
  assert.match(allText(empty), /Upload a document/);
  assert.ok(actionIds(empty).includes("open_add_document"));
});

test("addDocumentModal: has a required file_input element", () => {
  const view = addDocumentModal();
  const fileBlock = view.blocks.find((b) => b.type === "input" && b.block_id === "file");
  assert.ok(fileBlock, "expected an input block for the file");
  assert.equal(fileBlock.element.type, "file_input");
  assert.equal(fileBlock.optional, false);
});

test("addEmployeeModal: asks for the employee's name, not just the Slack picker", () => {
  const view = addEmployeeModal({ ...baseCtx, isMgr: true, role: "manager", otherRole: "employee" });
  const inputBlocks = view.blocks.filter((b) => b.type === "input").map((b) => b.block_id);
  assert.ok(inputBlocks.includes("employee_picker"), "expected the Slack user picker to still be there");
  assert.ok(inputBlocks.includes("employee_name"), "expected a text field asking for the employee's name");
  const nameBlock = view.blocks.find((b) => b.block_id === "employee_name");
  assert.equal(nameBlock.optional, false, "the name field must be required, not optional");
});

test("homeView: Private notes section is now open to both roles, and Write a note's green state is scoped to the viewer's own notes", () => {
  const notes = [
    { role: "manager", text: "manager's own note" },
    { role: "employee", text: "employee's own note" },
  ];
  for (const isMgr of [true, false]) {
    const ctx = { ...baseCtx, isMgr, role: isMgr ? "manager" : "employee", otherRole: isMgr ? "employee" : "manager" };
    const view = homeView(ctx, { ...baseData, customSuggestions: notes });
    assert.match(allText(view), /Private notes/, `Private notes missing for ${ctx.role}`);
    const writeNoteButton = view.blocks
      .filter((b) => b.type === "actions")
      .flatMap((b) => b.elements)
      .find((el) => el.action_id === "open_add_suggestion");
    assert.equal(writeNoteButton.style, "primary", `${ctx.role} has one of their own notes, button should be green`);
  }
  // Neither role should light up green off ONLY the other role's note.
  const mgrCtxNoOwnNotes = { ...baseCtx, isMgr: true, role: "manager", otherRole: "employee" };
  const mgrView = homeView(mgrCtxNoOwnNotes, { ...baseData, customSuggestions: [{ role: "employee", text: "not the manager's" }] });
  const mgrWriteNoteButton = mgrView.blocks
    .filter((b) => b.type === "actions")
    .flatMap((b) => b.elements)
    .find((el) => el.action_id === "open_add_suggestion");
  assert.notEqual(mgrWriteNoteButton.style, "primary", "manager's button must not light up off the employee's note");
});
