import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMyPairs } from "@/lib/data";
import OnboardingForm from "@/components/OnboardingForm";

// Reuses the same OnboardingForm as first-time setup, minus the name field
// (already set) — see SLACK_TODO.md item 2, "add another pairing" flow.
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
            <small>Set up a 1:1 with someone else</small>
          </div>
        </div>
        <OnboardingForm showName={false} />
      </div>
    </div>
  );
}
