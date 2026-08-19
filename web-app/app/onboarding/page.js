import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyPair } from "@/lib/data";
import OnboardingForm from "@/components/OnboardingForm";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const pair = await getMyPair(supabase, user.id);
  if (pair) redirect("/dashboard");

  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <div className="auth-logo">
          <div className="logo">PP</div>
          <div>
            <strong>Set up your 1:1</strong>
            <small>One-time — tell us who you work with</small>
          </div>
        </div>
        <OnboardingForm />
      </div>
    </div>
  );
}
