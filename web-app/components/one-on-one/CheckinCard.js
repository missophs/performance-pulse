"use client";

import { useState } from "react";
import { EMP_Q, MGR_Q, followUps } from "@/lib/one-on-one-content";

// Step 1 of Prepare: the adaptive check-in wizard. Purely in-memory unless
// "Save & finish later" is used — that persists progress as an in-progress
// `checkins` row (draft_state) so it survives a closed browser. Finishing
// normally still only writes once, at the end (see completeCheckin).
export default function CheckinCard({
  isMgr,
  assistOn,
  openCheckin,
  checkinDraft,
  setCheckinDraft,
  onComplete,
  onConvertToTopic,
  onSaveDraft,
  initialAnswer,
}) {
  const [answer, setAnswer] = useState(initialAnswer || "");

  const title = isMgr ? "Your prep for this conversation" : "Your check-in";
  const note = isMgr
    ? "Here are some questions to give some thought to before our 1:1. Please be honest and try to come up with answers to these before we talk."
    : "A short conversation instead of a long form. It adapts to what you say.";

  const [resuming, setResuming] = useState(false);

  function startCheckin() {
    const queue = (isMgr ? MGR_Q : EMP_Q).slice();
    setCheckinDraft({ queue, step: 0, asked: [] });
    setAnswer("");
  }

  function advance(value) {
    const d = checkinDraft;
    const q = d.queue[d.step];
    const asked = [...d.asked, { id: q.id, q: q.q, answer: value, followup: !!q.isFollowup }];
    let queue = d.queue;
    const fu = followUps(q.id, value, assistOn);
    if (fu.length) {
      fu.forEach((f) => (f.isFollowup = true));
      queue = [...queue.slice(0, d.step + 1), ...fu, ...queue.slice(d.step + 1)];
    }
    const step = d.step + 1;
    setAnswer("");
    if (step >= queue.length) {
      setCheckinDraft(null);
      onComplete(asked, d.id);
    } else {
      setCheckinDraft({ ...d, queue, step, asked });
    }
  }

  function saveForLater() {
    onSaveDraft({ id: checkinDraft.id, queue: checkinDraft.queue, step: checkinDraft.step, asked: checkinDraft.asked, pendingAnswer: answer });
    setCheckinDraft(null);
    setAnswer("");
  }

  // Revisit the previous question. Drops any follow-ups that were generated
  // by the answer we're about to let the user change, so re-advancing
  // doesn't leave stale or duplicate follow-up questions in the queue.
  function goBack() {
    const d = checkinDraft;
    if (d.step === 0) return;
    const prevStep = d.step - 1;
    let cut = prevStep + 1;
    while (cut < d.queue.length && d.queue[cut].isFollowup) cut++;
    const queue = [...d.queue.slice(0, prevStep + 1), ...d.queue.slice(cut)];
    const asked = d.asked.slice(0, prevStep);
    setAnswer(d.asked[prevStep]?.answer ?? "");
    setCheckinDraft({ ...d, queue, step: prevStep, asked });
  }

  return (
    <>
      <p className="card-note" style={{ margin: "0 0 12px" }}>
        {note}
      </p>

      {checkinDraft && resuming ? (
        <CheckinWizard
          checkinDraft={checkinDraft}
          answer={answer}
          setAnswer={setAnswer}
          advance={advance}
          goBack={goBack}
          saveForLater={saveForLater}
        />
      ) : checkinDraft ? (
        <>
          <p style={{ fontSize: 13.5, color: "var(--ink)", margin: "0 0 12px" }}>
            You have a check-in in progress — question {checkinDraft.step + 1} of {checkinDraft.queue.length}.
          </p>
          <div className="btn-row">
            <button className="btn" onClick={() => setResuming(true)}>
              Resume my check-in
            </button>
          </div>
        </>
      ) : openCheckin ? (
        <>
          <div className="card" style={{ boxShadow: "none", margin: 0, borderRadius: 12, background: "var(--card-2)" }}>
            {openCheckin.asked.map((a, i) => (
              <div className={`qa${a.followup ? " followup" : ""}`} key={i}>
                <div className="q">{a.q}</div>
                <div className="a">{a.answer ? a.answer : <em style={{ color: "var(--faint)" }}>Skipped</em>}</div>
              </div>
            ))}
          </div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn secondary sm" onClick={startCheckin}>
              Start a new check-in
            </button>
            <button className="btn ghost sm" onClick={onConvertToTopic}>
              Add something from this to the agenda
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 6px" }}>You&rsquo;ll be asked (skip any of them):</p>
          <ul style={{ margin: "0 0 12px 20px", fontSize: 13.5, lineHeight: 1.8, color: "var(--ink)" }}>
            {(isMgr ? MGR_Q : EMP_Q).map((x) => (
              <li key={x.id}>{x.q}</li>
            ))}
          </ul>
          <button className="btn" onClick={startCheckin}>
            Start my check-in
          </button>
        </>
      )}
    </>
  );
}

function CheckinWizard({ checkinDraft: d, answer, setAnswer, advance, goBack, saveForLater }) {
  const q = d.queue[d.step];
  return (
    <div key={d.step}>
      <div className="progress-dots">
        {d.queue.map((_, i) => (
          <div className={`dot ${i < d.step ? "done" : i === d.step ? "now" : ""}`} key={i} />
        ))}
      </div>
      {q.coach && (
        <div className="coach">
          <strong>A nudge</strong>
          {q.coach}
        </div>
      )}
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="ciAnswer">{q.q}</label>
        <textarea
          id="ciAnswer"
          autoFocus
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type as much or as little as you like…"
        />
      </div>
      <div className="btn-row">
        {d.step > 0 && (
          <button className="btn ghost sm" onClick={goBack}>
            Back
          </button>
        )}
        <button className="btn" onClick={() => advance(answer.trim())}>
          {d.step === d.queue.length - 1 ? "Finish" : "Next"}
        </button>
        <button className="btn ghost sm" onClick={() => advance("")}>
          Skip
        </button>
        <button className="btn ghost sm" onClick={saveForLater} title="Keep your answers so far and come back later">
          Save &amp; finish later
        </button>
        <span style={{ fontSize: 12, color: "var(--faint)" }}>
          Question {d.step + 1} of {d.queue.length}
        </span>
      </div>
    </div>
  );
}
