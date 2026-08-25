// resolveSlackUser decides which pair — and therefore whose private 1:1 data —
// a Slack request is allowed to see. These tests pin the "how many pairs did we
// find" branch in particular: one pair is the normal case, two pairs is a real
// org shape (a middle manager) that used to throw, and the two-pair answer must
// never carry pair data a caller could mistake for "the" pair.
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

// Stands in for the Supabase query builder: the chained calls return the
// builder, and awaiting the final .limit() resolves to whatever rows we plant.
function fakeAdmin(rows) {
  const builder = {
    from: () => builder,
    select: () => builder,
    or: () => builder,
    limit: () => Promise.resolve({ data: rows, error: null }),
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
  assert.equal(ctx.ambiguous, undefined);
  assert.equal(ctx.pairId, "pair-1");
  assert.equal(ctx.role, "employee");
  assert.equal(ctx.myName, "Middle Manager");
  assert.equal(ctx.partnerName, "Big Boss");
});

test("one matching pair, as the manager, still resolves", async () => {
  const ctx = await resolveSlackUser(fakeAdmin([pairAsManager]), "U123");
  assert.equal(ctx.role, "manager");
  assert.equal(ctx.isMgr, true);
  assert.equal(ctx.partnerName, "Direct Report");
});

test("two matching pairs return ambiguous instead of throwing", async () => {
  const ctx = await resolveSlackUser(fakeAdmin([pairAsEmployee, pairAsManager]), "U123");
  assert.deepEqual(ctx, { ambiguous: true });
  // The whole point of the sentinel: no pair data leaks out for a caller to
  // read past the guard and treat as "the" pair.
  assert.equal(ctx.pairId, undefined);
});

test("no email on the Slack profile returns null", async () => {
  slackProfile = {};
  try {
    assert.equal(await resolveSlackUser(fakeAdmin([pairAsEmployee]), "U123"), null);
  } finally {
    slackProfile = { email: EMAIL };
  }
});
