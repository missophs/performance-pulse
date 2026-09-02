// resolveSlackUser decides which pair — and therefore whose private 1:1 data —
// a Slack request is allowed to see. These tests pin the "how many pairs did
// we find" branch in particular: one pair is the normal case; two pairs is a
// real org shape (a middle manager) that used to throw, then used to refuse
// with an ambiguous sentinel, and now must pick one *current* pair (from a
// saved selection, or the oldest pair otherwise) while still listing every
// pairing so a caller (the Home tab switcher) can show which one is current.
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const EMAIL = "middle.manager@example.com";

// A module can only be mocked once per process, so the mock reads a mutable
// profile rather than being re-declared per test.
let slackProfile = { email: EMAIL };

mock.module("@/lib/slack-api", {
  exports: {
    slackApi: async () => ({ user: { profile: slackProfile } }),
  },
});

const { resolveSlackUser } = await import("@/lib/slack-user");

// Stands in for the Supabase query builder used for both the `pairs` query
// (terminates in .order()) and the `slack_pair_selections` lookup
// (terminates in .maybeSingle()) — same builder shape works for both since
// each chain only ever calls its own terminal method.
function fakeAdmin(rows, selection) {
  const builder = {
    from: () => builder,
    select: () => builder,
    or: () => builder,
    eq: () => builder,
    is: () => builder,
    order: () => Promise.resolve({ data: rows, error: null }),
    maybeSingle: () => Promise.resolve({ data: selection || null, error: null }),
  };
  return builder;
}

const pairAsEmployee = {
  id: "pair-1",
  employee_email: EMAIL,
  manager_email: "boss@example.com",
  employee_id: "p-emp",
  manager_id: "p-mgr",
  employee: { id: "p-emp", full_name: "Middle Manager" },
  manager: { id: "p-mgr", full_name: "Big Boss" },
};

const pairAsManager = {
  id: "pair-2",
  employee_email: "report@example.com",
  manager_email: EMAIL,
  employee_id: "p-rep",
  manager_id: "p-emp",
  employee: { id: "p-rep", full_name: "Direct Report" },
  manager: { id: "p-emp", full_name: "Middle Manager" },
};

test("no matching pair returns null", async () => {
  assert.equal(await resolveSlackUser(fakeAdmin([]), "U123"), null);
});

test("one matching pair returns the usual context", async () => {
  const ctx = await resolveSlackUser(fakeAdmin([pairAsEmployee]), "U123");
  assert.equal(ctx.pairId, "pair-1");
  assert.equal(ctx.role, "employee");
  assert.equal(ctx.myName, "Middle Manager");
  assert.equal(ctx.partnerName, "Big Boss");
  assert.deepEqual(ctx.pairs, [{ id: "pair-1", partnerName: "Big Boss" }]);
});

test("one matching pair, as the manager, still resolves", async () => {
  const ctx = await resolveSlackUser(fakeAdmin([pairAsManager]), "U123");
  assert.equal(ctx.role, "manager");
  assert.equal(ctx.isMgr, true);
  assert.equal(ctx.partnerName, "Direct Report");
});

test("two matching pairs, no saved selection, uses the first (oldest) and lists both", async () => {
  const ctx = await resolveSlackUser(fakeAdmin([pairAsEmployee, pairAsManager]), "U123");
  assert.equal(ctx.pairId, "pair-1");
  assert.equal(ctx.role, "employee");
  assert.deepEqual(ctx.pairs, [
    { id: "pair-1", partnerName: "Big Boss" },
    { id: "pair-2", partnerName: "Direct Report" },
  ]);
});

test("two matching pairs, with a saved selection, uses the saved pair", async () => {
  const ctx = await resolveSlackUser(fakeAdmin([pairAsEmployee, pairAsManager], { pair_id: "pair-2" }), "U123");
  assert.equal(ctx.pairId, "pair-2");
  assert.equal(ctx.role, "manager");
  assert.equal(ctx.partnerName, "Direct Report");
});

test("two matching pairs, saved selection points at an unrelated pair, falls back to the oldest", async () => {
  const ctx = await resolveSlackUser(fakeAdmin([pairAsEmployee, pairAsManager], { pair_id: "some-other-pair" }), "U123");
  assert.equal(ctx.pairId, "pair-1");
});

test("no email on the Slack profile returns null", async () => {
  slackProfile = {};
  try {
    assert.equal(await resolveSlackUser(fakeAdmin([pairAsEmployee]), "U123"), null);
  } finally {
    slackProfile = { email: EMAIL };
  }
});
