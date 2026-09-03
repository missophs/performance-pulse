import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { listMyPairs, getProfile, listTopics, listGoals, listActions, listDevelopmentPlans } from "@/lib/data";
import { isOpenTopic, isActiveGoal, isOpenAction, isActiveDev } from "@/lib/format";
import { ToastProvider } from "@/components/ui/ToastProvider";
import AppShell from "@/components/AppShell";

const PAIR_COOKIE = "pp_pair_id";

export default async function DashboardLayout({ children }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const pairs = await listMyPairs(supabase, user.id);
  if (!pairs.length) redirect("/onboarding");

  const cookieStore = await cookies();
  const savedPairId = cookieStore.get(PAIR_COOKIE)?.value;
  const pair = pairs.find((p) => p.id === savedPairId) || pairs[0];
  const role = pair.employee_id === user.id ? "employee" : "manager";

  // One profile fetch per distinct partner across all of this account's
  // pairs, so the switcher can label every option without N+1 queries.
  const partnerIdOf = (p) => (p.employee_id === user.id ? p.manager_id : p.employee_id);
  const uniquePartnerIds = [...new Set(pairs.map(partnerIdOf).filter(Boolean))];

  const [myProfile, ...partnerProfiles] = await Promise.all([
    getProfile(supabase, user.id),
    ...uniquePartnerIds.map((id) => getProfile(supabase, id)),
  ]);
  const partnerNameById = new Map(uniquePartnerIds.map((id, i) => [id, partnerProfiles[i]?.full_name || partnerProfiles[i]?.email || null]));

  // employee_label is a manager-only, per-pairing display name -- it never
  // touches the employee's real profiles.full_name, and it only applies
  // when the current account is the manager side of this specific pair.
  const pairOptions = pairs.map((p) => {
    const r = p.employee_id === user.id ? "employee" : "manager";
    const realPartnerName = partnerNameById.get(partnerIdOf(p)) || (r === "employee" ? "Your manager" : "Your employee");
    return {
      id: p.id,
      partnerName: r === "manager" && p.employee_label ? p.employee_label : realPartnerName,
      employeeLabel: r === "manager" ? p.employee_label || "" : "",
    };
  });

  const [topics, goals, actions, devPlans] = await Promise.all([
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
    userId: user.id,
    pairId: pair.id,
    pairs: pairOptions,
    role,
    myName: myProfile?.full_name || myProfile?.email || "",
    partnerName: pairOptions.find((p) => p.id === pair.id)?.partnerName || (role === "employee" ? "Your manager" : "Your employee"),
    employeeLabel: pairOptions.find((p) => p.id === pair.id)?.employeeLabel || "",
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
