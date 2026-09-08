"use client";

// Shared by NotPairedYet.js and app/(dashboard)/dashboard/page.js -- both
// had their own copy of this exact upload/state/error-handling logic
// (flagged repeatedly in SLACK_TODO.md as "not consolidated"). The two
// callers still render their own markup around it (different layouts,
// different error presentation -- dashboard toasts, NotPairedYet shows an
// inline message), so only the state + fetch logic moved here, not the UI.
import { useState } from "react";

export function useRosterUpload({ onSuccess, onError } = {}) {
  const [rosterSummary, setRosterSummary] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleRosterUpload(e) {
    const file = e.target.files?.[0];
    if (!file || uploading) return;
    setUploading(true);
    setRosterSummary(null);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/hr/roster", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || "Couldn't import that.";
        setError(msg);
        onError?.(msg);
      } else {
        setRosterSummary(data);
        onSuccess?.(data);
      }
    } catch {
      const msg = "Something went wrong on the server. Try again.";
      setError(msg);
      onError?.(msg);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return { rosterSummary, uploading, error, handleRosterUpload };
}
