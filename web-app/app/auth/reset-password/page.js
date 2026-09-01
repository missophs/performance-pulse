"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <div className="auth-logo">
          <div className="logo">PP</div>
          <div>
            <strong>Set a new password</strong>
            <small>Performance Pulse</small>
          </div>
        </div>
        <form onSubmit={submit} style={{ marginTop: 16 }}>
          <label htmlFor="newPassword">New password</label>
          <input
            id="newPassword"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
          {error && <div className="limits" style={{ marginTop: 10 }}>{error}</div>}
          <button className="btn" type="submit" disabled={busy} style={{ marginTop: 14, width: "100%" }}>
            {busy ? "Saving…" : "Save new password"}
          </button>
        </form>
      </div>
    </div>
  );
}
