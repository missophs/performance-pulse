"use client";

import Badge from "@/components/ui/Badge";
import { topicStatusBadge } from "@/lib/badges";
import { ago } from "@/lib/format";
import { TOPIC_STATES } from "@/lib/one-on-one-content";

// Shared renderer for the Talk agenda and the Parking lot — reimplements
// renderTopicList() from the prototype as a React component. Always shows
// the 7-state status control, a Note button, an Action button, and Remove.
// viewerRole gates the Edit button to whoever created the topic — status
// changes, notes, and delete stay open to both partners (unchanged), but
// rewriting someone else's words is creator-only.
export default function TopicList({ items, emptyTitle, emptyBody, viewerRole, onStatusChange, onNote, onEdit, onSubmit, onAction, onDelete }) {
  if (!items.length) {
    return (
      <div className="empty">
        <div className="big">{emptyTitle}</div>
        {emptyBody}
      </div>
    );
  }

  return (
    <ul className="list">
      {items.map((t) => {
        const badge = topicStatusBadge(t.status);
        return (
          <li key={t.id}>
            <div className="item-body">
              <div className="item-text">{t.text}</div>
              {t.why && (
                <div className="item-sub" style={{ whiteSpace: "pre-wrap" }}>
                  {t.why}
                </div>
              )}
              {t.notes && (
                <div className="item-sub" style={{ whiteSpace: "pre-wrap" }}>
                  <strong>Note:</strong> {t.notes}
                </div>
              )}
              <div className="item-meta">
                <Badge cls="b-purple">{t.category}</Badge>
                <Badge cls={badge.cls}>{badge.label}</Badge>
                {!t.submitted_at && <Badge cls="b-grey">Not submitted</Badge>}
                <span>
                  Added by {t.created_by_name} · {ago(t.created_at)}
                </span>
              </div>
            </div>
            <div className="item-actions">
              <select
                value={t.status}
                onChange={(e) => onStatusChange(t, e.target.value)}
                style={{ width: "auto", padding: "5px 8px", fontSize: 12 }}
              >
                {TOPIC_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s === "open" ? "Not discussed" : s}
                  </option>
                ))}
              </select>
              <button className="btn ghost sm" onClick={() => onNote(t)}>
                Note
              </button>
              {t.created_by_role === viewerRole && (
                <button className="btn ghost sm" onClick={() => onEdit(t)}>
                  Edit
                </button>
              )}
              {t.created_by_role === viewerRole && !t.submitted_at && (
                <button className="btn sm" onClick={() => onSubmit(t)}>
                  Submit
                </button>
              )}
              <button className="btn secondary sm" onClick={() => onAction(t)}>
                Action
              </button>
              <button className="btn ghost sm" onClick={() => onDelete(t)}>
                Remove
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
