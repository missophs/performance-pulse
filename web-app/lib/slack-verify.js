// Verifies a request actually came from Slack, per Slack's signing-secret
// scheme: https://api.slack.com/authentication/verifying-requests-from-slack
// Needs the RAW request body (before any JSON/form parsing) and
// SLACK_SIGNING_SECRET, both server-only.

import crypto from "crypto";

const MAX_CLOCK_SKEW_SECONDS = 60 * 5;

export function verifySlackSignature(rawBody, headers) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return false;

  const timestamp = headers.get("x-slack-request-timestamp");
  const signature = headers.get("x-slack-signature");
  if (!timestamp || !signature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_CLOCK_SKEW_SECONDS) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac("sha256", secret).update(base).digest("hex");
  const expected = `v0=${hmac}`;

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
