"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createPair } from "@/lib/data";

export default function OnboardingForm() {
  const router = useRouter();
  const [role, setRole] = useState("employee");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      await createPair(supabase, role, partnerEmail.trim());
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err.message || "Couldn't set that up. Try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 16 }}>
      <label>You are the</label>
      <div className="role-pick">
        <label>
          <input type="radio" name="role" value="employee" checked={role === "employee"} onChange={() => setRole("employee")} />
          Employee
        </label>
        <label>
          <input type="radio" name="role" value="manager" checked={role === "manager"} onChange={() => setRole("manager")} />
          Manager
        </label>
      </div>

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
        If they haven't signed in yet, this links automatically the first time they do.
      </div>

      {error && <div className="limits" style={{ marginBottom: 12 }}>{error}</div>}

      <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>
        {busy ? "Setting up…" : "Continue"}
      </button>
    </form>
  );
}
