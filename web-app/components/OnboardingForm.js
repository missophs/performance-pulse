"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createPair, updatePair, updateProfile } from "@/lib/data";
import { setCurrentPair } from "@/lib/actions";

// `showName` is false for the "add another pairing" flow (/onboarding/add) —
// the account already has a display name at that point, so only role +
// partner email are needed.
export default function OnboardingForm({ showName = true }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("employee");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSummary, setBulkSummary] = useState(null);

  async function submit(e) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (showName && !trimmedName) {
      setError("Enter your name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (showName) await updateProfile(supabase, user.id, { full_name: trimmedName });
      const pair = await createPair(supabase, role, partnerEmail.trim());
      await setCurrentPair(pair.id);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err.message || "Couldn't set that up. Try again.");
      setBusy(false);
    }
  }

  // Bulk-adds employees from a CSV (Name,Email per line, header row optional
  // -- any row whose second column has no "@" is skipped). Reuses the same
  // create_pair RPC as the single-add flow, once per row, then labels the
  // pending pair with the uploaded name via employee_label so it reads
  // right in the pair-switcher even before that employee ever signs in
  // (Melissa's call, 2026-09-04 -- roster upload instead of typing one at a time).
  async function submitBulk(e) {
    e.preventDefault();
    const file = e.target.elements.roster.files[0];
    if (!file) {
      setError("Choose a CSV file.");
      return;
    }
    const trimmedName = name.trim();
    if (showName && !trimmedName) {
      setError("Enter your name.");
      return;
    }
    setBusy(true);
    setError("");
    setBulkSummary(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (showName) await updateProfile(supabase, user.id, { full_name: trimmedName });

      const text = await file.text();
      const rows = text
        .split("\n")
        .map((line) => line.split(",").map((c) => c.trim().replace(/^"|"$/g, "")))
        .filter(([, email]) => email && email.includes("@"));

      let firstPairId = null;
      const failed = [];
      for (const [rowName, email] of rows) {
        try {
          const pair = await createPair(supabase, "manager", email);
          if (rowName) await updatePair(supabase, pair.id, { employee_label: rowName });
          firstPairId = firstPairId || pair.id;
        } catch (err) {
          failed.push(`${rowName || email}: ${err.message || "failed"}`);
        }
      }

      setBulkSummary({ total: rows.length, added: rows.length - failed.length, failed });
      if (firstPairId) {
        await setCurrentPair(firstPairId);
        router.refresh();
      }
    } catch (err) {
      setError(err.message || "Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      {showName && (
        <>
          <label htmlFor="yourName">Your name</label>
          <input
            id="yourName"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What your 1:1 partner should see you as"
            style={{ marginBottom: 16 }}
          />
        </>
      )}

      <label>You are the</label>
      <div className="role-pick">
        <label>
          <input type="radio" name="role" value="employee" checked={role === "employee"} onChange={() => { setRole("employee"); setBulkMode(false); }} />
          Employee
        </label>
        <label>
          <input type="radio" name="role" value="manager" checked={role === "manager"} onChange={() => setRole("manager")} />
          Manager
        </label>
      </div>

      {role === "manager" && (
        <div className="role-pick" style={{ marginBottom: 16 }}>
          <label>
            <input type="radio" name="bulkMode" checked={!bulkMode} onChange={() => setBulkMode(false)} />
            Add one employee
          </label>
          <label>
            <input type="radio" name="bulkMode" checked={bulkMode} onChange={() => setBulkMode(true)} />
            Upload a list (CSV)
          </label>
        </div>
      )}

      {bulkMode && role === "manager" ? (
        <form onSubmit={submitBulk}>
          <label htmlFor="roster">Employee roster (CSV)</label>
          <input id="roster" name="roster" type="file" accept=".csv" required style={{ marginBottom: 4 }} />
          <div className="field-hint">
            Two columns, one employee per line: name, work email. A header row is fine — it&apos;s skipped automatically.
          </div>

          {bulkSummary && (
            <div className="field-hint" style={{ marginTop: 8 }}>
              Added {bulkSummary.added} of {bulkSummary.total}.
              {bulkSummary.failed.length > 0 && (
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {bulkSummary.failed.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              )}
            </div>
          )}

          {error && <div className="limits" style={{ marginBottom: 12 }}>{error}</div>}

          <button className="btn" type="submit" disabled={busy} style={{ width: "100%", marginTop: 12 }}>
            {busy ? "Uploading…" : "Upload roster"}
          </button>
          {bulkSummary?.added > 0 && (
            <button type="button" className="btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => router.push("/dashboard")}>
              Done — go to dashboard
            </button>
          )}
        </form>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor="partnerEmail">{role === "employee" ? "Your manager's" : "Your employee's"} work email</label>
          <input
            id="partnerEmail"
            type="email"
            required
            value={partnerEmail}
            onChange={(e) => setPartnerEmail(e.target.value)}
            placeholder="them@company.com"
          />
          <div className="field-hint">
            If they haven&apos;t signed in yet, this links automatically the first time they do.
          </div>

          {error && <div className="limits" style={{ marginBottom: 12 }}>{error}</div>}

          <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy ? "Setting up…" : "Continue"}
          </button>
        </form>
      )}
    </div>
  );
}
