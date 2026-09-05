"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const linkBtnStyle = { background: "none", border: "none", cursor: "pointer", font: "inherit", fontSize: 13, color: "var(--muted)", textDecoration: "underline", padding: 0 };

export default function LoginPage() {
  const [mode, setMode] = useState("signin"); // signin | signup | magiclink | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // This page is statically prerendered, so the server never sees the query
  // string — reading it during render (a lazy useState initializer) would
  // desync from the static HTML and fail hydration. Reading it post-mount
  // instead avoids that, at the cost of the error flashing in a tick late.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "auth") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("That sign-in link didn't work — request a new one below.");
    }
  }, []);

  function switchMode(next) {
    setMode(next);
    setError("");
    setSent(false);
  }

  async function signInWithGoogle() {
    setError("");
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Without this, Google silently reuses whichever Google account is
        // already active in the browser instead of showing the account
        // picker -- there's no way to switch accounts from this button
        // otherwise, even after signing out of the app itself, 2026-09-05.
        queryParams: { prompt: "select_account" },
      },
    });
  }

  async function signIn(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setError(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
      return;
    }
    window.location.href = "/dashboard";
  }

  async function signUp(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const supabase = createClient();
    const trimmedEmail = email.trim();
    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    if (data.session) {
      window.location.href = "/dashboard";
      return;
    }
    // signUp() doesn't always hand back a session even when the account can
    // sign in immediately (depends on the Supabase project's email-confirm
    // setting) — try signing straight in with the same credentials rather
    // than showing a "check your email" message nobody actually needs.
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
    setBusy(false);
    if (!signInError) {
      window.location.href = "/dashboard";
      return;
    }
    setSent(true);
  }

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

  async function sendReset(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
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

        {!sent && (
          <>
            <button type="button" className="btn ghost" style={{ width: "100%", marginTop: 16 }} onClick={signInWithGoogle}>
              Sign in with Google
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0", color: "var(--faint)", fontSize: 12 }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              or
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
          </>
        )}

        {sent ? (
          <div className="privacy-banner" style={{ marginTop: 16 }}>
            <strong>Check your email.</strong>
            {mode === "forgot"
              ? ` We sent a password reset link to ${email}.`
              : ` We sent a link to ${email}. Open it on this device to continue.`}
          </div>
        ) : mode === "signin" ? (
          <form onSubmit={signIn} style={{ marginTop: 16 }}>
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              style={{ marginBottom: 14 }}
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            {error && <div className="limits" style={{ marginTop: 10 }}>{error}</div>}
            <button className="btn" type="submit" disabled={busy} style={{ marginTop: 14, width: "100%" }}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between" }}>
              <button type="button" style={linkBtnStyle} onClick={() => switchMode("signup")}>
                Create an account
              </button>
              <button type="button" style={linkBtnStyle} onClick={() => switchMode("forgot")}>
                Forgot password?
              </button>
            </div>
            <div style={{ marginTop: 10, textAlign: "center" }}>
              <button type="button" style={linkBtnStyle} onClick={() => switchMode("magiclink")}>
                Having trouble? Use a link instead
              </button>
            </div>
          </form>
        ) : mode === "signup" ? (
          <form onSubmit={signUp} style={{ marginTop: 16 }}>
            <label htmlFor="signupEmail">Work email</label>
            <input
              id="signupEmail"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              style={{ marginBottom: 14 }}
            />
            <label htmlFor="signupPassword">Password</label>
            <input
              id="signupPassword"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
            {error && <div className="limits" style={{ marginTop: 10 }}>{error}</div>}
            <button className="btn" type="submit" disabled={busy} style={{ marginTop: 14, width: "100%" }}>
              {busy ? "Creating account…" : "Create account"}
            </button>
            <div style={{ marginTop: 14, textAlign: "center" }}>
              <button type="button" style={linkBtnStyle} onClick={() => switchMode("signin")}>
                Already have an account? Sign in
              </button>
            </div>
          </form>
        ) : mode === "forgot" ? (
          <form onSubmit={sendReset} style={{ marginTop: 16 }}>
            <label htmlFor="forgotEmail">Work email</label>
            <input
              id="forgotEmail"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
            {error && <div className="limits" style={{ marginTop: 10 }}>{error}</div>}
            <button className="btn" type="submit" disabled={busy} style={{ marginTop: 14, width: "100%" }}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
            <div style={{ marginTop: 14, textAlign: "center" }}>
              <button type="button" style={linkBtnStyle} onClick={() => switchMode("signin")}>
                Back to sign in
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={sendLink} style={{ marginTop: 16 }}>
            <label htmlFor="magicEmail">Work email</label>
            <input
              id="magicEmail"
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
            <div style={{ marginTop: 14, textAlign: "center" }}>
              <button type="button" style={linkBtnStyle} onClick={() => switchMode("signin")}>
                Back to sign in
              </button>
            </div>
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
