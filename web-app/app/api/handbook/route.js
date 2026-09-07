// Handbook admin actions (upload/remove), gated by requireHr() -- the
// signed-in account's real identity, via the same is_hr() Postgres function
// handbook_links' RLS already uses. Replaced the old shared-PIN gate
// (2026-09-06): a PIN only proves someone knows a string, not who they are.
// This route uses the service-role client for the actual writes (uploads
// bypass storage RLS), so requireHr() must run before any admin.* call, no
// exceptions, same rule as every Slack handler in CLAUDE.md.
import { createClient } from "@supabase/supabase-js";
import { uploadHandbookFile, deleteHandbookLink, listHandbookLinks } from "@/lib/data";
import { requireHr } from "@/lib/hr-auth";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function POST(req) {
  const hr = await requireHr();
  if (!hr.ok) return Response.json({ error: hr.error }, { status: hr.status });

  const a = admin();
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!file) return Response.json({ error: "No file." }, { status: 400 });
    try {
      const link = await uploadHandbookFile(a, file);
      return Response.json({ link });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 400 });
    }
  }

  const { action, linkId } = await req.json();

  if (action === "remove") {
    const links = await listHandbookLinks(a);
    const link = links.find((l) => l.id === linkId);
    if (!link) return Response.json({ error: "Not found." }, { status: 404 });
    await deleteHandbookLink(a, link);
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
}
