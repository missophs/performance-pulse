// Finishes the OAuth install started by app/api/slack/install/route.js.
// Public (Slack redirects the browser here directly, with no session
// cookie of ours involved beyond the state check) -- the state-cookie
// comparison is what stops a forged callback from writing an attacker's
// own Slack token into slack_installations, not an auth check on this
// route itself.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { exchangeCodeForToken } from "@/lib/slack-oauth";
import { saveSlackInstallation } from "@/lib/data";

const APP_URL = "https://performance-pulse-lyart.vercel.app";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const deniedOrError = searchParams.get("error");
  const cookieState = request.cookies.get("slack_oauth_state")?.value;

  const fail = (reason) => {
    const res = NextResponse.redirect(`${APP_URL}/slack?slack_install_error=${reason}`);
    res.cookies.delete("slack_oauth_state");
    return res;
  };

  if (deniedOrError) return fail("denied");
  if (!code || !state || !cookieState || state !== cookieState) return fail("state_mismatch");

  try {
    const redirectUri = `${APP_URL}/api/slack/oauth/callback`;
    const install = await exchangeCodeForToken(code, redirectUri);
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    await saveSlackInstallation(admin, {
      teamId: install.teamId,
      teamName: install.teamName,
      accessToken: install.accessToken,
      botUserId: install.botUserId,
      installedBySlackUserId: null,
    });
  } catch (e) {
    console.error("slack oauth callback:", e);
    return fail("exchange_failed");
  }

  const res = NextResponse.redirect(`${APP_URL}/slack?slack_installed=1`);
  res.cookies.delete("slack_oauth_state");
  return res;
}
