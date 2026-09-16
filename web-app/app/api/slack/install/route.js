// Starts the real Slack OAuth install (SLACK_TODO.md item 0h-2). HR-only --
// installing/reinstalling the bot affects the whole workspace, not one
// pairing, so this uses the same requireHr() gate as the other org-wide
// admin routes (app/api/hr/*), not the pair-scoped isMgr check.
import { NextResponse } from "next/server";
import { requireHr } from "@/lib/hr-auth";
import { buildInstallUrl } from "@/lib/slack-oauth";

const APP_URL = "https://performance-pulse-lyart.vercel.app";

export async function GET() {
  const hr = await requireHr();
  if (!hr.ok) return NextResponse.redirect(`${APP_URL}/slack?slack_install_error=${hr.status === 401 ? "signin" : "hr_only"}`);

  const state = crypto.randomUUID();
  const redirectUri = `${APP_URL}/api/slack/oauth/callback`;
  const res = NextResponse.redirect(buildInstallUrl(state, redirectUri));
  // Short-lived: this cookie only needs to survive the round trip to Slack's
  // consent screen and back, not a real session.
  res.cookies.set("slack_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
