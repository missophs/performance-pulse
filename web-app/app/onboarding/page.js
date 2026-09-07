import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMyPairs } from "@/lib/data";
import NotPairedYet from "@/components/NotPairedYet";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const pairs = await listMyPairs(supabase, user.id);
  if (pairs.length) redirect("/dashboard");

  const { data: isHr } = await supabase.rpc("is_hr");

  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <div className="auth-logo">
          <div className="logo">PP</div>
          <div>
            <strong>Performance Pulse</strong>
            <small>Not paired yet</small>
          </div>
        </div>
        <NotPairedYet isHr={Boolean(isHr)} />
      </div>
    </div>
  );
}
