"use client";

import { useEffect, useMemo, useState } from "react";
import { usePulse } from "@/components/PulseContext";
import Badge from "@/components/ui/Badge";
import {
  listMeetings,
  listCheckinsAll,
  listAchievements,
  listFeedback,
  listConcerns,
  listGoals,
  listDevelopmentPlans,
  listCareerAnswers,
  listActions,
  listActivity,
  buildHistory,
} from "@/lib/data";
import { ago } from "@/lib/format";

const FILTERS = ["All", "1:1", "Performance", "Goals", "Development", "Career", "Feedback", "Actions", "Changes"];

export default function HistoryPage() {
  const { pairId, supabase } = usePulse();

  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");

  async function loadAll() {
    setLoading(true);
    const [m, ci, ach, fb, cc, g, d, ca, a, act] = await Promise.all([
      listMeetings(supabase, pairId),
      listCheckinsAll(supabase, pairId),
      listAchievements(supabase, pairId),
      listFeedback(supabase, pairId),
      listConcerns(supabase, pairId),
      listGoals(supabase, pairId),
      listDevelopmentPlans(supabase, pairId),
      listCareerAnswers(supabase, pairId),
      listActions(supabase, pairId),
      listActivity(supabase, pairId),
    ]);
    setHistory(buildHistory({ meetings: m, checkins: ci, achievements: ach, feedback: fb, concerns: cc, goals: g, development: d, career: ca, actions: a, activity: act }));
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
