"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [error, setError] = useState("");

  // This page is statically prerendered, so the server never sees the query
  // string — reading it during render (a lazy useState initializer) would
  // desync from the static HTML and fail hydration. Reading it post-mount
  // instead avoids that, at the cost of the error flashing in a tick late.
  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get("error");
    if (err === "not_provisioned") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("That Google account isn't on the roster yet — ask HR to add you, then try again.");
    } else if (err === "auth") {
      setError("That sign-in didn't work — try again below.");
    }
  }, []);

  async function signInWithGoogle() {
    setError("");
    const supabase = createClient();
    // proxy.js already preserves ?from=slack onto this /login redirect for
    // an unauthenticated Slack-originated visit, but that's as far as it
    // got without this: redirectTo was a bare URL, so the round trip through
    // Google + Supabase's own callback dropped it, and /dashboard never knew
    // to show the return-to-Slack banner. auth/callback/route.js already
    // reads ?next= and redirects there -- just needed to actually send it.
    const from = new URLSearchParams(window.location.search).get("from");
    const next = from === "slack" ? "/dashboard?from=slack" : "/dashboard";
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        // Without this, Google silently reuses whichever Google account is
        // already active in the browser instead of showing the account
        // picker -- there's no way to switch accounts from this button
        // otherwise, even after signing out of the app itself, 2026-09-05.
        queryParams: { prompt: "select_account" },
      },
    });
  }

  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <div className="auth-logo">
          <div className="logo">PP</div>
          <div>
            <strong>Performance Pulse</strong>
            <small>Private manager-employee app</small>
          </div>
        </div>

        <button type="button" className="btn ghost" style={{ width: "100%", marginTop: 16 }} onClick={signInWithGoogle}>
          Sign in with Google
        </button>
        {error && <div className="limits" style={{ marginTop: 10 }}>{error}</div>}

        <div className="privacy-note" style={{ marginTop: 20 }}>
          <strong>Private workspace.</strong>
          Only you and your manager can see what&apos;s inside. Nothing is automatically shared with HR.
        </div>
      </div>
    </div>
  );
}
