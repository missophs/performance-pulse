"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePulse } from "@/components/PulseContext";
import { listNotifications, markAllNotificationsRead, listActions, listGoals, listFeedbackRequests, getMyPair } from "@/lib/data";
import { ago, today, daysBetween, staleGoal } from "@/lib/format";

const TAB_HREF = {
  dashboard: "/dashboard",
  oneOnOne: "/one-on-one",
  performance: "/performance",
  goals: "/goals",
  development: "/development",
  actions: "/actions",
};

export default function NotificationBell() {
  const { pairId, role, myName, supabase } = usePulse();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [reminders, setReminders] = useState([]);
  const boxRef = useRef(null);

  async function load() {
    const [notifs, actions, goals, requests, pair] = await Promise.all([
      listNotifications(supabase, pairId),
      listActions(supabase, pairId),
      listGoals(supabase, pairId),
      listFeedbackRequests(supabase, pairId),
      getMyPair(supabase, (await supabase.auth.getUser()).data.user.id),
    ]);

    const mine = notifs.filter((n) => n.to_role === role || n.to_role === "both");
    setNotifications(mine);

    const out = [];
    const todayStr = today();
    actions
      .filter((a) => a.status !== "Done" && a.due_date && (a.owner_label === myName || a.owner_label === "Both of us"))
      .forEach((a) => {
        const days = daysBetween(new Date(todayStr + "T00:00:00").getTime(), new Date(a.due_date + "T00:00:00").getTime());
        if (days < 0) out.push({ text: `Past due: ${a.text}`, sub: `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`, view: "actions", tone: "late" });
        else if (days <= 3) out.push({ text: `Due ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}: ${a.text}`, sub: "Assigned to you", view: "actions", tone: "soon" });
      });
    goals.forEach((g) => {
      if (staleGoal(g)) out.push({ text: `No update in three weeks: ${g.text}`, sub: "Worth raising at your next 1:1", view: "goals", tone: "soon" });
    });
    if (pair?.next_1on1_date) {
      const d = daysBetween(new Date(todayStr + "T00:00:00").getTime(), new Date(pair.next_1on1_date + "T00:00:00").getTime());
      if (d >= 0 && d <= 2) {
        out.push({ text: `Your 1:1 is ${d === 0 ? "today" : d === 1 ? "tomorrow" : "in 2 days"}`, sub: "Check the agenda", view: "oneOnOne", tone: "soon" });
      }
    }
    requests.filter((r) => r.status === "open" && r.from_role !== role).forEach((r) => {
      out.push({ text: `${r.from_name} asked you for feedback`, sub: r.about || "No particular topic given", view: "performance", tone: "soon" });
    });
    setReminders(out);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairId]);

  useEffect(() => {
    function onDocClick(e) {
      if (open && boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const unread = notifications.filter((n) => !n.read).length;
  const total = unread + reminders.length;

  async function toggle() {
    if (!open) await load();
    setOpen((o) => !o);
  }

  async function goTo(view) {
    setOpen(false);
    if (TAB_HREF[view]) router.push(TAB_HREF[view]);
  }

  async function markAllRead() {
    await markAllNotificationsRead(supabase, pairId, role);
    setNotifications((n) => n.map((x) => ({ ...x, read: true })));
  }

  return (
    <div style={{ position: "relative" }} ref={boxRef}>
      <button className="bell" aria-label="Notifications" title="Notifications" onClick={toggle}>
        🔔<span className="count" style={{ display: total ? "" : "none" }}>{total > 99 ? "99+" : total}</span>
      </button>
      {open && (
        <div className="card" style={{ position: "absolute", right: 0, top: 44, width: 320, zIndex: 50, maxHeight: 420, overflowY: "auto" }}>
          <div className="card-head">
            <h2 style={{ fontSize: 13 }}>Notifications</h2>
            {unread > 0 && (
              <button className="btn ghost sm" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          {reminders.map((r, i) => (
            <div key={`r${i}`} className="nudge" style={{ marginBottom: 8, cursor: "pointer" }} onClick={() => goTo(r.view)}>
              <span className={`badge ${r.tone === "late" ? "b-red" : "b-amber"}`}>{r.text}</span>
              <div className="card-note" style={{ margin: "4px 0 0" }}>{r.sub}</div>
            </div>
          ))}
          {notifications.slice(0, 8).map((n) => (
            <div
              key={n.id}
              style={{ cursor: "pointer", opacity: n.read ? 0.6 : 1, padding: "8px 0", borderBottom: "1px solid var(--border)" }}
              onClick={() => goTo(n.view)}
            >
              <div style={{ fontSize: 13 }}>{n.text}</div>
              <div className="card-note" style={{ margin: "2px 0 0" }}>{ago(n.created_at)}</div>
            </div>
          ))}
          {!reminders.length && !notifications.length && <div className="card-note">Nothing new.</div>}
        </div>
      )}
    </div>
  );
}
