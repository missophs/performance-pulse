// Read-only org-chart view for HR: who reports to whom, straight from the
// roster as uploaded (see app/api/hr/roster/route.js). Gated by requireHr()
// -- the signed-in account's real identity -- same as every other admin.*
// route in this family (passcode replaced 2026-09-06; see
// app/api/handbook/route.js's header comment for why).
import { createClient } from "@supabase/supabase-js";
import { getOrgChart } from "@/lib/data";
import { requireHr } from "@/lib/hr-auth";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function POST() {
  const hr = await requireHr();
  if (!hr.ok) return Response.json({ error: hr.error }, { status: hr.status });

  const orgChart = await getOrgChart(admin());
  return Response.json({ orgChart });
}
