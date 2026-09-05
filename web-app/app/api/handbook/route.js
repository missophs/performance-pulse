// Handbook admin actions (upload/remove/reset PIN), gated by a shared
// passcode instead of a real HR role -- there's no HR account type in this
// app (see SLACK_TODO.md's flagged-not-fixed item). The passcode itself
// lives in app_settings (migration 0018), not an env var, specifically so
// "reset PIN" below can actually change it without a redeploy. This route
// uses the service-role client throughout, so it is NOT subject to the
// is_hr()-based RLS that still gates direct browser-client writes -- the
// passcode check is the only real gate, so it must run before any other
// admin.* call, no exceptions, same rule as every Slack handler in
// CLAUDE.md.
import { createClient } from "@supabase/supabase-js";
import { uploadHandbookFile, deleteHandbookLink, listHandbookLinks, getHrPasscode, setHrPasscode } from "@/lib/data";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function checkPasscode(a, passcode) {
  const real = await getHrPasscode(a);
  return Boolean(real) && passcode === real;
}

export async function POST(req) {
  const a = admin();
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    if (!(await checkPasscode(a, form.get("passcode")))) {
      return Response.json({ error: "Wrong passcode." }, { status: 401 });
    }
    const file = form.get("file");
    if (!file) return Response.json({ error: "No file." }, { status: 400 });
    try {
      const link = await uploadHandbookFile(a, file);
      return Response.json({ link });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 400 });
    }
  }

  const { passcode, action, linkId, newPasscode } = await req.json();
  if (!(await checkPasscode(a, passcode))) {
    return Response.json({ error: "Wrong passcode." }, { status: 401 });
  }

  if (action === "verify") return Response.json({ ok: true });

  if (action === "remove") {
    const links = await listHandbookLinks(a);
    const link = links.find((l) => l.id === linkId);
    if (!link) return Response.json({ error: "Not found." }, { status: 404 });
    await deleteHandbookLink(a, link);
    return Response.json({ ok: true });
  }

  if (action === "reset_pin") {
    const next = (newPasscode || "").trim();
    if (!next) return Response.json({ error: "New PIN can't be blank." }, { status: 400 });
    await setHrPasscode(a, next);
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
}
