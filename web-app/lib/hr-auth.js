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

  // Multi-tenant scoping (migration 0031): callers use this to confine
  // roster/org-chart/close-pair actions to the HR admin's own company,
  // instead of operating across every company's data.
  const { data: profile, error: profileErr } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
  if (profileErr) throw profileErr;

  return { ok: true, companyId: profile.company_id };
}
