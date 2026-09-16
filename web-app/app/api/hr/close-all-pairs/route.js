// "Remove the roster" -- HR's one-click way to close every active pairing
// at once, so a fresh roster upload starts clean instead of layering on top
// of old test/demo data (Melissa's explicit ask, 2026-09-06, same shape as
// the per-pairing Close button on the org chart -- see that route's header
// comment for why a passcode-era feature like this now runs through
// requireHr() instead). Nothing is deleted: every closed row is still
// reopenable individually from History, same as any other close.
import { createClient } from "@supabase/supabase-js";
import { closeAllPairs } from "@/lib/data";
import { requireHr } from "@/lib/hr-auth";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function POST() {
  const hr = await requireHr();
  if (!hr.ok) return Response.json({ error: hr.error }, { status: hr.status });

  const closed = await closeAllPairs(admin(), "Removed roster (HR bulk close)", hr.companyId);
  return Response.json({ ok: true, closed });
}
