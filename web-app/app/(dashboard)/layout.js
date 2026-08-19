import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyPair, getProfile, listTopics, listGoals, listActions, listDevelopmentPlans } from "@/lib/data";
import { isOpenTopic, isActiveGoal, isOpenAction, isActiveDev } from "@/lib/format";
import { ToastProvider } from "@/components/ui/ToastProvider";
import AppShell from "@/components/AppShell";

export default async function DashboardLayout({ children }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const pair = await getMyPair(supabase, user.id);
  if (!pair) redirect("/onboarding");

  const role = pair.employee_id === user.id ? "employee" : "manager";
  const partnerId = role === "employee" ? pair.manager_id : pair.employee_id;

  const [myProfile, partnerProfile, topics, goals, actions, devPlans] = await Promise.all([
    getProfile(supabase, user.id),
    partnerId ? getProfile(supabase, partnerId) : null,
    listTopics(supabase, pair.id),
    listGoals(supabase, pair.id),
    listActions(supabase, pair.id),
    listDevelopmentPlans(supabase, pair.id),
  ]);

  const counts = {
    openTopics: topics.filter(isOpenTopic).length,
    activeGoals: goals.filter(isActiveGoal).length,
    openActions: actions.filter(isOpenAction).length,
    activeDev: devPlans.filter(isActiveDev).length,
  };

  const ctx = {
    pairId: pair.id,
    role,
    myName: myProfile?.full_name || myProfile?.email || "",
    partnerName: partnerProfile?.full_name || partnerProfile?.email || (role === "employee" ? "Your manager" : "Your employee"),
    email: user.email,
  };

  return (
    <ToastProvider>
      <AppShell ctx={ctx} counts={counts}>
        {children}
      </AppShell>
    </ToastProvider>
  );
}
