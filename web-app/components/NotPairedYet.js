"use client";

// Shown at /onboarding to anyone signed in with zero pairings -- their
// FIRST pairing. Nobody self-declares a role or manager to get their first
// one anymore; that only comes from HR's roster upload (or Slack's
// manager-only "add employee"). A second/later pairing is a separate,
// untouched flow (/onboarding/add's OnboardingForm) for someone who already
// has one. This screen exists so HR can also reach the roster importer
// without needing a pairing of their own, and so anyone else just sees a
// plain status message instead of a form (Melissa's call, 2026-09-05).
// HR access is the signed-in account's real identity (isHr, computed
// server-side via is_hr()) -- no PIN to unlock, replaced 2026-09-06.
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRosterUpload } from "@/lib/useRosterUpload";

export default function NotPairedYet({ isHr }) {
  const router = useRouter();
  // The upload can pair the CURRENT user (e.g. their own manager
  // relationship was on the sheet) -- this page's "not paired yet" vs.
  // dashboard decision is made once, server-side, at page load, so nothing
  // here would otherwise reflect that until a manual reload. router.refresh()
  // re-runs that server check now, so a newly-paired uploader lands on their
  // dashboard automatically instead of staring at a stale "not paired yet"
  // screen that looks like the upload failed when it didn't, 2026-09-05.
  const { rosterSummary, uploading, error: message, handleRosterUpload } = useRosterUpload({
    onSuccess: () => router.refresh(),
  });

  // Nobody stuck here has any other way off this page -- no sidebar, no
  // topbar, nothing (found live, 2026-09-06: signing in as the wrong test
  // account left no visible way to sign out and try another one). Same
  // sign-out pattern as AppShell.js's, since there's no shared ctx here to
  // read a supabase client from.
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        You haven&apos;t been paired yet. Check with HR — once you&apos;re on
        the roster, signing in will take you straight to your dashboard.
      </p>

      <button className="btn ghost sm" onClick={signOut}>Sign out</button>

      {isHr && (
        <label
          className="btn secondary"
          style={{ cursor: uploading ? "default" : "pointer", width: "100%", marginTop: 16, display: "block", textAlign: "center", opacity: uploading ? 0.6 : 1 }}
        >
          {uploading ? "Importing…" : "Import roster (HR)"}
          <input type="file" accept=".xlsx" disabled={uploading} style={{ display: "none" }} onChange={handleRosterUpload} />
        </label>
      )}

      {rosterSummary && (
        <div className="field-hint" style={{ marginTop: 12 }}>
          Added {rosterSummary.added}, corrected {rosterSummary.corrected || 0}, already there {rosterSummary.skipped}, of {rosterSummary.total}.
          {rosterSummary.failed?.length > 0 && (
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {rosterSummary.failed.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}
        </div>
      )}

      {rosterSummary?.unmatchedManagers?.length > 0 && (
        <div className="limits" style={{ marginTop: 12 }}>
          These manager names don&apos;t match anyone in the Employee column —
          double-check for a typo or extra character (often invisible at
          normal zoom): {rosterSummary.unmatchedManagers.join(", ")}
        </div>
      )}

      {rosterSummary?.nameCollisions?.length > 0 && (
        <div className="limits" style={{ marginTop: 12 }}>
          These names appear more than once with different emails —
          whichever email wins is unpredictable, so anyone referencing them
          as a manager may get paired to the wrong account: {rosterSummary.nameCollisions.join(", ")}
        </div>
      )}

      {rosterSummary?.reassignments?.length > 0 && (
        <div className="field-hint" style={{ marginTop: 12 }}>
          Moved to a new manager (their full history moved with them):
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {rosterSummary.reassignments.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {message && <div className="limits" style={{ marginTop: 12 }}>{message}</div>}
    </div>
  );
}
