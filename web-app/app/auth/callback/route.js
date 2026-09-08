import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    // Migration 0020's handle_new_user trigger rejects signup for any email
    // not already on the roster, raising an error whose message starts with
    // "not_provisioned". Without this check, a legitimately-rejected new
    // employee saw the same generic "didn't work, try again" as any other
    // failure and had no reason to stop retrying or contact HR. Found in
    // review 2026-09-07 -- best-effort: if Supabase's auth server doesn't
    // propagate the trigger's message text, this just falls through to the
    // existing generic error below, same as before.
    if (error.message?.includes("not_provisioned")) {
      return NextResponse.redirect(`${origin}/login?error=not_provisioned`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
