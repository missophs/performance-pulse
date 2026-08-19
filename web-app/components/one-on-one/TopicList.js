"use client";

import Badge from "@/components/ui/Badge";
import { topicStatusBadge } from "@/lib/badges";
import { ago } from "@/lib/format";
import { TOPIC_STATES } from "@/lib/one-on-one-content";

// Shared renderer for the Talk agenda and the Parking lot — reimplements
// renderTopicList() from the prototype as a React component. Always shows
// the 7-state status control, a Note button, an Action button, and Remove.
export default function TopicList({ items, emptyTitle, emptyBody, onStatusChange, onNote, onAction, onDelete }) {
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
