import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMyPairs } from "@/lib/data";

// No self-serve form here anymore -- same "no choices, HR owns the roster"
// call as the first-pairing screen (components/NotPairedYet.js), extended
// to a second/later pairing too: the Employee/Manager toggle, the
// employee-name autocomplete dropdown (which surfaced other people's
// names while typing), and an untested CSV-upload path were all still
// reachable from here even after the first-pairing form was removed
// (Melissa's call, 2026-09-05).
export default async function AddPairingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const pairs = await listMyPairs(supabase, user.id);
  if (!pairs.length) redirect("/onboarding");

  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <div className="auth-logo">
          <div className="logo">PP</div>
          <div>
            <strong>Add another pairing</strong>
            <small>Ask HR to update the roster</small>
          </div>
        </div>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 16 }}>
          Adding a report or a manager isn&apos;t done from here anymore.
          Ask HR to add the relationship to the roster — the next time
          they upload it, it will show up here on its own.
        </p>
      </div>
    </div>
  );
}
