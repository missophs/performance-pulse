// Thin wrapper around Slack's Web API. Server-only — needs SLACK_BOT_TOKEN.

const SLACK_API = "https://slack.com/api";

// Older methods (users.info, etc.) reject a raw JSON body with
// user_not_found/invalid_arguments; form-encoding works for every method,
// so long as object/array values are JSON-stringified first.
export async function slackApi(method, body) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(body || {})) {
    if (value === undefined) continue;
    form.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    body: form,
  });
  const json = await res.json();
  if (!json.ok) {
    const detail = json.response_metadata?.messages ? ` (${json.response_metadata.messages.join("; ")})` : "";
    // Every Slack route's error handling fails soft (console.error, ack
    // anyway) — see app/api/slack/{interactivity,notify,events}/route.js —
    // so a dead/revoked SLACK_BOT_TOKEN would otherwise fail invisibly:
    // every website feature keeps working, and only Slack goes silently
    // dark. This marker is the one thing that makes that greppable in logs.
    throw new Error(`[SLACK_INTEGRATION_DOWN] Slack ${method} failed: ${json.error}${detail}`);
  }
  return json;
}
