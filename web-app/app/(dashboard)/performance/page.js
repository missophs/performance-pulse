"use client";

import { useEffect, useRef, useState } from "react";
import { usePulse } from "@/components/PulseContext";
import { useToast } from "@/components/ui/ToastProvider";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import { roleBadge } from "@/lib/badges";
import { fmtDate, ago, today } from "@/lib/format";
import { isVague } from "@/components/performance/vague";
import {
  getPair,
  listAchievements,
  addAchievement,
  deleteAchievement,
  listFeedback,
  addFeedback,
  respondToFeedback,
  listFeedbackRequests,
  addFeedbackRequest,
  setFeedbackRequestStatus,
  getReviewDraft,
  saveReviewDraft,
  getFormDraft,
  saveFormDraft,
  clearFormDraft,
  listGoals,
  listDevelopmentPlans,
  listCareerAnswers,
  listConcerns,
  addConcern,
  shareConcern,
  respondToConcern,
  deleteConcern,
  notify,
} from "@/lib/data";

const ACH_CATS = [
  "Business results", "Customer impact", "Collaboration", "Leadership", "Problem solving",
  "Innovation", "Operational improvement", "Team contribution", "Other",
];
const MGR_FB = ["Recognition", "Coaching", "Performance feedback", "Expectations", "Development feedback"];
const EMP_FB = ["What's working", "What could improve", "Support I need", "What would help me succeed"];
const TABS = [
  { id: "achievements", label: "Achievements" },
  { id: "feedback", label: "Feedback" },
  { id: "concerns", label: "Concerns" },
  { id: "review", label: "Review prep" },
];

export default function PerformancePage() {
  const { pairId, role, isMgr, myName, partnerName, supabase } = usePulse();
  const toast = useToast();
  const otherRole = role === "manager" ? "employee" : "manager";
  const fbTypes = isMgr ? MGR_FB : EMP_FB;

  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState("achievements");
  const [pair, setPair] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [feedbackRequests, setFeedbackRequests] = useState([]);
  const [goals, setGoals] = useState([]);
  const [devPlans, setDevPlans] = useState([]);
  const [career, setCareer] = useState([]);
  const [concerns, setConcerns] = useState([]);
  const [reviewDraft, setReviewDraft] = useState("");

  const assistOn = pair ? pair.assist_enabled !== false : true;

  async function loadAll() {
    setLoading(true);
    const [p, ach, fb, fbReq, g, dp, ca, co, rd] = await Promise.all([
      getPair(supabase, pairId),
      listAchievements(supabase, pairId),
      listFeedback(supabase, pairId),
      listFeedbackRequests(supabase, pairId),
      listGoals(supabase, pairId),
      listDevelopmentPlans(supabase, pairId),
      listCareerAnswers(supabase, pairId),
      listConcerns(supabase, pairId),
      getReviewDraft(supabase, pairId, role),
    ]);
    setPair(p);
    setAchievements(ach);
    setFeedback(fb);
    setFeedbackRequests(fbReq);
    setGoals(g);
    setDevPlans(dp);
    setCareer(ca);
    setConcerns(co);
    setReviewDraft(rd?.draft || "");
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairId]);

  /* ------------------------------------------------------- achievements -- */

  const [achOpen, setAchOpen] = useState(false);
  const [achTitle, setAchTitle] = useState("");
  const [achCat, setAchCat] = useState(ACH_CATS[0]);
  const [achImpact, setAchImpact] = useState("");
  const [achDate, setAchDate] = useState(today());
  const achTitleRef = useRef(null);

  async function openAchievementModal() {
    const draft = await getFormDraft(supabase, pairId, role, "achievement").catch(() => null);
    const d = draft?.draft;
    setAchTitle(d?.title || "");
    setAchCat(d?.category || ACH_CATS[0]);
    setAchImpact(d?.impact || "");
    setAchDate(d?.date || today());
    setAchOpen(true);
  }

  // Autosave a draft so closing the modal without saving doesn't lose it.
  useEffect(() => {
    if (!achOpen) return;
    const hasContent = achTitle.trim() || achImpact.trim() || achCat !== ACH_CATS[0];
    const timer = setTimeout(() => {
      if (hasContent) saveFormDraft(supabase, pairId, role, "achievement", { title: achTitle, category: achCat, impact: achImpact, date: achDate }).catch(() => {});
      else clearFormDraft(supabase, pairId, role, "achievement").catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [achTitle, achCat, achImpact, achDate, achOpen]);

  async function discardAchievementDraft() {
    setAchTitle("");
    setAchCat(ACH_CATS[0]);
    setAchImpact("");
    setAchDate(today());
    await clearFormDraft(supabase, pairId, role, "achievement").catch(() => {});
  }

  async function saveAchievement() {
    const title = achTitle.trim();
    if (!title) {
      achTitleRef.current?.focus();
      return;
    }
    await addAchievement(supabase, pairId, {
      title, category: achCat, impact: achImpact.trim(), date: achDate || today(), role, name: myName,
    });
    setAchOpen(false);
    await clearFormDraft(supabase, pairId, role, "achievement").catch(() => {});
    await notify(supabase, pairId, `${myName} logged an achievement: ${title}`, role, otherRole, "performance", "achievement");
    toast("Saved", "Added to your achievements.");
    loadAll();
  }

  async function removeAchievement(id) {
    await deleteAchievement(supabase, id);
    loadAll();
  }

  /* ------------------------------------------------------------ feedback - */

  const [fbOpen, setFbOpen] = useState(false);
  const [fbMode, setFbMode] = useState("give"); // "give" | "answer"
  const [fbRequestId, setFbRequestId] = useState(null);
  const [fbRequestAbout, setFbRequestAbout] = useState("");
  const [fbType, setFbType] = useState(fbTypes[0]);
  const [fbText, setFbText] = useState("");
  const [fbExample, setFbExample] = useState("");
  const [fbShowCoach, setFbShowCoach] = useState(false);
  const fbTextRef = useRef(null);

  const [respondingId, setRespondingId] = useState(null);
  const [responseText, setResponseText] = useState("");

  function openRespond(f) {
    setRespondingId(f.id);
    setResponseText(f.response || "");
  }

  async function submitResponse(f) {
    const text = responseText.trim();
    if (!text) return;
    await respondToFeedback(supabase, f.id, text);
    setRespondingId(null);
    setResponseText("");
    await notify(supabase, pairId, `${myName} responded to your feedback`, role, otherRole, "performance", "feedback");
    toast("Sent", `${partnerName} can see your response.`);
    loadAll();
  }

  async function openGiveFeedback() {
    setFbMode("give");
    setFbRequestId(null);
    setFbRequestAbout("");
    const draft = await getFormDraft(supabase, pairId, role, "feedback").catch(() => null);
    const d = draft?.draft;
    setFbType(d?.type || fbTypes[0]);
    setFbText(d?.text || "");
    setFbExample(d?.example || "");
    setFbShowCoach(false);
    setFbOpen(true);
  }

  // Autosave a draft, "give" mode only — "answer" mode is tied to a
  // specific feedback request and isn't a standalone draft.
  useEffect(() => {
    if (!fbOpen || fbMode !== "give") return;
    const hasContent = fbText.trim() || fbExample.trim() || fbType !== fbTypes[0];
    const timer = setTimeout(() => {
      if (hasContent) saveFormDraft(supabase, pairId, role, "feedback", { type: fbType, text: fbText, example: fbExample }).catch(() => {});
      else clearFormDraft(supabase, pairId, role, "feedback").catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fbText, fbExample, fbType, fbOpen, fbMode]);

  async function discardFeedbackDraft() {
    setFbType(fbTypes[0]);
    setFbText("");
    setFbExample("");
    setFbShowCoach(false);
    await clearFormDraft(supabase, pairId, role, "feedback").catch(() => {});
  }

  function openAnswerRequest(req) {
    setFbMode("answer");
    setFbRequestId(req.id);
    setFbRequestAbout(req.about);
    setFbType(fbTypes[0]);
    setFbText("");
    setFbExample("");
    setFbShowCoach(false);
    setFbOpen(true);
  }

  async function saveFeedback(bypassCoach) {
    const text = fbText.trim();
    if (!text) {
      fbTextRef.current?.focus();
      return;
    }
    const example = fbExample.trim();
    if (!bypassCoach && assistOn && isVague(text) && !example) {
      setFbShowCoach(true);
      return;
    }
    await addFeedback(supabase, pairId, {
      giverRole: role, fromName: myName, toName: partnerName, type: fbType, text, example,
    });
    if (fbMode === "answer" && fbRequestId) {
      await setFeedbackRequestStatus(supabase, fbRequestId, "closed", { actorName: myName, actorRole: role, source: "web" });
    }
    setFbOpen(false);
    if (fbMode === "give") await clearFormDraft(supabase, pairId, role, "feedback").catch(() => {});
    const msg = fbMode === "answer" ? `${myName} answered your feedback request` : `${myName} gave you feedback`;
    await notify(supabase, pairId, msg, role, otherRole, "performance", "feedback");
    toast("Sent", `${partnerName} can see this in Feedback.`);
    loadAll();
  }

  const [frOpen, setFrOpen] = useState(false);
  const [frAbout, setFrAbout] = useState("");
  const [frWhy, setFrWhy] = useState("");
  const frAboutRef = useRef(null);

  function openRequestModal() {
    setFrAbout("");
    setFrWhy("");
    setFrOpen(true);
  }

  async function saveRequest() {
    const about = frAbout.trim();
    if (!about) {
      frAboutRef.current?.focus();
      return;
    }
    const req = await addFeedbackRequest(supabase, pairId, { fromRole: role, fromName: myName, about, why: frWhy.trim() });
    setFrOpen(false);
    // entity_id so a Slack DM built from this notification can thread the
    // request id through its "Answer it" button (see SLACK_TODO.md item 0e).
    await notify(supabase, pairId, `${myName} asked you for feedback`, role, otherRole, "performance", "request", req.id);
    toast("Sent", `${partnerName} will see your request.`);
    loadAll();
  }

  async function closeRequest(id) {
    await setFeedbackRequestStatus(supabase, id, "closed", { actorName: myName, actorRole: role, source: "web" });
    loadAll();
  }

  /* ------------------------------------------------------------- concerns - */

  const [ccOpen, setCcOpen] = useState(false);
  const [ccWhat, setCcWhat] = useState("");
  const [ccDate, setCcDate] = useState(today());
  const [ccExpectation, setCcExpectation] = useState("");
  const [ccCommunicated, setCcCommunicated] = useState("");
  const [ccPreviously, setCcPreviously] = useState("");
  const [ccSupport, setCcSupport] = useState("");
  const ccWhatRef = useRef(null);

  const [ccRespondingId, setCcRespondingId] = useState(null);
  const [ccResponseText, setCcResponseText] = useState("");

  function openConcernModal() {
    setCcWhat("");
    setCcDate(today());
    setCcExpectation("");
    setCcCommunicated("");
    setCcPreviously("");
    setCcSupport("");
    setCcOpen(true);
  }

  async function saveConcern() {
    const what = ccWhat.trim();
    if (!what) {
      ccWhatRef.current?.focus();
      return;
    }
    await addConcern(supabase, pairId, {
      what, concernDate: ccDate, expectation: ccExpectation.trim(), communicated: ccCommunicated.trim(),
      previously: ccPreviously.trim(), support: ccSupport.trim(), createdByName: myName,
    });
    setCcOpen(false);
    toast("Saved", "Not visible to them until you share it.");
    loadAll();
  }

  async function shareConcernNow(id) {
    await shareConcern(supabase, id);
    await notify(supabase, pairId, `${myName} shared something with you in Concerns`, role, otherRole, "performance", "concern");
    toast("Shared", `${partnerName} can now see this and respond.`);
    loadAll();
  }

  async function removeConcern(id) {
    await deleteConcern(supabase, id);
    loadAll();
  }

  function openConcernRespond(c) {
    setCcRespondingId(c.id);
    setCcResponseText(c.response || "");
  }

  async function submitConcernResponse(c) {
    const text = ccResponseText.trim();
    if (!text) return;
    await respondToConcern(supabase, c.id, text);
    setCcRespondingId(null);
    setCcResponseText("");
    await notify(supabase, pairId, `${myName} responded in Concerns`, role, otherRole, "performance", "concern");
    toast("Sent", `${partnerName} can see your response.`);
    loadAll();
  }

  /* -------------------------------------------------------------- review - */

  function buildDraftText() {
    const L = [];
    L.push(isMgr ? `REVIEW PREPARATION — ${partnerName}` : "MY REVIEW PREPARATION");
    L.push(`Prepared by ${myName} on ${new Date().toLocaleDateString()}`);
    L.push("This is a draft for discussion. It is not a rating and has not been shared with anyone.");
    L.push("");

    L.push("MAJOR ACCOMPLISHMENTS");
    if (achievements.length) {
      achievements.forEach((a) => {
        L.push(`• ${a.title} (${a.category}, ${a.achievement_date || ""})`);
        if (a.impact) L.push(`   Impact: ${a.impact}`);
      });
    } else L.push("• Nothing logged yet.");
    L.push("");

    const done = goals.filter((g) => g.status === "Complete");
    const open = goals.filter((g) => g.status !== "Complete" && g.status !== "Deferred");
    L.push("GOALS COMPLETED");
    if (done.length) done.forEach((g) => L.push(`• ${g.text}${g.measure ? " — " + g.measure : ""}`));
    else L.push("• None marked complete yet.");
    L.push("");
    L.push("GOALS STILL IN PROGRESS");
    if (open.length) {
      open.forEach((g) => {
        L.push(`• ${g.text} — ${g.status}, ${g.progress || 0}%`);
        if (g.obstacles) L.push(`   In the way: ${g.obstacles}`);
      });
    } else L.push("• None open.");
    L.push("");

    L.push(`FEEDBACK ${isMgr ? "GIVEN AND RECEIVED" : "RECEIVED"}`);
    if (feedback.length) {
      feedback.forEach((f) => {
        L.push(`• [${f.type}] ${f.from_name} to ${f.to_name}: ${f.text}`);
        if (f.example) L.push(`   Example: ${f.example}`);
      });
    } else L.push("• None recorded.");
    L.push("");

    L.push("DEVELOPMENT");
    if (devPlans.length) {
      devPlans.forEach((d) => {
        L.push(`• ${d.area} (${d.type}) — ${d.status}`);
        if (d.activity) L.push(`   Activity: ${d.activity}`);
        if (d.measure) L.push(`   Success measure: ${d.measure}`);
      });
    } else L.push("• Nothing in flight.");
    L.push("");

    L.push("CAREER CONVERSATIONS");
    if (career.length) {
      career.forEach((c) => L.push(`• ${c.question}\n   ${c.answer}  (${c.created_by_name})`));
    } else L.push("• None recorded.");
    L.push("");

    L.push("CHALLENGES AND SUPPORT NEEDED");
    const obstacles = goals.filter((g) => g.obstacles);
    if (obstacles.length) obstacles.forEach((g) => L.push(`• ${g.text}: ${g.obstacles}`));
    else L.push("• Nothing flagged.");
    L.push("");

    L.push("WHAT'S NEXT");
    L.push("• [Add the goals and focus areas you want for the next period.]");

    return L.join("\n");
  }

  async function buildDraft() {
    const text = buildDraftText();
    setReviewDraft(text);
    await saveReviewDraft(supabase, pairId, role, text);
    toast("Draft built", "Pulled in your accomplishments, goals, feedback and development. Edit freely below.");
  }

  async function saveDraft() {
    await saveReviewDraft(supabase, pairId, role, reviewDraft);
    toast("Saved", "Your draft was updated.");
  }

  if (loading) return <section><h1>Performance</h1><p className="subtitle">Loading…</p></section>;

  const openRequests = feedbackRequests.filter((r) => r.status === "open");

  return (
    <section>
      <h1>Performance</h1>
      <p className="subtitle">What's been accomplished, what feedback you've traded, and what to raise. No scores, no rankings.</p>

      <div className="tabs">
        {TABS.filter((t) => !t.mgrOnly || isMgr).map((t) => (
          <button
            key={t.id}
            className={`tab${subTab === t.id ? " active" : ""}`}
            onClick={() => setSubTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "achievements" && (
        <div className="subview active">
          <div className="card">
            <div className="card-head">
              <h2>Achievements</h2>
              <button className="btn sm" onClick={openAchievementModal}>Add an achievement</button>
            </div>
            <p className="card-note">Capture the good stuff as it happens, so review time isn't a memory test.</p>
            {achievements.length === 0 ? (
              <div className="empty"><div className="big">Nothing logged yet</div>Add wins as they happen — future you will be grateful at review time.</div>
            ) : (
              <ul className="list">
                {achievements.map((a) => (
                  <li key={a.id}>
                    <div className="item-body">
                      <div className="item-text">{a.title}</div>
                      {a.impact && <div className="item-sub">{a.impact}</div>}
                      <div className="item-meta">
                        <Badge cls="b-green">{a.category}</Badge>
                        <span>{fmtDate(a.achievement_date)} · logged by {a.created_by_name}</span>
                      </div>
                    </div>
                    <div className="item-actions">
                      <button className="btn ghost sm" onClick={() => removeAchievement(a.id)}>Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {subTab === "feedback" && (
        <div className="subview active">
          <div className="card">
            <div className="card-head">
              <h2>Feedback</h2>
              <div className="btn-row">
                <button className="btn ghost sm" onClick={openRequestModal}>Ask for feedback</button>
                {isMgr && <button className="btn sm" onClick={openGiveFeedback}>Give feedback</button>}
              </div>
            </div>
            <p className="card-note">
              {isMgr
                ? `What you write is visible to ${partnerName} straight away.`
                : `Feedback from ${partnerName} shows up here. You can respond to any of it below.`}
            </p>

            {openRequests.length > 0 && (
              <div>
                {openRequests.map((r) => {
                  const forMe = r.from_role !== role;
                  return (
                    <div className="nudge" style={{ marginBottom: 10 }} key={r.id}>
                      <div>
                        <strong>{forMe ? `${r.from_name} asked you for feedback` : `You asked ${partnerName} for feedback`}</strong>
                        <div style={{ marginTop: 3 }}>{r.about}</div>
                        {r.why && <div style={{ marginTop: 3, fontSize: 12 }}>{r.why}</div>}
                      </div>
                      <div className="btn-row">
                        {forMe && <button className="btn sm" onClick={() => openAnswerRequest(r)}>Answer</button>}
                        <button className="btn ghost sm" onClick={() => closeRequest(r.id)}>{forMe ? "Dismiss" : "Withdraw"}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {feedback.length === 0 ? (
              <div className="empty"><div className="big">No feedback yet</div>{isMgr ? "Recognition counts as feedback too." : `You'll see it here as soon as ${partnerName} gives you some.`}</div>
            ) : (
              <ul className="list">
                {feedback.map((f) => (
                  <li key={f.id}>
                    <div className="item-body">
                      <div className="item-text">{f.text}</div>
                      {f.example && <div className="item-sub"><strong>For example:</strong> {f.example}</div>}
                      <div className="item-meta">
                        <Badge cls={roleBadge(f.giver_role)}>{f.type}</Badge>
                        <span>{f.from_name} → {f.to_name} · {ago(f.created_at)}</span>
                      </div>
                      {f.response && (
                        <div className="item-sub"><strong>Response:</strong> {f.response}</div>
                      )}
                      {!isMgr && (
                        respondingId === f.id ? (
                          <div style={{ marginTop: 8 }}>
                            <textarea
                              value={responseText}
                              onChange={(e) => setResponseText(e.target.value)}
                              placeholder="Say what you think, or how you'll act on it."
                              autoFocus
                            />
                            <div className="btn-row" style={{ marginTop: 6 }}>
                              <button className="btn sm" onClick={() => submitResponse(f)}>Send response</button>
                              <button className="btn ghost sm" onClick={() => setRespondingId(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => openRespond(f)}>
                            {f.response ? "Edit your response" : "Respond"}
                          </button>
                        )
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {subTab === "concerns" && (
        <div className="subview active">
          <div className="card">
            <div className="card-head">
              <h2>Concerns</h2>
              {isMgr && <button className="btn sm" onClick={openConcernModal}>Note a concern</button>}
            </div>
            <p className="card-note">
              {isMgr
                ? `Drafts stay private until you share one — ${partnerName} never sees it until then.`
                : `Nothing here unless ${partnerName} has shared something with you. You can respond to anything shared.`}
            </p>
            {(isMgr ? concerns : concerns.filter((c) => c.shared_at)).length === 0 ? (
              <div className="empty"><div className="big">Nothing here</div>{isMgr ? "Log one when something needs to be raised." : "Nothing's been shared with you."}</div>
            ) : (
              <ul className="list">
                {(isMgr ? concerns : concerns.filter((c) => c.shared_at)).map((c) => (
                  <li key={c.id}>
                    <div className="item-body">
                      <div className="item-text">{c.what}</div>
                      {c.expectation && <div className="item-sub"><strong>Expected instead:</strong> {c.expectation}</div>}
                      {c.communicated && <div className="item-sub"><strong>Already raised:</strong> {c.communicated}</div>}
                      {c.previously && <div className="item-sub"><strong>Come up before:</strong> {c.previously}</div>}
                      {c.support && <div className="item-sub"><strong>Support offered:</strong> {c.support}</div>}
                      <div className="item-meta">
                        <Badge cls={c.shared_at ? "b-green" : "b-grey"}>{c.shared_at ? "Shared" : "Draft — not shared"}</Badge>
                        <span>{c.concern_date ? fmtDate(c.concern_date) : ago(c.created_at)}</span>
                      </div>
                      {c.response && <div className="item-sub"><strong>Response:</strong> {c.response}</div>}
                      {!isMgr && c.shared_at && (
                        ccRespondingId === c.id ? (
                          <div style={{ marginTop: 8 }}>
                            <textarea
                              value={ccResponseText}
                              onChange={(e) => setCcResponseText(e.target.value)}
                              placeholder="Say what you think, or ask for what you need."
                              autoFocus
                            />
                            <div className="btn-row" style={{ marginTop: 6 }}>
                              <button className="btn sm" onClick={() => submitConcernResponse(c)}>Send response</button>
                              <button className="btn ghost sm" onClick={() => setCcRespondingId(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => openConcernRespond(c)}>
                            {c.response ? "Edit your response" : "Respond"}
                          </button>
                        )
                      )}
                    </div>
                    {isMgr && (
                      <div className="item-actions">
                        {!c.shared_at && <button className="btn ghost sm" onClick={() => shareConcernNow(c.id)}>Share with {partnerName}</button>}
                        <button className="btn ghost sm" onClick={() => removeConcern(c.id)}>Remove</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {subTab === "review" && (
        <div className="subview active">
          <div className="card">
            <div className="card-head">
              <h2>Review preparation</h2>
              <button className="btn sm" onClick={buildDraft}>Build my draft</button>
            </div>
            <p className="card-note">Pulls together everything from this workspace into a draft you can edit. Nothing here becomes an official rating — it's your prep, in your words.</p>
            <div className="field">
              <label htmlFor="reviewDraft">Draft summary</label>
              <textarea
                id="reviewDraft"
                style={{ minHeight: 280 }}
                placeholder={'Click "Build my draft" to pull in your accomplishments, goals, feedback and development, then edit freely.'}
                value={reviewDraft}
                onChange={(e) => setReviewDraft(e.target.value)}
              />
            </div>
            <div className="btn-row">
              <button className="btn secondary" onClick={saveDraft}>Save draft</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------- modals - */}

      <Modal
        open={ccOpen}
        title="Note a concern"
        note={`Only you see this until you choose to share it with ${partnerName}.`}
        onClose={() => setCcOpen(false)}
        onSave={saveConcern}
        saveLabel="Save"
      >
        <div className="field">
          <label htmlFor="ccWhat">What&apos;s the concern</label>
          <textarea id="ccWhat" ref={ccWhatRef} value={ccWhat} onChange={(e) => setCcWhat(e.target.value)} placeholder="What happened, specifically." />
        </div>
        <div className="field">
          <label htmlFor="ccDate">When it happened</label>
          <input id="ccDate" type="date" value={ccDate} onChange={(e) => setCcDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ccExpectation">What you expect instead</label>
          <textarea id="ccExpectation" value={ccExpectation} onChange={(e) => setCcExpectation(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ccCommunicated">How/when you&apos;ve already raised this</label>
          <textarea id="ccCommunicated" value={ccCommunicated} onChange={(e) => setCcCommunicated(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ccPreviously">Has this come up before?</label>
          <textarea id="ccPreviously" value={ccPreviously} onChange={(e) => setCcPreviously(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ccSupport">Support you&apos;re offering</label>
          <textarea id="ccSupport" value={ccSupport} onChange={(e) => setCcSupport(e.target.value)} />
        </div>
      </Modal>

      <Modal
        open={achOpen}
        title="Add an achievement"
        note="Something that went well. Write it while it's fresh."
        onClose={() => setAchOpen(false)}
        onSave={saveAchievement}
        saveLabel="Add achievement"
        onDiscard={discardAchievementDraft}
      >
        <div className="field">
          <label htmlFor="acTitle">What happened</label>
          <input id="acTitle" ref={achTitleRef} type="text" autoComplete="off" value={achTitle} onChange={(e) => setAchTitle(e.target.value)} placeholder="e.g. Led the Northwind migration to a clean cutover" />
        </div>
        <div className="field">
          <label htmlFor="acCat">Category</label>
          <select id="acCat" value={achCat} onChange={(e) => setAchCat(e.target.value)}>
            {ACH_CATS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="acImpact">What difference did it make?</label>
          <textarea id="acImpact" value={achImpact} onChange={(e) => setAchImpact(e.target.value)} placeholder="Who benefited, and how you could tell." />
        </div>
        <div className="field">
          <label htmlFor="acDate">When</label>
          <input id="acDate" type="date" value={achDate} onChange={(e) => setAchDate(e.target.value)} />
        </div>
      </Modal>

      <Modal
        open={fbOpen}
        title={fbMode === "answer" ? `Answer: ${fbRequestAbout}` : `Give feedback to ${partnerName}`}
        note={fbMode === "answer" ? "They asked for this, so be as concrete as you can." : "Feedback lands better when it's specific and about something observable."}
        onClose={() => setFbOpen(false)}
        onSave={() => saveFeedback(false)}
        saveLabel="Send feedback"
        onDiscard={fbMode === "give" ? discardFeedbackDraft : undefined}
      >
        <div className="field">
          <label htmlFor="fbType">Type</label>
          <select id="fbType" value={fbType} onChange={(e) => setFbType(e.target.value)}>
            {fbTypes.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="fbText">{fbMode === "answer" ? "Your answer" : "What you want to say"}</label>
          <textarea id="fbText" ref={fbTextRef} value={fbText} onChange={(e) => { setFbText(e.target.value); setFbShowCoach(false); }} placeholder={fbMode === "answer" ? "" : "Say it the way you would out loud."} />
        </div>
        <div className="field">
          <label htmlFor="fbExample">A specific example</label>
          <textarea id="fbExample" value={fbExample} onChange={(e) => { setFbExample(e.target.value); setFbShowCoach(false); }} placeholder="What happened, and when. This is the part that makes it useful." />
        </div>
        {fbShowCoach && (
          <div>
            <div className="coach">
              <strong>Before you save</strong>
              That reads as a judgement rather than something observable. Add one specific example — what happened and when — or save anyway if you'd rather talk it through in person.
            </div>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button type="button" className="btn ghost sm" onClick={() => saveFeedback(true)}>Save it as is</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={frOpen}
        title={`Ask ${partnerName} for feedback`}
        note="They'll see the request and can answer it whenever they're ready."
        onClose={() => setFrOpen(false)}
        onSave={saveRequest}
        saveLabel="Send request"
      >
        <div className="field">
          <label htmlFor="frAbout">What do you want feedback on?</label>
          <input id="frAbout" ref={frAboutRef} type="text" autoComplete="off" value={frAbout} onChange={(e) => setFrAbout(e.target.value)} placeholder="e.g. How I handled the Northwind escalation" />
        </div>
        <div className="field">
          <label htmlFor="frWhy">Anything that would help them answer</label>
          <textarea id="frWhy" value={frWhy} onChange={(e) => setFrWhy(e.target.value)} placeholder="Context, what you're unsure about, what would be most useful." />
        </div>
      </Modal>

    </section>
  );
}
