"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { SUGGESTIONS } from "@/lib/one-on-one-content";

// Step 2 of Prepare: the fixed suggested-question library, "write my own"
// (saved to custom_suggestions), and the "hard conversation" prep modal.
export default function SuggestionsCard({ role, isMgr, partnerName, customSuggestions, onAdd, onSaveCustom, onDeleteCustom, onAddHardConvo }) {
  const roleSuggestions = SUGGESTIONS[role] || {};
  const baseCats = Object.keys(roleSuggestions);
  const mine = customSuggestions.filter((s) => s.role === role);
  const cats = mine.length ? [...baseCats, "My own"] : baseCats;

  const [suggCat, setSuggCat] = useState(baseCats[0]);
  const activeCat = cats.includes(suggCat) ? suggCat : cats[0];

  const [ownOpen, setOwnOpen] = useState(false);
  const [ownText, setOwnText] = useState("");
  const [ownCat, setOwnCat] = useState("Feedback");

  const [hcOpen, setHcOpen] = useState(false);
  const [hcOutcome, setHcOutcome] = useState("");
  const [hcFacts, setHcFacts] = useState("");
  const [hcTheirView, setHcTheirView] = useState("");
  const [hcAsk, setHcAsk] = useState("");

  const [marked, setMarked] = useState(() => new Set());
  function toggleMark(key) {
    setMarked((m) => {
      const next = new Set(m);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const note = isMgr
    ? `Questions that tend to open a conversation up rather than close it down. Tap one to put it on the agenda for ${partnerName} to see. Tap the star to flag one you want to come back to, without adding it yet.`
    : `Topics worth raising in this conversation — not scripts to read aloud. Tap one to put it on the agenda; ${partnerName} sees it's there, never the exact wording. Tap the star to flag one you want to come back to, without adding it yet.`;

  const items =
    activeCat === "My own"
      ? mine.map((s) => ({ text: s.text, custom: true, id: s.id, cat: s.category }))
      : (roleSuggestions[activeCat] || []).map((t) => ({ text: t, custom: false, cat: activeCat }));

  function openOwnModal() {
    setOwnText("");
    setOwnCat("Feedback");
    setOwnOpen(true);
  }

  function saveOwn() {
    const t = ownText.trim();
    if (!t) return;
    onSaveCustom(t, ownCat);
    setOwnOpen(false);
    setSuggCat("My own");
  }

  function openHardConvo() {
    setHcOutcome("");
    setHcFacts("");
    setHcTheirView("");
    setHcAsk("");
    setHcOpen(true);
  }

  function saveHardConvo() {
    const outcome = hcOutcome.trim();
    if (!outcome) return;
    const body = [
      "Outcome I want: " + outcome,
      hcFacts.trim() && "The facts: " + hcFacts.trim(),
      hcTheirView.trim() && "How they might see it: " + hcTheirView.trim(),
      hcAsk.trim() && "What I'm asking for: " + hcAsk.trim(),
    ]
      .filter(Boolean)
      .join("\n");
    onAddHardConvo(outcome, body);
    setHcOpen(false);
  }

  return (
    <>
      <p className="card-note">{note}</p>
      <div className="sugg-cats">
        {cats.map((c) => (
          <button key={c} className={`chip${c === activeCat ? " active" : ""}`} onClick={() => setSuggCat(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="sugg-list">
        {items.length ? (
          items.map((s, i) => {
            const key = s.custom ? `c-${s.id}` : `${activeCat}-${i}`;
            const isMarked = marked.has(key);
            return (
              <div className={`sugg${s.custom ? " custom" : ""}${isMarked ? " marked" : ""}`} key={key}>
                <button
                  className={`mark-btn${isMarked ? " on" : ""}`}
                  title={isMarked ? "Unmark" : "Mark as something you want to come back to"}
                  onClick={() => toggleMark(key)}
                  type="button"
                >
                  {isMarked ? "★" : "☆"}
                </button>
                <div className="txt">
                  {s.text}
                  {s.custom && <div className="who">Your own · {s.cat}</div>}
                </div>
                <div className="btn-row">
                  <button className="btn sm" onClick={() => onAdd(s.text, s.cat === "My own" ? "Other" : s.cat)}>
                    Add
                  </button>
                  {s.custom && (
                    <button className="btn ghost sm" onClick={() => onDeleteCustom(s.id)}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty">
            <div className="big">Nothing saved yet</div>
            Write your own suggestion below and it&rsquo;ll live here.
          </div>
        )}
      </div>
      <div className="btn-row" style={{ marginTop: 14 }}>
        <button className="btn secondary sm" onClick={openOwnModal}>
          Write my own suggestion
        </button>
        <button className="btn ghost sm" onClick={openHardConvo}>
          Help me prepare a hard conversation
        </button>
      </div>
      <div className="limits">
        These are conversation starters, not a script — and they&rsquo;re a fixed list, not a model reading your situation. Pick what fits, ignore what
        doesn&rsquo;t, and write your own for anything this list doesn&rsquo;t know about.
      </div>

      <Modal
        open={ownOpen}
        title="Write your own suggestion"
        note="Saved to your own list so you can reuse it in future conversations. Only you see your saved suggestions."
        onClose={() => setOwnOpen(false)}
        onSave={saveOwn}
        saveLabel="Save suggestion"
        saveDisabled={!ownText.trim()}
      >
        <div className="field">
          <label htmlFor="myS">The question or topic</label>
          <textarea id="myS" value={ownText} onChange={(e) => setOwnText(e.target.value)} placeholder="Something you want to remember to raise." />
        </div>
        <div className="field">
          <label htmlFor="mySCat">File it under</label>
          <select id="mySCat" value={ownCat} onChange={(e) => setOwnCat(e.target.value)}>
            {baseCats.concat(["Other"]).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </Modal>

      <Modal
        open={hcOpen}
        title="Prepare a hard conversation"
        note="Four questions that tend to make a difficult conversation go better. Your answers become a private topic on the agenda."
        onClose={() => setHcOpen(false)}
        onSave={saveHardConvo}
        saveLabel="Add to agenda"
        saveDisabled={!hcOutcome.trim()}
      >
        <div className="field">
          <label htmlFor="hcOutcome">What outcome do you actually want?</label>
          <textarea id="hcOutcome" value={hcOutcome} onChange={(e) => setHcOutcome(e.target.value)} placeholder="Not how you want them to feel — what you want to be different afterwards." />
        </div>
        <div className="field">
          <label htmlFor="hcFacts">What are the facts, without interpretation?</label>
          <textarea id="hcFacts" value={hcFacts} onChange={(e) => setHcFacts(e.target.value)} placeholder="What happened and when. Leave out why you think they did it." />
        </div>
        <div className="field">
          <label htmlFor="hcTheirView">How might they see this?</label>
          <textarea id="hcTheirView" value={hcTheirView} onChange={(e) => setHcTheirView(e.target.value)} placeholder="Their side, argued as well as you can argue it." />
        </div>
        <div className="field">
          <label htmlFor="hcAsk">What are you asking for?</label>
          <textarea id="hcAsk" value={hcAsk} onChange={(e) => setHcAsk(e.target.value)} placeholder="The specific, concrete request." />
        </div>
        <div className="limits" style={{ marginTop: 4 }}>
          This won&rsquo;t tell you whether you&rsquo;re right, and it doesn&rsquo;t know your situation. It&rsquo;s four prompts that slow the conversation down.
        </div>
      </Modal>
    </>
  );
}
