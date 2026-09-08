"use client";

import { useEffect, useState } from "react";
import { usePulse } from "@/components/PulseContext";
import { useToast } from "@/components/ui/ToastProvider";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import { listActions, saveAction, toggleActionDone, deleteAction, notify } from "@/lib/data";
import { isOverdue, fmtDate } from "@/lib/format";
import { actionBadge } from "@/lib/badges";

const ACTION_STATES = ["Open", "In Progress", "Blocked", "Done"];

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "mine", label: "Mine" },
  { key: "overdue", label: "Overdue" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
];

const emptyForm = { text: "", owner: "", due: "", status: "Open", related: "", notes: "" };

export default function ActionsPage() {
  const { pairId, role, myName, partnerName, supabase } = usePulse();
  const toast = useToast();
  const otherRole = role === "manager" ? "employee" : "manager";

  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState([]);
  const [filter, setFilter] = useState("open");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  async function loadAll() {
    setLoading(true);
    const a = await listActions(supabase, pairId);
    setActions(a);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairId]);

  if (loading) return <section><h1>Actions</h1><p className="subtitle">Loading…</p></section>;

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm, owner: myName });
    setModalOpen(true);
  }

  function openEdit(action) {
    setEditing(action);
    setForm({
      text: action.text || "",
      owner: action.owner_label || myName,
      due: action.due_date || "",
      status: action.status || "Open",
      related: action.related || "",
      notes: action.notes || "",
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
  }

  async function saveForm() {
    const text = form.text.trim();
    if (!text) return;
    const payload = {
      id: editing?.id,
      text,
      owner: form.owner,
      due: form.due || null,
      status: form.status,
      related: form.related.trim(),
      notes: form.notes.trim(),
    };
    await saveAction(supabase, pairId, payload, myName);
    if (!editing) {
      await notify(supabase, pairId, `${myName} added an action: ${text}`, role, otherRole, "actions", "action");
    }
    closeModal();
    toast(editing ? "Saved" : "Added", editing ? "Action updated." : `${partnerName} will see this the next time they open Performance Pulse.`);
    loadAll();
  }

  async function toggleDone(action) {
    await toggleActionDone(supabase, action.id, action.status !== "Done", { actorName: myName, actorRole: role, source: "web" });
    loadAll();
  }

  async function removeAction(action) {
    if (!window.confirm(`Remove "${action.text}"?`)) return;
    await deleteAction(supabase, action.id);
    toast("Removed", "Action deleted.");
    loadAll();
  }

  const filtered = actions.filter((a) => {
    if (filter === "all") return true;
    if (filter === "done") return a.status === "Done";
    if (filter === "overdue") return isOverdue(a.due_date, a.status);
    if (filter === "mine") return a.status !== "Done" && (a.owner_label === myName || a.owner_label === "Both of us");
    return a.status !== "Done";
  });

  const emptyCopy =
    filter === "all"
      ? { big: "No actions yet", body: "Add one below to track what you both agreed to do." }
      : filter === "done"
      ? { big: "Nothing done yet", body: "Completed actions will show up here." }
      : filter === "overdue"
      ? { big: "Nothing overdue", body: "Everything with a date is still on track." }
      : filter === "mine"
      ? { big: "Nothing assigned to you", body: "Open actions owned by you or both of you show up here." }
      : { big: "Nothing open", body: "Add an action so you both know what happens next." };

  return (
    <section>
      <h1>Actions</h1>
      <p className="subtitle">Everything you both agreed to do, and by when.</p>

      <div className="card">
        <div className="card-head">
          <h2>Actions</h2>
          <button className="btn sm" onClick={openAdd}>Add an action</button>
        </div>

        <div className="filters">
          {FILTERS.map((f) => (
            <button key={f.key} className={`chip${filter === f.key ? " active" : ""}`} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="empty">
            <div className="big">{emptyCopy.big}</div>
            {emptyCopy.body}
          </div>
        ) : (
          <ul className="list">
            {filtered.map((a) => {
              const overdue = isOverdue(a.due_date, a.status);
              const badge = actionBadge(a, overdue);
              return (
                <li key={a.id}>
                  <div className="item-body">
                    <div className={`item-text${a.status === "Done" ? " done-text" : ""}`}>{a.text}</div>
                    {a.notes && <div className="item-sub" style={{ whiteSpace: "pre-wrap" }}>{a.notes}</div>}
                    {a.related && <div className="item-sub" style={{ color: "var(--faint)" }}>{a.related}</div>}
                    <div className="item-meta">
                      <Badge cls={badge.cls}>{badge.label}</Badge>
                      <span>{a.owner_label}{a.due_date ? ` · due ${fmtDate(a.due_date)}` : " · no date"}</span>
                    </div>
                  </div>
                  <div className="item-actions">
                    <button className={`btn ${a.status === "Done" ? "ghost" : "secondary"} sm`} onClick={() => toggleDone(a)}>
                      {a.status === "Done" ? "Reopen" : "Done"}
                    </button>
                    <button className="btn ghost sm" onClick={() => openEdit(a)}>Edit</button>
                    <button className="btn ghost sm" onClick={() => removeAction(a)}>Remove</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal
        open={modalOpen}
        title={editing ? "Edit action" : "Add an action"}
        note="Something one of you agreed to do, with a name and a date on it."
        onClose={closeModal}
        onSave={saveForm}
        saveLabel={editing ? "Save changes" : "Add action"}
        saveDisabled={!form.text.trim()}
      >
        <div className="field">
          <label htmlFor="acText">What needs to happen</label>
          <input id="acText" type="text" autoComplete="off" value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} placeholder="e.g. Draft the rollout timeline" />
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="acOwner">Owner</label>
            <select id="acOwner" value={form.owner} onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}>
              <option value={myName}>{myName}</option>
              <option value={partnerName}>{partnerName}</option>
              <option value="Both of us">Both of us</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="acDue">Due</label>
            <input id="acDue" type="date" value={form.due} onChange={(e) => setForm((f) => ({ ...f, due: e.target.value }))} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="acStatus">Status</label>
          <select id="acStatus" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
            {ACTION_STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="acRelated">Related to</label>
          <input id="acRelated" type="text" autoComplete="off" value={form.related} onChange={(e) => setForm((f) => ({ ...f, related: e.target.value }))} placeholder="A goal, topic or conversation (optional)" />
        </div>
        <div className="field">
          <label htmlFor="acNotes">Notes</label>
          <textarea id="acNotes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Anything that would help whoever picks this up." />
        </div>
      </Modal>
    </section>
  );
}
