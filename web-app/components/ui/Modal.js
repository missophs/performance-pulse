"use client";

export default function Modal({ open, title, note, onClose, onSave, saveLabel = "Save", saveDisabled, onDiscard, discardLabel = "Discard", children }) {
  if (!open) return null;

  return (
    <div className="overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <h2 id="modalTitle">{title}</h2>
        {note && <p className="mnote">{note}</p>}
        <div>{children}</div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          {onDiscard && (
            <button type="button" className="btn ghost" onClick={onDiscard}>
              {discardLabel}
            </button>
          )}
          {onSave && (
            <button type="button" className="btn" onClick={onSave} disabled={saveDisabled}>
              {saveLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
