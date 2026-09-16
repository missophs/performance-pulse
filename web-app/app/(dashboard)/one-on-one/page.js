"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePulse } from "@/components/PulseContext";
import { useToast } from "@/components/ui/ToastProvider";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import {
  getPair,
  listTopics,
  addTopic,
  setTopicStatus,
  setTopicNotes,
  updateTopic,
  submitTopic,
  deleteTopics,
  getOpenCheckin,
  saveCheckin,
  getCheckinDraft,
  saveCheckinDraftProgress,
  completeCheckinDraft,
  getFormDraft,
  saveFormDraft,
  clearFormDraft,
  saveWrapUp,
  listActions,
  saveAction,
  toggleActionDone,
  deleteAction,
  listCustomSuggestions,
  addCustomSuggestion,
  deleteCustomSuggestion,
  notify,
  updatePair,
} from "@/lib/data";
import { normalizeDraft } from "@/lib/slack-form-fields";

// Matches lib/slack-views.js's TOPIC_FIELDS -- kept as a plain literal here
// instead of importing that file, which pulls in Slack Block Kit builder
// code with no reason to be in this client bundle.
const TOPIC_DRAFT_FIELDS = ["text", "why", "category"];
import { today, fmtDate, isOverdue } from "@/lib/format";
import { actionBadge } from "@/lib/badges";
import { TOPIC_CATEGORIES } from "@/lib/one-on-one-content";
import CheckinCard from "@/components/one-on-one/CheckinCard";
import SuggestionsCard from "@/components/one-on-one/SuggestionsCard";
import TopicList from "@/components/one-on-one/TopicList";
import ActionModal from "@/components/one-on-one/ActionModal";

const EMPTY_WRAP = { discussed: "", agreed: "", revisit: "", start: "", stop: "", keep: "", next: "", checkin90: "" };

export default function OneOnOnePage() {
  const { pairId, role, isMgr, myName, partnerName, supabase } = usePulse();
  const toast = useToast();
  const router = useRouter();
  const otherRole = isMgr ? "employee" : "manager";

  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState("prepare");
  const [pair, setPair] = useState(null);
  const [topics, setTopics] = useState([]);
  const [openCheckin, setOpenCheckin] = useState(null);
  const [customSuggestions, setCustomSuggestions] = useState([]);
  const [actions, setActions] = useState([]);

  const [checkinDraft, setCheckinDraft] = useState(null);
  const [resumeAnswer, setResumeAnswer] = useState("");

  const [topicText, setTopicText] = useState("");
  const [topicCat, setTopicCat] = useState(TOPIC_CATEGORIES[0]);
  const [topicWhy, setTopicWhy] = useState("");
  const [savingTopic, setSavingTopic] = useState(false);

  const [ciModalOpen, setCiModalOpen] = useState(false);
  const [ciPick, setCiPick] = useState(0);
  const [ciCat, setCiCat] = useState("Support needed");

  const [noteTopic, setNoteTopic] = useState(null);
  const [editTopic, setEditTopic] = useState(null);
  const [editText, setEditText] = useState("");
  const [editCat, setEditCat] = useState(TOPIC_CATEGORIES[0]);
  const [editWhy, setEditWhy] = useState("");
  const [noteText, setNoteText] = useState("");

  const [actionModal, setActionModal] = useState(null); // { existing, seed } | null

  const [wrap, setWrap] = useState(EMPTY_WRAP);
  const wrapNextInit = useRef(false);

  async function loadAll() {
    setLoading(true);
    const [p, t, oc, cs, ac, draft, topicDraft] = await Promise.all([
      getPair(supabase, pairId),
      listTopics(supabase, pairId),
      getOpenCheckin(supabase, pairId, role),
      listCustomSuggestions(supabase, pairId),
      listActions(supabase, pairId),
      getCheckinDraft(supabase, pairId, role),
      // Soft-fails: form_drafts is applied by hand via the Supabase SQL
      // Editor (see supabase/migrations/0003_form_drafts.sql), separately
      // from code deploys, so this can 404 for a while after a deploy.
      // That shouldn't take down the whole Prepare tab.
      getFormDraft(supabase, pairId, role, "topic").catch(() => null),
    ]);
    setPair(p);
    setTopics(t);
    setOpenCheckin(oc);
    setCustomSuggestions(cs);
    setActions(ac);
    if (draft) {
      const state = draft.draft_state || { queue: [], step: 0, asked: [] };
      setCheckinDraft({ id: draft.id, queue: state.queue, step: state.step, asked: state.asked });
      setResumeAnswer(state.pendingAnswer || "");
    }
    if (topicDraft?.draft) {
      // A draft saved from Slack mid-session can carry these under
      // "_v2"-suffixed keys instead of the plain ones (see
      // lib/slack-form-fields.js) -- this page didn't know that, so a v2
      // draft used to show up here as empty (SLACK_TODO.md item 0l).
      const d = normalizeDraft(TOPIC_DRAFT_FIELDS, topicDraft.draft);
      setTopicText(d.text || "");
      setTopicCat(d.category || TOPIC_CATEGORIES[0]);
      setTopicWhy(d.why || "");
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairId]);

  useEffect(() => {
    if (!wrapNextInit.current && pair) {
      wrapNextInit.current = true;
      setWrap((w) => (w.next ? w : { ...w, next: pair.next_1on1_date || "" }));
    }
  }, [pair]);

  // Autosave the topic-add form as a draft so it survives a closed tab or a
  // switch away from Prepare. Skipped while the initial load is still
  // populating these fields from a previously-saved draft.
  useEffect(() => {
    if (loading) return;
    const hasContent = topicText.trim() || topicWhy.trim() || topicCat !== TOPIC_CATEGORIES[0];
    const timer = setTimeout(() => {
      if (hasContent) {
        saveFormDraft(supabase, pairId, role, "topic", { text: topicText, category: topicCat, why: topicWhy }).catch(() => {});
      } else {
        clearFormDraft(supabase, pairId, role, "topic").catch(() => {});
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicText, topicCat, topicWhy, loading]);

  if (loading) {
    return (
      <section>
        <h1>My 1:1</h1>
        <p className="subtitle">Loading…</p>
      </section>
    );
  }

  const assistOn = !!pair?.assist_enabled;
  const employeeName = isMgr ? partnerName : myName;
  const managerName = isMgr ? myName : partnerName;
  const owners = [employeeName, managerName, "Both of us"];

  // ------------------------------------------------------------ topics ----

  // Adding a topic no longer pings the partner by itself — see submitTopicRow
  // below. SLACK_TODO.md item 0; Melissa: "Editing or adding a topic is not
  // the submit either."
  async function addTopicRow(text, why, category) {
    await addTopic(supabase, pairId, { text, why: why || "", category, role, name: myName });
    loadAll();
  }

  // The explicit "let them know" action — the only thing that pings the
  // partner about a topic now. submitTopic() no-ops (returns null) if this
  // topic was already submitted, so this can't double-notify on a stale
  // click.
  async function submitTopicRow(t) {
    const submitted = await submitTopic(supabase, t.id, { actorName: myName, actorRole: role, source: "web" });
    if (submitted) {
      await notify(supabase, pairId, `${myName} submitted a topic: ${submitted.text}`, role, otherRole, "oneOnOne", "topic");
    }
    loadAll();
  }

  function goToSub(tab) {
    setSub(tab);
  }

  async function submitTopicForm() {
    const text = topicText.trim();
    if (!text || savingTopic) return;
    setSavingTopic(true);
    try {
      await addTopicRow(text, topicWhy.trim(), topicCat);
      setTopicText("");
      setTopicCat(TOPIC_CATEGORIES[0]);
      setTopicWhy("");
      await clearFormDraft(supabase, pairId, role, "topic").catch(() => {});
      toast("Added", `"${text}" is on the agenda — ${partnerName} will see it under Talk.`);
    } finally {
      setSavingTopic(false);
    }
  }

  async function discardTopicDraft() {
    setTopicText("");
    setTopicCat(TOPIC_CATEGORIES[0]);
    setTopicWhy("");
    await clearFormDraft(supabase, pairId, role, "topic").catch(() => {});
  }

  async function addFromSuggestion(text, category) {
    await addTopicRow(text, "", category);
  }

  async function addFromHardConvo(outcome, body) {
    // submitted: true — this path is deliberately Slack-silent (the notify()
    // right below has no "topic" kind, in-app only), but a normal
    // submitted_at: null topic still shows a Submit button that fires a
    // real Slack DM later (submitTopicRow -> notify(..., "topic")). Creating
    // it already-submitted, the same backfill used for pre-existing topics
    // in migration 0009_topic_submit_flag.sql, closes that gap completely
    // instead of just at creation time.
    await addTopic(supabase, pairId, { text: outcome, why: body, category: "Other", role, name: myName, submitted: true });
    // No "topic" kind here on purpose — an in-app-only notification, not a
    // real Slack DM, same exemption this path had before topic-add batching
    // (and now submit-gating, see submitTopicRow) existed for the "topic"
    // kind itself.
    await notify(supabase, pairId, `${myName} added a topic to the agenda`, role, otherRole, "oneOnOne");
    loadAll();
  }

  async function saveCustomSuggestion(text, category) {
    await addCustomSuggestion(supabase, pairId, role, text, category);
    loadAll();
  }

  async function removeCustomSuggestion(id) {
    await deleteCustomSuggestion(supabase, id);
    loadAll();
  }

  async function changeTopicStatus(t, status) {
    await setTopicStatus(supabase, t.id, status, { actorName: myName, actorRole: role, source: "web" });
    await notify(supabase, pairId, `Topic marked ${status}: ${t.text}`, role, otherRole, "oneOnOne");
    loadAll();
  }

  function openNoteModal(t) {
    setNoteTopic(t);
    setNoteText(t.notes || "");
  }

  async function saveNote() {
    if (!noteTopic) return;
    await setTopicNotes(supabase, noteTopic.id, noteText);
    setNoteTopic(null);
    loadAll();
  }

  function openEditModal(t) {
    setEditTopic(t);
    setEditText(t.text);
    setEditCat(t.category);
    setEditWhy(t.why || "");
  }

  async function saveEditTopic() {
    if (!editTopic) return;
    const text = editText.trim();
    if (!text) return;
    await updateTopic(
      supabase,
      editTopic.id,
      { text, why: editWhy.trim(), category: editCat },
      { actorName: myName, actorRole: role, source: "web" }
    );
    setEditTopic(null);
    loadAll();
  }

  async function removeTopic(t) {
    if (!window.confirm(`Remove "${t.text}" from the agenda?`)) return;
    await deleteTopics(supabase, [t.id]);
    loadAll();
  }

  // ----------------------------------------------------------- check-in ----

  async function completeCheckin(asked, draftId) {
    if (draftId) await completeCheckinDraft(supabase, draftId, asked);
    else await saveCheckin(supabase, pairId, role, asked);
    await notify(supabase, pairId, `${isMgr ? "Manager" : "Employee"} check-in completed by ${myName}`, role, otherRole, "oneOnOne");
    loadAll();
  }

  async function saveCheckinDraft({ id, queue, step, asked, pendingAnswer }) {
    await saveCheckinDraftProgress(supabase, pairId, role, id, { queue, step, asked, pendingAnswer });
    toast("Saved", "Your check-in is waiting for you — pick it up anytime from My 1:1.");
    setResumeAnswer("");
    loadAll();
  }

  function openCheckinToTopic() {
    if (!openCheckin || !openCheckin.asked.some((a) => a.answer)) {
      window.alert("Nothing in that check-in to add yet.");
      return;
    }
    setCiPick(openCheckin.asked.findIndex((a) => a.answer));
    setCiCat("Support needed");
    setCiModalOpen(true);
  }

  async function saveCheckinToTopic() {
    const pick = openCheckin.asked[ciPick];
    if (!pick) return;
    await addTopic(supabase, pairId, {
      text: pick.answer,
      why: "From my check-in: " + pick.q.replace(/<[^>]*>/g, ""),
      category: ciCat,
      role,
      name: myName,
    });
    await notify(supabase, pairId, `${myName} added a topic from their check-in`, role, otherRole, "oneOnOne");
    setCiModalOpen(false);
    loadAll();
  }

  // ------------------------------------------------------------ actions ----

  async function saveActionModal(form) {
    const existing = actionModal?.existing;
    await saveAction(
      supabase,
      pairId,
      {
        id: existing?.id,
        text: form.text,
        owner: form.owner,
        due: form.due,
        status: form.status,
        related: form.related,
        notes: form.notes,
      },
      myName
    );
    if (!existing) {
      await notify(supabase, pairId, `${myName} added an action: ${form.text}`, role, otherRole, "actions", "action");
    }
    setActionModal(null);
    loadAll();
  }

  async function toggleAction(a) {
    await toggleActionDone(supabase, a.id, a.status !== "Done", { actorName: myName, actorRole: role, source: "web" });
    loadAll();
  }

  async function removeAction(a) {
    if (!window.confirm(`Remove "${a.text}"?`)) return;
    await deleteAction(supabase, a.id);
    loadAll();
  }

  // -------------------------------------------------------------- wrap ----

  function setWrapField(field, value) {
    setWrap((w) => ({ ...w, [field]: value }));
  }

  async function saveWrap() {
    if (!wrap.discussed.trim() && !wrap.agreed.trim()) {
      window.alert("Add at least what you discussed or what you agreed on before closing out.");
      return;
    }
    const closed = topics.filter((t) => t.status === "Discussed" || t.status === "Resolved");
    const fields = {
      date: pair?.next_1on1_date || today(),
      time: pair?.next_1on1_time || null,
      discussed: wrap.discussed.trim(),
      agreed: wrap.agreed.trim(),
      revisit: wrap.revisit.trim(),
      start: wrap.start.trim(),
      stop: wrap.stop.trim(),
      keep: wrap.keep.trim(),
      checkin90: wrap.checkin90 || null,
      topicsSnapshot: closed.map((t) => ({ text: t.text, cat: t.category, status: t.status, notes: t.notes })),
    };
    await saveWrapUp(supabase, pairId, fields, closed.map((t) => t.id), myName);
    if (wrap.next) {
      await updatePair(supabase, pairId, { next_1on1_date: wrap.next });
    }
    await notify(supabase, pairId, `1:1 summary saved by ${myName}`, role, otherRole, "oneOnOne", "wrap");
    toast("Saved", "This 1:1 has been filed to History.");
    wrapNextInit.current = false;
    setWrap(EMPTY_WRAP);
    router.push("/history");
  }

  function clearWrap() {
    if (!window.confirm("Clear everything typed into this wrap-up? Closed-out 1:1s in History are not affected.")) return;
    setWrap(EMPTY_WRAP);
  }

  // ---------------------------------------------------------------- ui ----

  const talkTopics = topics.filter((t) => t.status !== "Parking Lot");
  const parkingTopics = topics.filter((t) => t.status === "Parking Lot");
  const openActions = actions.filter((a) => a.status !== "Done").slice(0, 8);

  return (
    <section>
      <h1>My 1:1</h1>
      <p className="subtitle">Prepare, talk, reflect, act, follow up — one conversation at a time.</p>

      <div className="tabs">
        <button className={`tab${sub === "prepare" ? " active" : ""}`} onClick={() => goToSub("prepare")}>
          1. Prepare
        </button>
        <button className={`tab${sub === "talk" ? " active" : ""}`} onClick={() => goToSub("talk")}>
          2. Talk
        </button>
        <button className={`tab${sub === "wrap" ? " active" : ""}`} onClick={() => goToSub("wrap")}>
          3. Wrap up
        </button>
      </div>

      {sub === "prepare" && (
        <div className="subview active">
          <div className="step">
            <div className="step-head">
              <div className="step-num">1</div>
              <div>
                <span className="kicker">Prepare</span>
                <h3>{isMgr ? "Your prep for this conversation" : "Your check-in"}</h3>
              </div>
            </div>
            <CheckinCard
              isMgr={isMgr}
              assistOn={assistOn}
              openCheckin={openCheckin}
              checkinDraft={checkinDraft}
              setCheckinDraft={setCheckinDraft}
              onComplete={completeCheckin}
              onConvertToTopic={openCheckinToTopic}
              onSaveDraft={saveCheckinDraft}
              initialAnswer={resumeAnswer}
            />
          </div>

          <div className="step">
            <div className="step-head">
              <div className="step-num">2</div>
              <div>
                <span className="kicker">Prepare</span>
                <h3>Suggested questions</h3>
              </div>
            </div>
            <SuggestionsCard
              role={role}
              isMgr={isMgr}
              partnerName={partnerName}
              customSuggestions={customSuggestions}
              onAdd={addFromSuggestion}
              onSaveCustom={saveCustomSuggestion}
              onDeleteCustom={removeCustomSuggestion}
              onAddHardConvo={addFromHardConvo}
            />
          </div>

          <div className="step">
            <div className="step-head">
              <div className="step-num">3</div>
              <div>
                <span className="kicker">Prepare</span>
                <h3>Add something to discuss</h3>
              </div>
            </div>
            <p className="card-note">Both of you can add topics before the meeting. The other person sees them right away.</p>
            <div className="row">
              <div className="field" style={{ flex: 2 }}>
                <label htmlFor="topicText">I want to discuss…</label>
                <input id="topicText" type="text" autoComplete="off" value={topicText} onChange={(e) => setTopicText(e.target.value)} placeholder="e.g. How we're staffing the Q3 rollout" />
              </div>
              <div className="field">
                <label htmlFor="topicCat">Category</label>
                <select id="topicCat" value={topicCat} onChange={(e) => setTopicCat(e.target.value)}>
                  {TOPIC_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="topicWhy">
                Why it matters <span style={{ fontWeight: 400, textTransform: "none" }}>(optional)</span>
              </label>
              <textarea id="topicWhy" value={topicWhy} onChange={(e) => setTopicWhy(e.target.value)} placeholder="A sentence of context so the conversation starts warm." />
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" onClick={submitTopicForm} disabled={savingTopic}>
                {savingTopic ? "Adding…" : "Add topic"}
              </button>
              {(topicText.trim() || topicWhy.trim() || topicCat !== TOPIC_CATEGORIES[0]) && (
                <button className="btn ghost" onClick={discardTopicDraft}>
                  Discard
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {sub === "talk" && (
        <div className="subview active">
          <button className="btn ghost sm" style={{ marginBottom: 10 }} onClick={() => setSub("prepare")}>
            ← Back to Prepare
          </button>
          <div className="card">
            <h2>Agenda</h2>
            <p className="card-note">Mark each topic as you go. Add a note or turn it straight into an action.</p>
            <TopicList
              items={talkTopics}
              emptyTitle="No topics yet"
              emptyBody="Add something in Prepare to get started."
              viewerRole={role}
              onStatusChange={changeTopicStatus}
              onNote={openNoteModal}
              onEdit={openEditModal}
              onSubmit={submitTopicRow}
              onAction={(t) => setActionModal({ existing: null, seed: { text: "", related: `Topic: ${t.text}` } })}
              onDelete={removeTopic}
            />
          </div>
          <div className="card">
            <h2>Parking lot</h2>
            <p className="card-note">Worth talking about — just not today.</p>
            <TopicList
              items={parkingTopics}
              emptyTitle="Parking lot is empty"
              emptyBody="Anything you defer will land here."
              viewerRole={role}
              onStatusChange={changeTopicStatus}
              onNote={openNoteModal}
              onEdit={openEditModal}
              onSubmit={submitTopicRow}
              onAction={(t) => setActionModal({ existing: null, seed: { text: "", related: `Topic: ${t.text}` } })}
              onDelete={removeTopic}
            />
          </div>
        </div>
      )}

      {sub === "wrap" && (
        <div className="subview active">
          <button className="btn ghost sm" style={{ marginBottom: 10 }} onClick={() => setSub("talk")}>
            ← Back to Talk — nothing typed here is lost
          </button>
          <div className="card">
            <h2>Wrap up this conversation</h2>
            <p className="card-note">
              A short summary you can both look back on. It answers: what happened, what matters, what we&rsquo;ll do, how we&rsquo;ll grow, and when we talk again.
            </p>
            <div className="field">
              <label htmlFor="wrapDiscussed">What we discussed</label>
              <textarea id="wrapDiscussed" value={wrap.discussed} onChange={(e) => setWrapField("discussed", e.target.value)} placeholder="From our last meeting — the headline of what you talked about." />
            </div>
            <div className="field">
              <label htmlFor="wrapAgreed">What we agreed on</label>
              <textarea id="wrapAgreed" value={wrap.agreed} onChange={(e) => setWrapField("agreed", e.target.value)} placeholder="Decisions, expectations, anything you both signed up for." />
            </div>
            <div className="field">
              <label htmlFor="wrapRevisit">Topics to revisit next time</label>
              <textarea id="wrapRevisit" value={wrap.revisit} onChange={(e) => setWrapField("revisit", e.target.value)} placeholder="Anything you ran out of time for." />
            </div>
            <div className="field" style={{ marginTop: 4 }}>
              <label>Start · Stop · Continue — the only rating here. No numbers, no scores.</label>
            </div>
            <div className="field">
              <label htmlFor="wrapStart">Start</label>
              <input id="wrapStart" type="text" autoComplete="off" value={wrap.start} onChange={(e) => setWrapField("start", e.target.value)} placeholder="One thing to start doing" />
            </div>
            <div className="field">
              <label htmlFor="wrapStop">Stop</label>
              <input id="wrapStop" type="text" autoComplete="off" value={wrap.stop} onChange={(e) => setWrapField("stop", e.target.value)} placeholder="One thing to stop doing" />
            </div>
            <div className="field">
              <label htmlFor="wrapContinue">Continue</label>
              <input id="wrapContinue" type="text" autoComplete="off" value={wrap.keep} onChange={(e) => setWrapField("keep", e.target.value)} placeholder="One thing that works — keep doing it" />
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="wrapNext">Next conversation</label>
                <input id="wrapNext" type="date" value={wrap.next} onChange={(e) => setWrapField("next", e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="wrapCheckin">We will check in with you in 90 days — on</label>
                <input id="wrapCheckin" type="date" value={wrap.checkin90} onChange={(e) => setWrapField("checkin90", e.target.value)} />
              </div>
            </div>
            <div className="btn-row">
              <button className="btn" onClick={saveWrap}>
                Save summary &amp; close out this 1:1
              </button>
              <button className="btn ghost" onClick={clearWrap}>
                Reset this form
              </button>
            </div>
            <p className="card-note" style={{ marginTop: 10, marginBottom: 0 }}>
              Closing out files this conversation in History, clears discussed topics, and keeps anything marked Follow up or Parking lot on the agenda.
            </p>
          </div>
          <div className="card">
            <h2>Actions from this conversation</h2>
            {openActions.length === 0 ? (
              <div className="empty">
                <div className="big">No actions yet</div>
                Add what you both agreed to do.
              </div>
            ) : (
              <ul className="list">
                {openActions.map((a) => {
                  const overdue = isOverdue(a.due_date, a.status);
                  const badge = actionBadge(a, overdue);
                  return (
                    <li key={a.id}>
                      <div className="item-body">
                        <div className="item-text">{a.text}</div>
                        {a.notes && (
                          <div className="item-sub" style={{ whiteSpace: "pre-wrap" }}>
                            {a.notes}
                          </div>
                        )}
                        {a.related && (
                          <div className="item-sub" style={{ color: "var(--faint)" }}>
                            {a.related}
                          </div>
                        )}
                        <div className="item-meta">
                          <Badge cls={badge.cls}>{badge.label}</Badge>
                          <span>
                            {a.owner_label}
                            {a.due_date ? ` · due ${fmtDate(a.due_date)}` : " · no date"}
                          </span>
                        </div>
                      </div>
                      <div className="item-actions">
                        <button className={`btn ${a.status === "Done" ? "ghost" : "secondary"} sm`} onClick={() => toggleAction(a)}>
                          {a.status === "Done" ? "Reopen" : "Done"}
                        </button>
                        <button className="btn ghost sm" onClick={() => setActionModal({ existing: a, seed: null })}>
                          Edit
                        </button>
                        <button className="btn ghost sm" onClick={() => removeAction(a)}>
                          Remove
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <button className="btn secondary sm" style={{ marginTop: 10 }} onClick={() => setActionModal({ existing: null, seed: null })}>
              Add an action
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------- modals */}

      <Modal
        open={ciModalOpen}
        title="Add to the agenda"
        note={`Pick something from your check-in to put in front of ${partnerName}.`}
        onClose={() => setCiModalOpen(false)}
        onSave={saveCheckinToTopic}
        saveLabel="Add topic"
      >
        {openCheckin && (
          <>
            <div className="field">
              <label htmlFor="ciPick">From your check-in</label>
              <select id="ciPick" value={ciPick} onChange={(e) => setCiPick(parseInt(e.target.value, 10))}>
                {openCheckin.asked
                  .map((a, i) => ({ ...a, i }))
                  .filter((a) => a.answer)
                  .map((a) => (
                    <option key={a.i} value={a.i}>
                      {a.answer.length > 70 ? a.answer.slice(0, 70) + "…" : a.answer}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ciCat">Category</label>
              <select id="ciCat" value={ciCat} onChange={(e) => setCiCat(e.target.value)}>
                {TOPIC_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={!!noteTopic}
        title="Note on this topic"
        note={noteTopic?.text}
        onClose={() => setNoteTopic(null)}
        onSave={saveNote}
        saveLabel="Save"
      >
        <div className="field">
          <label htmlFor="tNote">What came up</label>
          <textarea id="tNote" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="What did you actually say and decide?" />
        </div>
      </Modal>

      <Modal
        open={!!editTopic}
        title="Edit topic"
        onClose={() => setEditTopic(null)}
        onSave={saveEditTopic}
        saveLabel="Save changes"
        saveDisabled={!editText.trim()}
      >
        <div className="row">
          <div className="field" style={{ flex: 2 }}>
            <label htmlFor="editTopicText">I want to discuss…</label>
            <input id="editTopicText" type="text" autoComplete="off" value={editText} onChange={(e) => setEditText(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="editTopicCat">Category</label>
            <select id="editTopicCat" value={editCat} onChange={(e) => setEditCat(e.target.value)}>
              {/* A topic added from a suggestion can carry a category that isn't
                  in this fixed list (e.g. "Where I stand" from the suggestion
                  library) — without this, <select> can't match `value` to any
                  <option> and silently falls back to showing (and then saving)
                  the first one instead, changing the category as a side effect
                  of an edit that never touched it. */}
              {(TOPIC_CATEGORIES.includes(editCat) ? TOPIC_CATEGORIES : [...TOPIC_CATEGORIES, editCat]).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="editTopicWhy">
            Why it matters <span style={{ fontWeight: 400, textTransform: "none" }}>(optional)</span>
          </label>
          <textarea id="editTopicWhy" value={editWhy} onChange={(e) => setEditWhy(e.target.value)} />
        </div>
      </Modal>

      <ActionModal
        open={!!actionModal}
        existing={actionModal?.existing}
        seed={actionModal?.seed}
        owners={owners}
        defaultOwner={myName}
        onClose={() => setActionModal(null)}
        onSave={saveActionModal}
      />
    </section>
  );
}
