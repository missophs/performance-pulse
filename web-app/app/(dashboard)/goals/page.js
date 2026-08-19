"use client";

import { useEffect, useState } from "react";
import { usePulse } from "@/components/PulseContext";
import { useToast } from "@/components/ui/ToastProvider";
import { listGoals, saveGoal, deleteGoal, addTopic, notify } from "@/lib/data";
import { fmtDate, ago, staleGoal } from "@/lib/format";
import { goalStatusBadge } from "@/lib/badges";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";

const GOAL_STATES = ["Not Started", "In Progress", "At Risk", "Complete", "Deferred"];

const BLANK = { text: "", why: "", measure: "", owner: "", target: "", status: "Not Started", progress: 0, obstacles: "", support: "" };

export default function GoalsPage() {
  const { pairId, role, isMgr, myName, partnerName, supabase } = usePulse();
  const toast = useToast();
  const otherRole = isMgr ? "employee" : "manager";
  const employeeName = isMgr ? partnerName : myName;
  const managerName = isMgr ? myName : partnerName;

  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);

  async function loadAll() {
    setLoading(true);
    const g = await listGoals(supabase, pairId);
    setGoals(g);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairId]);

  async function safeNotify(text, view) {
    try {
      await notify(supabase, pairId, text, role, otherRole, view || null);
    } catch {
      // best effort — a failed ping shouldn't block the save
    }
  }

  function openAdd() {
    setEditing(null);
    setForm({ ...BLANK, owner: employeeName });
    setModalOpen(true);
  }

  function openEdit(g) {
    setEditing(g);
    setForm({
      text: g.text || "",
      why: g.why || "",
      measure: g.measure || "",
      owner: g.owner_label || employeeName,
      target: g.target_date || "",
      status: g.status || "Not Started",
      progress: g.progress ?? 0,
      obstacles: g.obstacles || "",
      support: g.support || "",
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  async function handleSave() {
    const text = form.text.trim();
    if (!text) return;
    const payload = { ...form, text, id: editing?.id };
    await saveGoal(supabase, pairId, payload, myName);
    closeModal();
    if (editing) {
      await safeNotify(`${myName} updated the goal: ${text}`);
    } else {
      await safeNotify(`${myName} added a goal: ${text}`, "goals");
    }
    loadAll();
  }

  async function handleDelete(g) {
    if (!window.confirm(`Remove "${g.text}"?`)) return;
    await deleteGoal(supabase, g.id);
    await safeNotify(`Goal removed: ${g.text}`);
    loadAll();
  }

  async function handleAddToAgenda(g) {
    await addTopic(supabase, pairId, {
      text: `Progress on: ${g.text}`,
      why: "This goal hasn't been updated in a few weeks.",
      category: "Priorities",
      role,
      name: myName,
    });
    await safeNotify(`${myName} added a goal check-in to the agenda`);
    toast("Added to agenda", "It'll be there for your next 1:1.");
  }

  return (
    <section>
      <h1>Goals</h1>
      <p className="subtitle">Set together, revisited in your 1:1s. Accountability with support, not pressure.</p>

      <div className="card">
        <div className="card-head">
          <h2>Goals</h2>
          <button className="btn sm" onClick={openAdd}>Add a goal</button>
        </div>
        {loading ? (
          <p className="card-note">Loading…</p>
        ) : goals.length === 0 ? (
          <div className="empty"><div className="big">No goals yet</div>Add one together — goals set with your manager tend to stick.</div>
        ) : (
          <ul className="list">
            {goals.slice().reverse().map((g) => {
              const badge = goalStatusBadge(g.status);
              const stale = staleGoal(g);
              return (
                <li key={g.id}>
                  <div className="item-body">
                    <div className="item-text">{g.text}</div>
                    {g.why && <div className="item-sub"><strong>Why:</strong> {g.why}</div>}
                    {g.measure && <div className="item-sub"><strong>Success looks like:</strong> {g.measure}</div>}
                    {g.obstacles && <div className="item-sub"><strong>In the way:</strong> {g.obstacles}</div>}
                    {g.support && <div className="item-sub"><strong>Support needed:</strong> {g.support}</div>}
                    <div className="bar"><span style={{ width: `${g.progress || 0}%` }} /></div>
                    <div className="item-meta">
                      <Badge cls={badge.cls}>{badge.label}</Badge>
                      <span>
                        {g.progress || 0}% · {g.owner_label || employeeName}
                        {g.target_date ? ` · target ${fmtDate(g.target_date)}` : ""} · updated {ago(g.updated_at || g.created_at)}
                      </span>
                    </div>
                    {stale && (
                      <div className="nudge">
                        <span>No update in three weeks. Want to talk about it at your next 1:1?</span>
                        <button className="btn ghost sm" onClick={() => handleAddToAgenda(g)}>Add to agenda</button>
                      </div>
                    )}
                  </div>
                  <div className="item-actions">
                    <button className="btn secondary sm" onClick={() => openEdit(g)}>Update</button>
                    <button className="btn ghost sm" onClick={() => handleDelete(g)}>Remove</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal
        open={modalOpen}
        title={editing ? "Edit goal" : "Add a goal"}
        note="Goals work best when you both can tell whether they happened."
        onClose={closeModal}
        onSave={handleSave}
        saveLabel={editing ? "Save changes" : "Add goal"}
        saveDisabled={!form.text.trim()}
      >
        <div className="field">
          <label htmlFor="glText">The goal</label>
          <input id="glText" type="text" placeholder="e.g. Cut onboarding time for new customers to under 10 days" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="glWhy">Why it matters</label>
          <textarea id="glWhy" placeholder="What changes if this lands." value={form.why} onChange={(e) => setForm({ ...form, why: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="glMeasure">How we'll know it worked</label>
          <textarea id="glMeasure" placeholder="The success measure. Be concrete." value={form.measure} onChange={(e) => setForm({ ...form, measure: e.target.value })} />
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="glOwner">Owner</label>
            <select id="glOwner" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}>
              <option>{employeeName}</option>
              <option>{managerName}</option>
              <option>Both of us</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="glTarget">Target date</label>
            <input id="glTarget" type="date" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="glStatus">Status</label>
          <select id="glStatus" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {GOAL_STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="glProgress">Progress: <span>{form.progress}</span>%</label>
          <input id="glProgress" type="range" min="0" max="100" step="5" value={form.progress} onChange={(e) => setForm({ ...form, progress: parseInt(e.target.value, 10) })} />
        </div>
        <div className="field">
          <label htmlFor="glObstacles">What's in the way?</label>
          <textarea id="glObstacles" placeholder="Blockers, dependencies, anything slowing this down." value={form.obstacles} onChange={(e) => setForm({ ...form, obstacles: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="glSupport">What support is needed from {managerName}?</label>
          <textarea id="glSupport" placeholder="Be specific about the ask." value={form.support} onChange={(e) => setForm({ ...form, support: e.target.value })} />
        </div>
      </Modal>
    </section>
  );
}
