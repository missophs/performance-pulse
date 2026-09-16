// Thin wrapper around Slack's Web API. Server-only.
//
// Token resolution (SLACK_TODO.md item 0h-2): prefers the most recently
// OAuth-installed token (slack_installations, see lib/slack-oauth.js and
// app/api/slack/oauth/callback/route.js) over the old hardcoded
// SLACK_BOT_TOKEN env var, cached in memory for TOKEN_CACHE_MS so this
// doesn't add a DB round trip to every single Slack call. With no
// installation row yet -- today's state, for the workspace already in use
// -- this falls back to the env var exactly as before, so shipping this
// changes nothing until a real OAuth install happens.

import { createClient } from "@supabase/supabase-js";

const SLACK_API = "https://slack.com/api";
const TOKEN_CACHE_MS = 60_000;
let tokenCache = { token: null, expiresAt: 0 };

async function resolveBotToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  let token = process.env.SLACK_BOT_TOKEN;
  try {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await admin.from("slack_installations").select("access_token").order("installed_at", { ascending: false }).limit(1).maybeSingle();
    if (data?.access_token) token = data.access_token;
  } catch (e) {
    // slack_installations may not exist yet (migration 0029 not applied)
    // or the DB may be briefly unreachable -- either way, fall back to the
    // env var rather than breaking every Slack call over a lookup failure.
    console.error("slack bot token lookup, falling back to env var:", e.message);
  }
  tokenCache = { token, expiresAt: Date.now() + TOKEN_CACHE_MS };
  return token;
}
// Slack's interactivity endpoint calls this synchronously inside its 3s
// response budget (see app/api/slack/interactivity/route.js), so a retry
// wait is capped well under that instead of trusting Retry-After verbatim —
// one slow retry shouldn't turn into a second, worse failure (a dropped
// interaction) on top of the first.
const MAX_RETRY_WAIT_MS = 1500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Older methods (users.info, etc.) reject a raw JSON body with
// user_not_found/invalid_arguments; form-encoding works for every method,
// so long as object/array values are JSON-stringified first.
export async function slackApi(method, body, _isRetry = false) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(body || {})) {
    if (value === undefined) continue;
    form.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  const token = await resolveBotToken();
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    body: form,
    // Without this, a hung connection to slack.com never resolves or
    // rejects, so none of this function's own retry/error handling below
    // ever runs — the call just occupies the invocation until the platform
    // force-kills it. 10s comfortably covers a real round trip.
    signal: AbortSignal.timeout(10000),
  });

  // A 429 body isn't JSON-parseable the same way — Slack sends it as plain
  // text with a Retry-After header, not the usual {ok:false, error} shape.
  // Retried once, not looped: at today's single-tiny-workspace scale a
  // second 429 in a row means something's actually wrong, not just a burst.
  if (res.status === 429) {
    if (!_isRetry) {
      const retryAfterSec = parseInt(res.headers.get("Retry-After"), 10);
      const waitMs = Math.min((Number.isFinite(retryAfterSec) ? retryAfterSec : 1) * 1000, MAX_RETRY_WAIT_MS);
      await sleep(waitMs);
      return slackApi(method, body, true);
    }
    // Still rate-limited after the one retry — bail out with the same
    // greppable marker as any other dead-integration failure, instead of
    // falling through to res.json() below, which would throw a raw
    // SyntaxError on this non-JSON body.
    throw new Error(`[SLACK_INTEGRATION_DOWN] Slack ${method} failed: rate limited (429) after one retry`);
  }

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
