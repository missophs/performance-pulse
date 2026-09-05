"use client";

// Shown at /onboarding to anyone signed in with zero pairings. Nobody
// self-declares a role or manager here anymore -- pairings only come from
// HR's roster upload (or Slack's manager-only "add employee"). This screen
// exists so HR can also reach the roster importer without needing a
// pairing of their own, and so anyone else just sees a plain status
// message instead of a form (Melissa's call, 2026-09-05).
import { useState } from "react";

export default function NotPairedYet() {
  const [hrPasscode, setHrPasscode] = useState(null);
  const [rosterSummary, setRosterSummary] = useState(null);
  const [message, setMessage] = useState("");

  async function unlockHr() {
    const code = window.prompt("HR PIN:");
    if (!code) return;
    const res = await fetch("/api/handbook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: code, action: "verify" }),
    });
    if (res.ok) {
      setHrPasscode(code);
      setMessage("");
    } else {
      setMessage("Wrong PIN. Try again, or ask whoever manages HR access.");
    }
  }

  async function handleRosterUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRosterSummary(null);
    setMessage("");
    const form = new FormData();
    form.append("passcode", hrPasscode);
    form.append("file", file);
    const res = await fetch("/api/hr/roster", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) setMessage(data.error || "Couldn't import that.");
    else setRosterSummary(data);
    e.target.value = "";
  }

  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        You haven&apos;t been paired yet. Check with HR — once you&apos;re on
        the roster, signing in will take you straight to your dashboard.
      </p>

      {hrPasscode ? (
        <label className="btn secondary" style={{ cursor: "pointer", width: "100%", marginTop: 16, display: "block", textAlign: "center" }}>
          Import roster (HR)
          <input type="file" accept=".xlsx" style={{ display: "none" }} onChange={handleRosterUpload} />
        </label>
      ) : (
        <button className="btn ghost" style={{ width: "100%", marginTop: 16 }} onClick={unlockHr}>
          🔒 HR unlock
        </button>
      )}

      {rosterSummary && (
        <div className="field-hint" style={{ marginTop: 12 }}>
          Added {rosterSummary.added}, already there {rosterSummary.skipped}, of {rosterSummary.total}.
          {rosterSummary.failed?.length > 0 && (
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {rosterSummary.failed.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}
        </div>
      )}

      {message && <div className="limits" style={{ marginTop: 12 }}>{message}</div>}
    </div>
  );
}
