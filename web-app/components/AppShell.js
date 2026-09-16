"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PulseProvider, usePulse } from "@/components/PulseContext";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/format";
import { updatePair } from "@/lib/data";
import { setCurrentPair } from "@/lib/actions";
import NotificationBell from "@/components/NotificationBell";
import Modal from "@/components/ui/Modal";

const NAV = [
  { view: "dashboard", href: "/dashboard", label: "Dashboard" },
  { view: "performance", href: "/performance", label: "Performance" },
  { view: "oneOnOne", href: "/one-on-one", label: "My 1:1", countKey: "openTopics" },
  { view: "goals", href: "/goals", label: "Goals", countKey: "activeGoals" },
  { view: "development", href: "/development", label: "Development", countKey: "activeDev" },
  // Career removed from nav (Melissa's call, 2026-09-04) -- confusing
  // mid-redesign. The /career page and its data are untouched, just
  // unreachable from here now.
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
  const { userId, pairId, pairs, role, myName, partnerName, employeeLabel, isMgr, supabase } = usePulse();
  const pathname = usePathname();
  const router = useRouter();

  // If this account is on a pairing where it's the EMPLOYEE, that's true
  // no matter which pairing is currently active -- surfaced persistently so
  // a manager-with-their-own-manager doesn't have to open the pair switcher
  // to discover it exists (found live 2026-09-16: viewing the pairing where
  // you're the manager gave no hint you also have a manager elsewhere).
  const myManagerPair = pairs?.find((p) => p.role === "employee" && p.id !== pairId);

  const [switching, setSwitching] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelInput, setLabelInput] = useState(employeeLabel);
  const [savingLabel, setSavingLabel] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function switchPair(id) {
    if (id === pairId) return;
    setSwitching(true);
    await setCurrentPair(id);
    router.refresh();
    setSwitching(false);
  }

  function openLabelEdit() {
    setLabelInput(employeeLabel);
    setEditingLabel(true);
  }

  async function saveLabel() {
    setSavingLabel(true);
    await updatePair(supabase, pairId, { employee_label: labelInput.trim() || null });
    setSavingLabel(false);
    setEditingLabel(false);
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
            {pairs?.length > 1 && (
              <>
                <span style={{ opacity: 0.85, fontSize: 13 }}>Viewing 1:1 with:</span>
                <select
                  className="pair-switch"
                  value={pairId}
                  disabled={switching}
                  onChange={(e) => switchPair(e.target.value)}
                  title="You're on more than one 1:1 — switch which one you're viewing"
                >
                  {pairs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.partnerName}
                    </option>
                  ))}
                </select>
              </>
            )}
            {myManagerPair && (
              <button
                className="btn ghost sm"
                onClick={() => switchPair(myManagerPair.id)}
                disabled={switching}
                title="You're also someone's employee -- click to switch to that 1:1"
              >
                Your manager: {myManagerPair.partnerName}
              </button>
            )}
            <Link href="/onboarding/add" className="btn ghost sm" title={isMgr ? "Set up a 1:1 with another employee you manage" : "Set up a 1:1 with another manager"}>
              + Add {isMgr ? "employee" : "manager"}
            </Link>
            {isMgr ? (
              <button className="btn ghost sm" onClick={openLabelEdit} title="Click to change the name you see for this employee">
                You manage {partnerName}
              </button>
            ) : (
              <Link href="/one-on-one" className="badge b-purple" title="Go to your 1:1 conversation">
                Employee of {partnerName} &rarr; My 1:1
              </Link>
            )}
            <NotificationBell />
            <span
              className="btn ghost sm"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "default" }}
            >
              <div className={`avatar ${isMgr ? "mgr" : "emp"}`}>{initials(myName)}</div>
              <span className="who">{myName}</span>
            </span>
            <button className="btn ghost sm" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>

        {children}
      </main>

      <Modal
        open={editingLabel}
        title="Employee name (just for you)"
        note="This only changes what you call them here, in this pairing. Their own account name is unchanged, and no one else -- not them, not any other manager they have -- sees this label. Leave it blank to go back to their real name."
        onClose={() => setEditingLabel(false)}
        onSave={saveLabel}
        saveLabel={savingLabel ? "Saving…" : "Save"}
        saveDisabled={savingLabel}
      >
        <div className="field">
          <label htmlFor="employeeLabel">Name to show you</label>
          <input
            id="employeeLabel"
            type="text"
            autoComplete="off"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            placeholder="e.g. Monte"
          />
        </div>
      </Modal>

    </div>
  );
}
