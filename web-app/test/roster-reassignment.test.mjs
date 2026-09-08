// createPairFromRoster decides what a re-uploaded roster row does to an
// employee's existing pairing: leave it alone (exact match), correct a
// stale placeholder email, reassign them to a genuinely new manager
// (carrying their pair_id -- and so their whole history -- with them), or
// insert a brand-new pairing. These tests pin that branch, especially the
// reassignment case added 2026-09-06 and its dotted-line safety guard.
import { test } from "node:test";
import assert from "node:assert/strict";

const { createPairFromRoster } = await import("@/lib/data");

// Stands in for the service-role Supabase client. Matches the exact call
// shape createPairFromRoster uses: pairs.select().eq().is() for the
// existing-rows lookup, profiles.select().eq().maybeSingle() for a
// manager/employee id lookup, pairs.update().eq() to reassign/self-heal,
// and pairs.insert() for a brand-new row.
function fakeAdmin({ existingRows = [], profilesByEmail = {}, insertError = null, updateError = null } = {}) {
  const updates = [];
  const inserts = [];
  function from(table) {
    if (table === "pairs") {
      return {
        select: () => ({ eq: () => ({ is: () => Promise.resolve({ data: existingRows, error: null }) }) }),
        update: (patch) => ({
          eq: (_col, id) => {
            updates.push({ id, patch });
            return Promise.resolve({ error: updateError });
          },
        }),
        insert: (row) => {
          inserts.push(row);
          return Promise.resolve({ error: insertError });
        },
      };
    }
    if (table === "profiles") {
      return {
        select: () => ({ eq: (_col, email) => ({ maybeSingle: () => Promise.resolve({ data: profilesByEmail[email] || null, error: null }) }) }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  }
  return { admin: { from }, updates, inserts };
}

test("exact duplicate is skipped, no write happens", async () => {
  const { admin, updates, inserts } = fakeAdmin({
    existingRows: [{ id: "p1", manager_email: "ann@example.com" }],
  });
  const result = await createPairFromRoster(admin, "monte@example.com", "ann@example.com", "ann@placeholder.test", "Monte Montoya");
  assert.deepEqual(result, { skipped: true });
  assert.equal(updates.length, 0);
  assert.equal(inserts.length, 0);
});

test("stale placeholder self-heals in place", async () => {
  const { admin, updates } = fakeAdmin({
    existingRows: [{ id: "p1", manager_email: "ann.steiner@placeholder.test" }],
  });
  const result = await createPairFromRoster(admin, "monte@example.com", "ann@realcompany.com", "ann.steiner@placeholder.test", "Monte Montoya");
  assert.deepEqual(result, { skipped: false, updated: true });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, "p1");
  assert.equal(updates[0].patch.manager_email, "ann@realcompany.com");
});

test("employee moved to a genuinely different manager: reassigned in place, not inserted", async () => {
  const { admin, updates, inserts } = fakeAdmin({
    existingRows: [{ id: "p1", manager_email: "old.manager@example.com" }],
    profilesByEmail: { "ann@example.com": { id: "ann-id" } },
  });
  const result = await createPairFromRoster(admin, "monte@example.com", "ann@example.com", "ann@placeholder.test", "Monte Montoya");
  assert.deepEqual(result, { reassigned: true, fromManagerEmail: "old.manager@example.com" });
  assert.equal(updates.length, 1, "should update the existing row, not insert a new one");
  assert.equal(updates[0].id, "p1");
  assert.equal(updates[0].patch.manager_email, "ann@example.com");
  assert.equal(updates[0].patch.manager_id, "ann-id");
  assert.equal(inserts.length, 0);
});

test("won't downgrade a real, already-linked manager to a freshly-guessed placeholder", async () => {
  const { admin, updates, inserts } = fakeAdmin({
    existingRows: [{ id: "p1", manager_email: "melissaw212@gmail.com" }],
  });
  // Simulates a re-upload whose Email column is blank for "Melissa Weiss" --
  // emailFor() in route.js would fall back to a placeholder even though this
  // employee's existing row already has her real email.
  await assert.rejects(
    () => createPairFromRoster(admin, "monte@example.com", "melissa.weiss@placeholder.test", "melissa.weiss@placeholder.test", "Monte Montoya"),
    /won't replace melissaw212@gmail\.com/
  );
  assert.equal(updates.length, 0, "must not overwrite the real manager email");
  assert.equal(inserts.length, 0);
});

test("reassignment to a genuinely different real manager still works even though the old one was real too", async () => {
  const { admin, updates } = fakeAdmin({
    existingRows: [{ id: "p1", manager_email: "old.real.manager@example.com" }],
    profilesByEmail: { "new.real.manager@example.com": { id: "new-mgr-id" } },
  });
  const result = await createPairFromRoster(admin, "monte@example.com", "new.real.manager@example.com", "new.real.manager@placeholder.test", "Monte Montoya");
  assert.deepEqual(result, { reassigned: true, fromManagerEmail: "old.real.manager@example.com" });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].patch.manager_email, "new.real.manager@example.com");
});

test("reassignment collision (23505) surfaces a readable message, not a raw Postgres error", async () => {
  const { admin } = fakeAdmin({
    existingRows: [{ id: "p1", manager_email: "old.real.manager@example.com" }],
    profilesByEmail: { "new.real.manager@example.com": { id: "new-mgr-id" } },
    updateError: { code: "23505", message: "duplicate key value violates unique constraint" },
  });
  await assert.rejects(
    () => createPairFromRoster(admin, "monte@example.com", "new.real.manager@example.com", "new.real.manager@placeholder.test", "Monte Montoya"),
    /already has an active pairing with new\.real\.manager@example\.com/
  );
});

test("dotted-line (two existing managers): does not guess, falls through to insert", async () => {
  const { admin, updates, inserts } = fakeAdmin({
    existingRows: [
      { id: "p1", manager_email: "boss1@example.com" },
      { id: "p2", manager_email: "boss2@example.com" },
    ],
  });
  const result = await createPairFromRoster(admin, "monte@example.com", "boss3@example.com", "boss3@placeholder.test", "Monte Montoya");
  assert.equal(updates.length, 0, "must not silently reassign one of two existing managers");
  assert.equal(inserts.length, 1);
  assert.equal(result.reassigned, undefined);
});

test("no existing pairing: plain insert", async () => {
  const { admin, inserts } = fakeAdmin({ existingRows: [] });
  const result = await createPairFromRoster(admin, "new.hire@example.com", "ann@example.com", "ann@placeholder.test", "New Hire");
  assert.deepEqual(result, { skipped: false });
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].employee_email, "new.hire@example.com");
});
