// Lets HR force-close ANY pairing, including one whose manager can never
// sign in to use the website's own manager-only "End this pairing" button
// (a placeholder/test email, or an old +alias account that had no Google
// account linked before password sign-in was removed, 2026-09-06). Gated by
// requireHr() -- the signed-in account's real identity -- same as every
// other admin.* route in this family. Reuses closePair() as-is: it's
// already just an update through whichever client it's given, so passing
// the service-role client here bypasses RLS the same way every other HR
// admin action in this app does, rather than needing a second copy of the
// same one-line update.
import { createClient } from "@supabase/supabase-js";
import { closePair } from "@/lib/data";
import { requireHr } from "@/lib/hr-auth";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function POST(req) {
  const hr = await requireHr();
  if (!hr.ok) return Response.json({ error: hr.error }, { status: hr.status });

  const { pairId } = await req.json();
  if (!pairId) return Response.json({ error: "No pairId." }, { status: 400 });

  // pairId is client-supplied with no ownership check otherwise, and this
  // runs on the service-role client (bypasses RLS) -- same governance rule
  // as every Slack handler (see CLAUDE.md): verify it belongs to this HR
  // admin's own company before acting on it, so one company's org chart
  // can't force-close another company's pairing by guessing/replaying an id.
  const a = admin();
  const { data: pair } = await a.from("pairs").select("company_id").eq("id", pairId).maybeSingle();
  if (!pair || pair.company_id !== hr.companyId) return Response.json({ error: "No pairId." }, { status: 400 });

  await closePair(a, pairId, "Closed by HR from the org chart");
  return Response.json({ ok: true });
}
