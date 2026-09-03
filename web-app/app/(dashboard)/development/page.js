"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePulse } from "@/components/PulseContext";
import { useToast } from "@/components/ui/ToastProvider";
import { listDevelopmentPlans, saveDevelopmentPlan, deleteDevelopmentPlan, getPair, updatePair, notify, getFormDraft, saveFormDraft, clearFormDraft } from "@/lib/data";
import { fmtDate, ago } from "@/lib/format";
import { devStatusBadge } from "@/lib/badges";
import { DEV_TYPES, DEV_STATES, DEV_IDEAS, ldMatch } from "@/lib/development-content";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";

const BLANK_DEV = { area: "", why: "", type: "Stretch assignment", activity: "", support: "", target: "", status: "Not Started", measure: "" };

export default function DevelopmentPage() {
  return (
    <Suspense fallback={<section><h1>Learning &amp; development</h1><p className="subtitle">Loading…</p></section>}>
      <DevelopmentPageInner />
    </Suspense>
  );
}

function DevelopmentPageInner() {
  const { pairId, role, isMgr, myName, partnerName, supabase } = usePulse();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const otherRole = isMgr ? "employee" : "manager";
  const employeeName = isMgr ? partnerName : myName;
  const managerName = isMgr ? myName : partnerName;

  const [loading, setLoading] = useState(true);
  const [devPlans, setDevPlans] = useState([]);
  const [assistEnabled, setAssistEnabled] = useState(false);

  const [ldModalOpen, setLdModalOpen] = useState(false);
  const [ldAsk, setLdAsk] = useState("");
  const [ldResult, setLdResult] = useState(undefined); // undefined = not searched, null = no match, object = match

  const [devModalOpen, setDevModalOpen] = useState(false);
  const [editingDev, setEditingDev] = useState(null);
  const [devForm, setDevForm] = useState(BLANK_DEV);
  const [ideasOpen, setIdeasOpen] = useState(false);

  async function loadAll() {
    setLoading(true);
    const [d, p] = await Promise.all([listDevelopmentPlans(supabase, pairId), getPair(supabase, pairId)]);
    setDevPlans(d);
    setAssistEnabled(!!p?.assist_enabled);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairId]);

  // Seeded from Career's "Turn this into a development plan" — /development?seed=1&seedArea=..&seedWhy=..&seedActivity=..
  useEffect(() => {
    if (searchParams.get("seed") === "1") {
      setEditingDev(null);
      setDevForm({
        ...BLANK_DEV,
        area: searchParams.get("seedArea") || "",
        why: searchParams.get("seedWhy") || "",
        activity: searchParams.get("seedActivity") || "",
      });
      setIdeasOpen(false);
      setDevModalOpen(true);
      router.replace(pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function safeNotify(text, view, kind) {
    try {
      await notify(supabase, pairId, text, role, otherRole, view || null, kind || null);
    } catch {
      // best effort — a failed ping shouldn't block the save
    }
  }

  async function toggleAssist() {
    const next = !assistEnabled;
    setAssistEnabled(next);
    await updatePair(supabase, pairId, { assist_enabled: next });
    toast(
      next ? "Comments on" : "Comments off",
      next
        ? "The app will now flag vague wording and ask follow-up questions while you write."
        : "The app will stay quiet unless you ask it for a recommendation."
    );
  }

  function openLdModal() {
    setLdAsk("");
    setLdResult(undefined);
    setLdModalOpen(true);
  }
  function closeLdModal() {
    setLdModalOpen(false);
  }
  function handleLdSuggest() {
    if (!ldAsk.trim()) return;
    setLdResult(ldMatch(ldAsk) || null);
  }
  function applyLdPick(rule, pick) {
    setLdModalOpen(false);
    setEditingDev(null);
    setDevForm({ ...BLANK_DEV, area: rule.area, why: rule.why, type: pick[0], activity: pick[1], support: rule.support, measure: rule.measure });
    setIdeasOpen(false);
    setDevModalOpen(true);
  }

  async function openAddDev() {
    setEditingDev(null);
    const draft = await getFormDraft(supabase, pairId, role, "dev").catch(() => null);
    setDevForm({ ...BLANK_DEV, ...draft?.draft });
    setIdeasOpen(false);
    setDevModalOpen(true);
  }

  // Autosave a draft of a new (not editing) plan — covers the plain "Add a
  // development plan" flow as well as the seeded/LD-suggestion opens above,
  // since those also start a new (unsaved) plan.
  useEffect(() => {
    if (!devModalOpen || editingDev) return;
    const hasContent = devForm.area.trim() || devForm.why.trim() || devForm.activity.trim() || devForm.support.trim() || devForm.target || devForm.measure.trim();
    const timer = setTimeout(() => {
      if (hasContent) saveFormDraft(supabase, pairId, role, "dev", devForm).catch(() => {});
      else clearFormDraft(supabase, pairId, role, "dev").catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devForm, devModalOpen, editingDev]);

  async function discardDevDraft() {
    setDevForm(BLANK_DEV);
    await clearFormDraft(supabase, pairId, role, "dev").catch(() => {});
  }
  function openEditDev(d) {
    setEditingDev(d);
    setDevForm({
      area: d.area || "",
      why: d.why || "",
      type: d.type || "Stretch assignment",
      activity: d.activity || "",
      support: d.support || "",
      target: d.target_date || "",
      status: d.status || "Not Started",
      measure: d.measure || "",
    });
    setIdeasOpen(false);
    setDevModalOpen(true);
  }
  function closeDevModal() {
    setDevModalOpen(false);
    setEditingDev(null);
  }

  async function handleSaveDev() {
    const area = devForm.area.trim();
    if (!area) return;
    const payload = { ...devForm, area, id: editingDev?.id };
    const wasNew = !editingDev;
    await saveDevelopmentPlan(supabase, pairId, payload, role, myName);
    closeDevModal();
    if (wasNew) await clearFormDraft(supabase, pairId, role, "dev").catch(() => {});
    if (editingDev) {
      await safeNotify(`${myName} updated a development plan: ${area}`);
    } else {
      await safeNotify(`${myName}${isMgr ? " recommended development: " : " requested development: "}${area}`, "development", "dev");
    }
    loadAll();
  }

  async function handleDeleteDev(d) {
    if (!window.confirm(`Remove "${d.area}"?`)) return;
    await deleteDevelopmentPlan(supabase, d.id);
    await safeNotify(`Development plan removed: ${d.area}`);
    loadAll();
  }

  return (
    <section>
      <h1>Learning &amp; development</h1>
      <p className="subtitle">Either of you can start this. Managers recommend, employees request — both count.</p>

      <div className="card">
        <div className="card-head">
          <h2>Ask for a recommendation</h2>
          <button className="btn sm" onClick={openLdModal}>Recommend learning &amp; development</button>
        </div>
        <p className="card-note">The one place this app offers you a suggestion — and only when you press the button. Say what you want to get better at and it will propose activities you can turn into a plan.</p>
        <div className="limits">
          <label className="switch">
            <input type="checkbox" checked={assistEnabled} onChange={toggleAssist} />
            <span>
              <strong>Let the app comment while I write</strong>
              <small>Off by default. Turned on, it points out when feedback reads as a judgement rather than something observable, and asks follow-up questions during check-ins. It never does either unless this is ticked.</small>
            </span>
          </label>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Learning &amp; development plans</h2>
          <button className="btn sm" onClick={openAddDev}>Add a learning &amp; development plan</button>
        </div>
        {loading ? (
          <p className="card-note">Loading…</p>
        ) : devPlans.length === 0 ? (
          <div className="empty">
            <div className="big">No learning &amp; development plans yet</div>
            {isMgr ? `Recommend something that stretches ${employeeName} a little.` : "Ask for what would help you grow."}
          </div>
        ) : (
          <ul className="list">
            {devPlans.slice().reverse().map((d) => {
              const badge = devStatusBadge(d.status);
              return (
                <li key={d.id}>
                  <div className="item-body">
                    <div className="item-text">{d.area}</div>
                    {d.why && <div className="item-sub"><strong>Why:</strong> {d.why}</div>}
                    {d.activity && <div className="item-sub"><strong>Activity:</strong> {d.activity}</div>}
                    {d.support && <div className="item-sub"><strong>Manager support:</strong> {d.support}</div>}
                    {d.measure && <div className="item-sub"><strong>Success measure:</strong> {d.measure}</div>}
                    <div className="item-meta">
                      <Badge cls="b-purple">{d.type}</Badge>
                      <Badge cls={badge.cls}>{badge.label}</Badge>
                      <span>
                        {d.created_by_role === "manager" ? "Recommended by " : "Requested by "}
                        {d.created_by_name}
                        {d.target_date ? ` · target ${fmtDate(d.target_date)}` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="item-actions">
                    <button className="btn secondary sm" onClick={() => openEditDev(d)}>Update</button>
                    <button className="btn ghost sm" onClick={() => handleDeleteDev(d)}>Remove</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal
        open={ldModalOpen}
        title="Recommend learning & development"
        note="Say what you want to get better at. Nothing here runs unless you press the button."
        onClose={closeLdModal}
        onSave={handleLdSuggest}
        saveLabel="Suggest activities"
        saveDisabled={!ldAsk.trim()}
      >
        <div className="field">
          <label htmlFor="ldAsk">{isMgr ? `What should ${employeeName} build?` : "What do you want to get better at?"}</label>
          <textarea
            id="ldAsk"
            placeholder={isMgr ? "e.g. Presenting to senior stakeholders without losing the thread" : "e.g. Being more convincing in front of senior stakeholders"}
            value={ldAsk}
            onChange={(e) => setLdAsk(e.target.value)}
          />
        </div>
        {ldResult === null && (
          <div className="limits" style={{ marginTop: 14 }}>
            <strong>I don't have enough information to make that determination.</strong>
            <br />
            Nothing you wrote matches anything I recognise, and guessing would waste your time. Try naming the skill directly — presenting, leading
            people, influence, difficult conversations, delegation, data, commercial judgement, working across teams, customers, writing — or add a
            plan yourself and write the activity in your own words.
          </div>
        )}
        {ldResult && (
          <>
            <div className="coach" style={{ marginTop: 14 }}>
              <strong>{ldResult.area}</strong>
              {ldResult.why}
            </div>
            {ldResult.picks.map((p, i) => (
              <div key={i} className="sugg" style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "flex-start", marginTop: 8 }}>
                <div>
                  <Badge cls="b-cyan">{p[0]}</Badge>
                  <div style={{ marginTop: 6 }}>{p[1]}</div>
                </div>
                <button type="button" className="btn ghost sm" style={{ flex: "none" }} onClick={() => applyLdPick(ldResult, p)}>
                  Use this
                </button>
              </div>
            ))}
            <div className="limits">
              Fixed suggestions written by a person and matched on the words you typed. This has not read your goals, your feedback, or anything else
              in this app, and it does not know your situation. It is a starting point for the conversation, not an answer.
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={devModalOpen}
        title={editingDev ? "Edit learning & development plan" : isMgr ? "Recommend learning & development" : "Request learning & development"}
        note={editingDev ? undefined : isMgr ? "A good recommendation says what to build, how, and what you'll do to help." : "Ask for what would help you grow. Your manager sees this straight away."}
        onClose={closeDevModal}
        onSave={handleSaveDev}
        saveLabel={editingDev ? "Save changes" : "Save plan"}
        saveDisabled={!devForm.area.trim()}
        onDiscard={editingDev ? undefined : discardDevDraft}
      >
        <div className="field">
          <label htmlFor="dvArea">Development area</label>
          <input id="dvArea" type="text" placeholder="e.g. Executive presentation skills" value={devForm.area} onChange={(e) => setDevForm({ ...devForm, area: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="dvWhy">Why it matters</label>
          <textarea id="dvWhy" placeholder="e.g. Increase effectiveness presenting to senior stakeholders" value={devForm.why} onChange={(e) => setDevForm({ ...devForm, why: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="dvType">Type</label>
          <select
            id="dvType"
            value={devForm.type}
            onChange={(e) => setDevForm({ ...devForm, type: e.target.value })}
          >
            {DEV_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        {DEV_IDEAS[devForm.type]?.length > 0 &&
          (ideasOpen ? (
            <div className="coach" style={{ margin: "0 0 12px" }}>
              <strong>Ideas for {devForm.type.toLowerCase()}</strong>
              {DEV_IDEAS[devForm.type].map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                  <span>{t}</span>
                  <button type="button" className="btn ghost sm" onClick={() => setDevForm({ ...devForm, activity: t })}>
                    Use
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="btn-row" style={{ margin: "0 0 12px" }}>
              <button type="button" className="btn ghost sm" onClick={() => setIdeasOpen(true)}>
                Show me ideas for {devForm.type.toLowerCase()}
              </button>
            </div>
          ))}
        <div className="field">
          <label htmlFor="dvActivity">The activity</label>
          <textarea id="dvActivity" placeholder="e.g. Present the monthly business update" value={devForm.activity} onChange={(e) => setDevForm({ ...devForm, activity: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="dvSupport">What {managerName} will do to support this</label>
          <textarea id="dvSupport" placeholder="e.g. Review the first two decks and give feedback" value={devForm.support} onChange={(e) => setDevForm({ ...devForm, support: e.target.value })} />
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="dvTarget">Target date</label>
            <input id="dvTarget" type="date" value={devForm.target} onChange={(e) => setDevForm({ ...devForm, target: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="dvStatus">Status</label>
            <select id="dvStatus" value={devForm.status} onChange={(e) => setDevForm({ ...devForm, status: e.target.value })}>
              {DEV_STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="dvMeasure">How we'll know it worked</label>
          <textarea id="dvMeasure" placeholder="e.g. Confidently leads the quarterly leadership presentation" value={devForm.measure} onChange={(e) => setDevForm({ ...devForm, measure: e.target.value })} />
        </div>
      </Modal>
    </section>
  );
}
