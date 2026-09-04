"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePulse } from "@/components/PulseContext";
import { useToast } from "@/components/ui/ToastProvider";
import Badge from "@/components/ui/Badge";
import {
  listMeetings,
  listCheckinsAll,
  listAchievements,
  listFeedback,
  listGoals,
  listDevelopmentPlans,
  listCareerAnswers,
  listActions,
  listActivity,
  buildHistory,
  listClosedPairs,
  closePair,
  reopenPair,
} from "@/lib/data";
import { ago } from "@/lib/format";

const FILTERS = ["All", "1:1", "Performance", "Goals", "Development", "Career", "Feedback", "Actions", "Changes"];

export default function HistoryPage() {
  const { pairId, userId, partnerName, supabase } = usePulse();
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [closedPairs, setClosedPairs] = useState([]);

  async function loadClosedPairs() {
    setClosedPairs(await listClosedPairs(supabase, userId));
  }

  async function reopen(id) {
    await reopenPair(supabase, id);
    loadClosedPairs();
  }

  // Ends the pairing itself (e.g. someone left the company) -- distinct from
  // "Final wrap up," which only closes out open topics/goals/actions and
  // deliberately leaves the pairing running (Melissa's call, 2026-09-03).
  // Reversible via Reopen above, same as it's always been.
  async function endPairing() {
    if (!window.confirm(`End this pairing with ${partnerName}? It moves to Closed pairings below -- nothing is deleted, and it can be reopened anytime.`)) return;
    const note = window.prompt("Optional note for the record (why, or leave blank):") || "";
    await closePair(supabase, pairId, note.trim() || null);
    toast("Pairing ended", `${partnerName} is unaffected until they open the app again.`);
    router.refresh();
  }

  useEffect(() => {
    loadClosedPairs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function loadAll() {
    setLoading(true);
    const [m, ci, ach, fb, g, d, ca, a, act] = await Promise.all([
      listMeetings(supabase, pairId),
      listCheckinsAll(supabase, pairId),
      listAchievements(supabase, pairId),
      listFeedback(supabase, pairId),
      listGoals(supabase, pairId),
      listDevelopmentPlans(supabase, pairId),
      listCareerAnswers(supabase, pairId),
      listActions(supabase, pairId),
      listActivity(supabase, pairId),
    ]);
    setHistory(buildHistory({ meetings: m, checkins: ci, achievements: ach, feedback: fb, goals: g, development: d, career: ca, actions: a, activity: act }));
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return history.filter((h) => {
      if (filter !== "All" && h.cat !== filter) return false;
      if (q) return `${h.title} ${h.body || ""} ${h.who || ""}`.toLowerCase().includes(q);
      return true;
    });
  }, [history, filter, query]);

  if (loading) return <section><h1>History</h1><p className="subtitle">Loading…</p></section>;

  const searching = query.trim() || filter !== "All";

  return (
    <section>
      <h1>History</h1>
      <p className="subtitle">Every meaningful conversation, in order. Search it, filter it, export any of it.</p>

      <div className="card">
        <div className="card-head">
          <h2>This pairing</h2>
        </div>
        <p className="card-note">If {partnerName} has left, or this pairing is over for any other reason, end it here.</p>
        <button className="btn ghost sm" onClick={endPairing}>End this pairing</button>
      </div>

      {closedPairs.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>Closed pairings</h2>
          </div>
          <p className="card-note">Ended, not deleted — everything they contain still exists. Reopen one to make it active again.</p>
          <ul className="list">
            {closedPairs.map((p) => (
              <li key={p.id}>
                <div className="item-body">
                  <div className="item-text">{p.employee_email === p.manager_email ? p.id : `${p.employee_email} / ${p.manager_email}`}</div>
                  {p.closing_note && <div className="item-sub">{p.closing_note}</div>}
                  <div className="item-meta"><span>Closed {ago(p.closed_at)}</span></div>
                </div>
                <button className="btn sm" onClick={() => reopen(p.id)}>Reopen</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <div className="field">
          <label htmlFor="historySearch">Search</label>
          <input
            id="historySearch"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search everything in this workspace…"
          />
        </div>

        <div className="filters">
          {FILTERS.map((f) => (
            <button key={f} className={`chip${filter === f ? " active" : ""}`} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="empty">
            <div className="big">{searching ? "Nothing matches that" : "No history yet"}</div>
            {searching ? "Try a different filter or search." : "Everything you both do shows up here in order."}
          </div>
        ) : (
          <ul className="list timeline">
            {filtered.map((h, i) => (
              <li key={i}>
                <div className="item-body">
                  <div className="item-text">{h.title}</div>
                  {h.body && <div className="item-sub" style={{ whiteSpace: "pre-wrap" }}>{h.body}</div>}
                  <div className="item-meta">
                    <Badge cls="b-purple">{h.cat}</Badge>
                    <span>{h.who || ""} · {ago(h.at)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
