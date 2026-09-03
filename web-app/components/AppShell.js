"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PulseProvider, usePulse } from "@/components/PulseContext";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/format";
import { updateProfile, updatePair } from "@/lib/data";
import { setCurrentPair } from "@/lib/actions";
import NotificationBell from "@/components/NotificationBell";
import Modal from "@/components/ui/Modal";

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
  const { pairId, pairs, role, myName, partnerName, employeeLabel, isMgr, supabase } = usePulse();
  const pathname = usePathname();
  const router = useRouter();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(myName);
  const [savingName, setSavingName] = useState(false);
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

  function openNameEdit() {
    setNameInput(myName);
    setEditingName(true);
  }

  async function saveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setSavingName(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await updateProfile(supabase, user.id, { full_name: trimmed });
    setSavingName(false);
    setEditingName(false);
    router.refresh();
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
              <select
                className="pair-switch"
                value={pairId}
                disabled={switching}
                onChange={(e) => switchPair(e.target.value)}
                title="Switch which 1:1 you're viewing"
              >
                {pairs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.partnerName}
                  </option>
                ))}
              </select>
            )}
            <Link href="/onboarding/add" className="btn ghost sm" title="Set up a 1:1 with someone else">
              + Add pairing
            </Link>
            {isMgr ? (
              <button className="btn ghost sm" onClick={openLabelEdit} title="Click to change the name you see for this employee">
                You manage {partnerName}
              </button>
            ) : (
              <span className="badge b-purple" title="Your role in this 1:1">Employee</span>
            )}
            <NotificationBell />
            <div className={`avatar ${isMgr ? "mgr" : "emp"}`}>{initials(myName)}</div>
            <button className="who" onClick={openNameEdit} style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "inherit" }} title="Change your display name">
              {myName}
            </button>
            <button className="btn ghost sm" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>

        {children}
      </main>

      <Modal
        open={editingName}
        title="Your display name"
        note="This is what your 1:1 partner sees you as, everywhere in the app and in Slack."
        onClose={() => setEditingName(false)}
        onSave={saveName}
        saveLabel={savingName ? "Saving…" : "Save"}
        saveDisabled={!nameInput.trim() || savingName}
      >
        <div className="field">
          <label htmlFor="displayName">Your name</label>
          <input
            id="displayName"
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="e.g. Melissa Weiss"
          />
        </div>
      </Modal>

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
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            placeholder="e.g. Monte"
          />
        </div>
      </Modal>
    </div>
  );
}
