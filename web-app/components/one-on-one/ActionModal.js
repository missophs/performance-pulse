"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import { ACTION_STATES } from "@/lib/one-on-one-content";

const BLANK = { text: "", owner: "", due: "", status: "Open", related: "", notes: "" };

// Shared add/edit modal for actions — opened from a topic's "Action" button
// (seeded with related: "Topic: <text>") and from the wrap-up "Add an
// action" button and its action list's "Edit" button.
export default function ActionModal({ open, existing, seed, owners, defaultOwner, onClose, onSave }) {
  const [form, setForm] = useState(BLANK);

  useEffect(() => {
    if (!open) return;
    const base = existing || seed || {};
    setForm({
      text: base.text || "",
      owner: base.owner_label || base.owner || defaultOwner || (owners && owners[0]) || "",
      due: base.due_date || base.due || "",
      status: base.status || "Open",
      related: base.related || "",
      notes: base.notes || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing, seed]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function save() {
    if (!form.text.trim()) return;
    onSave({ ...form, text: form.text.trim() });
  }

  return (
    <Modal
      open={open}
      title={existing ? "Edit action" : "Add an action"}
      note="Something one of you agreed to do, with a name and a date on it."
      onClose={onClose}
      onSave={save}
      saveLabel={existing ? "Save changes" : "Add action"}
      saveDisabled={!form.text.trim()}
    >
      <div className="field">
        <label htmlFor="acText">What needs to happen</label>
        <input id="acText" type="text" value={form.text} onChange={(e) => set("text", e.target.value)} placeholder="e.g. Draft the rollout timeline" />
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="acOwner">Owner</label>
          <select id="acOwner" value={form.owner} onChange={(e) => set("owner", e.target.value)}>
            {(owners || []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="acDue">Due</label>
          <input id="acDue" type="date" value={form.due} onChange={(e) => set("due", e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="acStatus">Status</label>
        <select id="acStatus" value={form.status} onChange={(e) => set("status", e.target.value)}>
          {ACTION_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="acRelated">Related to</label>
        <input
          id="acRelated"
          type="text"
          value={form.related}
          onChange={(e) => set("related", e.target.value)}
          placeholder="A goal, topic or conversation (optional)"
        />
      </div>
      <div className="field">
        <label htmlFor="acNotes">Notes</label>
        <textarea id="acNotes" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything that would help whoever picks this up." />
      </div>
    </Modal>
  );
}
