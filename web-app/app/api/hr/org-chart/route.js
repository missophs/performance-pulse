// Read-only org-chart view for HR: who reports to whom, straight from the
// roster as uploaded (see app/api/hr/roster/route.js). Gated by the same
// shared HR passcode as every other admin.* action in this file family --
// the passcode check must run before any other admin.* call, no exceptions
// (see app/api/handbook/route.js's header comment for why).
import { createClient } from "@supabase/supabase-js";
import { getHrPasscode, getOrgChart } from "@/lib/data";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function checkPasscode(a, passcode) {
  const real = await getHrPasscode(a);
  return Boolean(real) && passcode === real;
}

export async function POST(req) {
  const a = admin();
  const { passcode } = await req.json();
  if (!(await checkPasscode(a, passcode))) {
    return Response.json({ error: "Wrong passcode." }, { status: 401 });
  }
  const orgChart = await getOrgChart(a);
  return Response.json({ orgChart });
}
