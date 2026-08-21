"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PulseProvider, usePulse } from "@/components/PulseContext";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/format";
import { updateProfile } from "@/lib/data";
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
  const { role, myName, isMgr, supabase } = usePulse();
  const pathname = usePathname();
  const router = useRouter();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(myName);
  const [savingName, setSavingName] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
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
    </div>
  );
}
