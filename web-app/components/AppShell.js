"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PulseProvider, usePulse } from "@/components/PulseContext";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/format";
import NotificationBell from "@/components/NotificationBell";

const NAV = [
  { view: "dashboard", href: "/dashboard", label: "Dashboard" },
  { view: "performance", href: "/performance", label: "Performance" },
  { view: "oneOnOne", href: "/one-on-one", label: "My 1:1", countKey: "openTopics" },
  { view: "goals", href: "/goals", label: "Goals", countKey: "activeGoals" },
  { view: "development", href: "/development", label: "Development", countKey: "activeDev" },
  { view: "career", href: "/career", label: "Career" },
  { view: "actions", href: "/actions", label: "Actions", countKey: "openActions" },
  { view: "history", href: "/history", label: "History" },
  { view: "slack", href: "/slack", label: "Slack" },
  { view: "export", href: "/export", label: "Export" },
];

export default function AppShell({ ctx, counts, children }) {
  return (
    <PulseProvider ctx={ctx}>
      <ShellBody counts={counts}>{children}</ShellBody>
    </PulseProvider>
  );
}

function ShellBody({ counts, children }) {
  const { role, myName, isMgr } = usePulse();
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">PP</div>
          <div>
            <strong>Performance Pulse</strong>
            <small>Private manager-employee app</small>
          </div>
        </div>
        <nav id="nav">
          {NAV.map((item) => (
            <Link
              key={item.view}
              href={item.href}
              className={`nav-item${pathname.startsWith(item.href) ? " active" : ""}`}
            >
              {item.label}
              {item.countKey && <span className="nav-count">{counts[item.countKey] ?? 0}</span>}
            </Link>
          ))}
        </nav>
        <div className="privacy-note">
          <strong>Private workspace.</strong>
          Only you and your manager can see this. Nothing is automatically shared with HR.
        </div>
      </aside>

      <main>
        <div className="topbar">
          <div className="process-flow">PREPARE &rarr; TALK &rarr; REFLECT &rarr; ACT &rarr; FOLLOW UP</div>
          <div className="role-switch">
            <span className="badge b-purple" title="Your role in this 1:1">
              {isMgr ? "Manager" : "Employee"}
            </span>
            <NotificationBell />
            <div className={`avatar ${isMgr ? "mgr" : "emp"}`}>{initials(myName)}</div>
            <div className="who">{myName}</div>
            <button className="btn ghost sm" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}
