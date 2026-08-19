"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendLink(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
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

        {sent ? (
          <div className="privacy-banner" style={{ marginTop: 16 }}>
            <strong>Check your email.</strong>
            We sent a sign-in link to {email}. Open it on this device to continue.
          </div>
        ) : (
          <form onSubmit={sendLink} style={{ marginTop: 16 }}>
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
            {error && <div className="limits" style={{ marginTop: 10 }}>{error}</div>}
            <button className="btn" type="submit" disabled={busy} style={{ marginTop: 14, width: "100%" }}>
              {busy ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}

        <div className="privacy-note" style={{ marginTop: 20 }}>
          <strong>Private workspace.</strong>
          Only you and your manager can see what's inside. Nothing is automatically shared with HR.
        </div>
      </div>
    </div>
  );
}
