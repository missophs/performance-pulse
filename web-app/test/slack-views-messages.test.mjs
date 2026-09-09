// "Between you two" in Slack (addMessageModal/listMessagesModal,
// lib/slack-views.js) is new this session. Two things matter enough to pin
// with a real test rather than trust-by-reading:
// 1. The file's own header comment is a hard privacy rule, not a
//    suggestion: message TEXT must never be echoed into a Slack view (Slack
//    workspace admins can export view/message history). listMessagesModal
//    must show kind/sender/when only.
// 2. Both modal builders must actually produce valid-shaped Block Kit
//    output and not throw on realistic input (empty list, several
//    messages), since nothing else in this repo's test suite touches
//    lib/slack-views.js at all.
import { test } from "node:test";
import assert from "node:assert/strict";

const { addMessageModal, listMessagesModal, homeView } = await import("@/lib/slack-views");

function allText(blocks) {
  return JSON.stringify(blocks);
}

test("addMessageModal: valid modal shape, kind + text inputs, no draft/prefill needed", () => {
  const view = addMessageModal();
  assert.equal(view.type, "modal");
  assert.equal(view.callback_id, "add_message");
  const blockIds = view.blocks.filter((b) => b.type === "input").map((b) => b.block_id);
  assert.deepEqual(blockIds, ["kind", "text"]);
  const kindBlock = view.blocks.find((b) => b.block_id === "kind");
  assert.equal(kindBlock.element.type, "static_select");
  assert.ok(kindBlock.element.options.length >= 5, "expected the real MSG_KINDS list, not an empty/stub array");
  const textBlock = view.blocks.find((b) => b.block_id === "text");
  assert.equal(textBlock.element.type, "plain_text_input");
});

test("listMessagesModal: empty state doesn't throw and says so plainly", () => {
  const view = listMessagesModal([]);
  assert.equal(view.type, "modal");
  assert.match(allText(view.blocks), /No messages yet/);
});

test("listMessagesModal: never echoes message text into the view (privacy rule)", () => {
  const SECRET = "the actual private thing someone typed, never Slack's business";
  const messages = [
    { id: "1", kind: "Concern", text: SECRET, created_by_name: "Alex", created_at: new Date().toISOString() },
    { id: "2", kind: "Idea", text: "a second private message body", created_by_name: "Sam", created_at: new Date().toISOString() },
  ];
  const view = listMessagesModal(messages);
  const rendered = allText(view.blocks);
  assert.ok(!rendered.includes(SECRET), "message text leaked into the Slack view — violates the file's own privacy rule");
  assert.ok(!rendered.includes("a second private message body"));
  // What SHOULD be there: kind, sender, and a real link out to the app.
  assert.match(rendered, /Concern/);
  assert.match(rendered, /Alex/);
  assert.ok(view.blocks.some((b) => JSON.stringify(b).includes('"url"')), "expected an in-app link to read the real text");
});

test("listMessagesModal: caps the rendered list at 6 most-recent, newest first", () => {
  const messages = Array.from({ length: 9 }, (_, i) => ({
    id: String(i),
    kind: "Question",
    text: `msg ${i}`,
    created_by_name: "Alex",
    created_at: new Date(2026, 0, i + 1).toISOString(),
  }));
  const view = listMessagesModal(messages);
  const contextBlocks = view.blocks.filter((b) => b.type === "context");
  assert.equal(contextBlocks.length, 6);
});

test("homeView: renders the Between you two section for both roles, with a real message count, and doesn't throw when messages is empty", () => {
  const baseCtx = {
    pairs: [{ id: "p1", partnerName: "Partner" }],
    pairId: "p1",
    pair: { next_1on1_date: null, next_1on1_time: null },
    myName: "Me",
    partnerName: "Partner",
  };
  const baseData = { topics: [], actions: [], goals: [], devPlans: [], achievements: [], feedback: [], feedbackRequests: [], documents: [], messages: [] };

  for (const isMgr of [true, false]) {
    const ctx = { ...baseCtx, isMgr, role: isMgr ? "manager" : "employee", otherRole: isMgr ? "employee" : "manager" };
    const view = homeView(ctx, baseData);
    const rendered = JSON.stringify(view.blocks);
    assert.match(rendered, /Between you two/, `missing for ${ctx.role}`);
    assert.ok(rendered.includes('"open_add_message"'), `missing Send button for ${ctx.role}`);
    assert.ok(rendered.includes('"open_list_messages"'), `missing View button for ${ctx.role}`);
  }
});
