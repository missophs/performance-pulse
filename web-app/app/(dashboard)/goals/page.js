"use client";

import { useEffect, useState } from "react";
import { usePulse } from "@/components/PulseContext";
import { useToast } from "@/components/ui/ToastProvider";
import { listGoals, saveGoal, deleteGoal, addTopic, notify, getFormDraft, saveFormDraft, clearFormDraft } from "@/lib/data";
import { fmtDate, ago, staleGoal } from "@/lib/format";
import { goalStatusBadge } from "@/lib/badges";
import { GOAL_SUGGESTIONS, SMART_GOAL_HELP, EMPLOYEE_GOAL_PROMPT } from "@/lib/goals-content";
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

  // `kind` is what turns a notification into a real Slack DM (see BK_KINDS in
  // lib/block-kit.js) — only passed for a brand-new goal, so edits, removals,
  // and check-ins stay in-app only.
  async function safeNotify(text, view, kind) {
    try {
      await notify(supabase, pairId, text, role, otherRole, view || null, kind || null);
    } catch {
      // best effort — a failed ping shouldn't block the save
    }
  }

  async function openAdd() {
    setEditing(null);
    const draft = await getFormDraft(supabase, pairId, role, "goal").catch(() => null);
    setForm({ ...BLANK, owner: employeeName, ...draft?.draft });
    setModalOpen(true);
  }

  // Autosave a draft of a new (not editing) goal so closing the modal
  // without saving doesn't lose what was typed.
  useEffect(() => {
    if (!modalOpen || editing) return;
    const hasContent = form.text.trim() || form.why.trim() || form.measure.trim() || form.target || form.obstacles.trim() || form.support.trim();
    const timer = setTimeout(() => {
      if (hasContent) saveFormDraft(supabase, pairId, role, "goal", form).catch(() => {});
      else clearFormDraft(supabase, pairId, role, "goal").catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, modalOpen, editing]);

  async function discardDraft() {
    setForm({ ...BLANK, owner: employeeName });
    await clearFormDraft(supabase, pairId, role, "goal").catch(() => {});
  }

  function openEdit(g) {
    setEditing(g);
    setForm({
      text: g.text || "",
      why: g.why || "",
      measure: g.measure || "",
      // Goals only ever go manager-to-employee (Melissa: "they would never
      // give their manager assigned goals") — owner is always the employee,
      // regardless of who created or is editing the goal. Normalizes any
      // pre-existing goal owned by "manager"/"Both of us" the next time it's
      // edited.
      owner: employeeName,
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
    const wasNew = !editing;
    await saveGoal(supabase, pairId, payload, myName);
    closeModal();
    if (wasNew) await clearFormDraft(supabase, pairId, role, "goal").catch(() => {});
    if (editing) {
      await safeNotify(`${myName} updated the goal: ${text}`);
    } else {
      await safeNotify(`${myName} added a goal: ${text}`, "goals", "goal");
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
        onDiscard={editing ? undefined : discardDraft}
      >
        <div style={{ marginBottom: 14, fontSize: "0.9em", opacity: 0.85 }}>
          <strong>SMART goals</strong>
          <p style={{ margin: "4px 0" }}>{SMART_GOAL_HELP.intro}</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {SMART_GOAL_HELP.criteria.map(([label, desc]) => (
              <li key={label}>
                <strong>{label}:</strong> {desc}
              </li>
            ))}
          </ul>
        </div>
        {!isMgr && (
          <div style={{ marginBottom: 14, fontSize: "0.9em", opacity: 0.85 }}>{EMPLOYEE_GOAL_PROMPT}</div>
        )}
        <div className="field">
          <label htmlFor="glSuggest">Pick a suggestion (optional)</label>
          <select
            id="glSuggest"
            value=""
            onChange={(e) => {
              if (e.target.value) setForm({ ...form, text: e.target.value });
            }}
          >
            <option value="">Browse suggested goals</option>
            {Object.entries(GOAL_SUGGESTIONS).map(([cat, texts]) => (
              <optgroup key={cat} label={cat}>
                {texts.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
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
        <div className="field">
          <label htmlFor="glTarget">Target date</label>
          <input id="glTarget" type="date" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
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
