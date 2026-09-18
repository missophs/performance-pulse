// Starts the real Slack OAuth install (SLACK_TODO.md item 0h-2). Public --
// this used to gate on requireHr(), but that blocked the entire "sell to
// any company" story: a brand-new company's first tester has no website
// account to be HR on yet, so requireHr() locked them out before they ever
// reached Slack's own consent screen (2026-09-18). Slack's own OAuth
// screen is the real authorization boundary here -- only someone with
// permission to install apps in a given workspace can complete it for that
// workspace, exactly like any other public "Add to Slack" button. The
// callback (saveSlackInstallation) already self-serves a new `companies`
// row for a never-seen team_id regardless of who started the flow.
import { NextResponse } from "next/server";
import { buildInstallUrl } from "@/lib/slack-oauth";

const APP_URL = "https://performance-pulse-lyart.vercel.app";

export async function GET() {
  const state = crypto.randomUUID();
  const redirectUri = `${APP_URL}/api/slack/oauth/callback`;
  const res = NextResponse.redirect(buildInstallUrl(state, redirectUri));
  // Short-lived: this cookie only needs to survive the round trip to Slack's
  // consent screen and back, not a real session.
  res.cookies.set("slack_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
