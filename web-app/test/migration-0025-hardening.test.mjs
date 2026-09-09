// Regression guard for the 2026-09-08 incident: migration 0024 created
// supabase_functions.hooks with no RLS statement, so running it through
// the Supabase SQL Editor auto-enabled RLS with zero policies -- silently
// blocking every website-user-originated Slack notification while
// Slack-bot writes (service_role, bypasses RLS) kept working. This bug
// lives entirely in live Postgres config, not app code, so it can't be
// reproduced against the mocked Supabase clients the rest of this suite
// uses -- this instead pins the fix's text so a future edit to 0025 can't
// silently drop either safeguard.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const migrationPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../supabase/migrations/0025_harden_supabase_functions_hooks.sql");
const sql = readFileSync(migrationPath, "utf8");

test("0025 disables RLS on supabase_functions.hooks (the actual fix)", () => {
  assert.match(sql, /alter table supabase_functions\.hooks disable row level security/);
});

test("0025 marks http_request() SECURITY DEFINER (defense-in-depth: survives RLS being re-enabled later)", () => {
  const fnStart = sql.indexOf("create or replace function supabase_functions.http_request()");
  assert.notEqual(fnStart, -1, "http_request() definition not found");
  const fnBody = sql.slice(fnStart, sql.indexOf("$function$;", fnStart));
  assert.match(fnBody, /security definer/);
});

test("0025 does not re-enable RLS on hooks anywhere", () => {
  assert.doesNotMatch(sql, /enable row level security/);
});
