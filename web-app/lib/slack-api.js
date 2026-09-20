// Thin wrapper around Slack's Web API. Server-only.
//
// Token resolution (SLACK_TODO.md item 0h-2, extended for real multi-tenant
// use -- migration 0030): each company has its own row in
// slack_installations, so the token to use depends on WHICH company's
// request this is, not just "whichever installed most recently." Every
// caller MUST pass opts.companyId (resolved from a Slack payload's team_id
// via lib/slack-user.js, or from a pairs row's company_id) -- there is no
// shared-token fallback. A multi-tenant product can't let one company's
// request silently borrow another company's (or the original deploy's)
// bot token when the lookup comes up empty; it has to fail loudly instead
// (2026-09-17, closing the "Remove Hard Coded Information" item on Slack's
// Public Distribution checklist -- the old SLACK_BOT_TOKEN env-var fallback
// was exactly the hard-coded credential that checklist item means).
//
// Cached per companyId for TOKEN_CACHE_MS, so this doesn't add a DB round
// trip to every single Slack call.

import { createClient } from "@supabase/supabase-js";

const SLACK_API = "https://slack.com/api";
const TOKEN_CACHE_MS = 60_000;
const tokenCache = new Map(); // companyId -> { token, expiresAt }

// Exported 2026-09-19 for add_document (interactivity route): downloading a
// file_input upload's content means fetching its url_private_download
// directly with the bot token as a Bearer header, which slackApi()'s own
// JSON-API wrapper doesn't cover -- everything else still goes through
// slackApi() as before.
export async function resolveBotToken(companyId) {
  if (!companyId) {
    throw new Error("[SLACK_INTEGRATION_DOWN] slackApi called with no companyId -- every call site must know which company's token to use, there is no shared fallback");
  }
  const cached = tokenCache.get(companyId);
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await admin.from("slack_installations").select("access_token").eq("company_id", companyId).order("installed_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`[SLACK_INTEGRATION_DOWN] slack bot token lookup failed for company ${companyId}: ${error.message}`);
  if (!data?.access_token) throw new Error(`[SLACK_INTEGRATION_DOWN] no Slack installation found for company ${companyId}`);

  tokenCache.set(companyId, { token: data.access_token, expiresAt: Date.now() + TOKEN_CACHE_MS });
  return data.access_token;
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
export async function slackApi(method, body, opts = {}) {
  const { companyId, _isRetry = false } = opts;
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(body || {})) {
    if (value === undefined) continue;
    form.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  const token = await resolveBotToken(companyId);
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
      return slackApi(method, body, { companyId, _isRetry: true });
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
    // so a dead/revoked company token would otherwise fail invisibly:
    // every website feature keeps working, and only Slack goes silently
    // dark. This marker is the one thing that makes that greppable in logs.
    throw new Error(`[SLACK_INTEGRATION_DOWN] Slack ${method} failed: ${json.error}${detail}`);
  }
  return json;
}
