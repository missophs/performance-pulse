// Single source of truth for "is this signed-in account HR." Delegates to
// the same is_hr() Postgres function handbook_links' RLS already uses
// (supabase/migrations/0013_global_handbook.sql) instead of re-deciding it
// a second time in JS -- the old shared-PIN gate on these routes was
// replaced with this because a PIN doesn't know WHO is asking, just whether
// they know a string (2026-09-06).
import { createClient } from "@/lib/supabase/server";

export async function requireHr() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Not signed in." };

  const { data: isHr, error } = await supabase.rpc("is_hr");
  if (error) throw error;
  if (!isHr) return { ok: false, status: 403, error: "HR access only." };

  return { ok: true };
}
