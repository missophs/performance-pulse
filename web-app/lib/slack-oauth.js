// Real Slack OAuth install flow (SLACK_TODO.md item 0h-2), replacing the
// "paste a bot token into an env var and redeploy" dance documented
// elsewhere in that file. See app/api/slack/install/route.js (starts it)
// and app/api/slack/oauth/callback/route.js (finishes it).
//
// BOT_SCOPES is the exact, verified set this app's code actually calls
// (checked against Slack's own docs, not guessed): chat.postMessage needs
// chat:write, conversations.open (DMs only, never channels/groups) needs
// im:write, users.info needs users:read, users.lookupByEmail needs
// users:read.email. Every views.* call (publish/open/push/update) needs no
// scope at all. If a future change adds a new slackApi(...) call, check
// https://docs.slack.dev/reference/methods/<method> for its scope and add
// it here -- an install with a missing scope fails silently at call time,
// not at install time.
const BOT_SCOPES = ["chat:write", "im:write", "users:read", "users:read.email"];

export function buildInstallUrl(state, redirectUri) {
  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID,
    scope: BOT_SCOPES.join(","),
    redirect_uri: redirectUri,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params}`;
}

// oauth.v2.access is a bare POST, not routed through lib/slack-api.js's
// slackApi() -- that helper signs every request with the ALREADY-installed
// bot token (from slack-installations or the env var fallback), which is
// exactly backwards here: this call is what PRODUCES that token in the
// first place, so it authenticates with the app's client_id/secret instead.
export async function exchangeCodeForToken(code, redirectUri) {
  const form = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID,
    client_secret: process.env.SLACK_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
  });
  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: form,
    signal: AbortSignal.timeout(10000),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`[SLACK_INTEGRATION_DOWN] oauth.v2.access failed: ${json.error}`);
  return {
    teamId: json.team?.id,
    teamName: json.team?.name,
    accessToken: json.access_token,
    botUserId: json.bot_user_id,
  };
}
