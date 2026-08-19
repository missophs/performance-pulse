"use client";

import { useEffect, useState } from "react";
import { usePulse } from "@/components/PulseContext";
import {
  listTopics,
  listCheckinsAll,
  listMeetings,
  listGoals,
  listDevelopmentPlans,
  listAchievements,
  listFeedback,
  listCareerAnswers,
  listActions,
  listConcerns,
  getMyPair,
  getReviewDraft,
  updatePair,
  notify,
} from "@/lib/data";
import { fmtDate, fmtTime } from "@/lib/format";
import {
  EXPORT_SCOPE_IDS,
  buildExportHtml,
  downloadWord,
  openPdfWindow,
  buildExportRows,
  downloadExcel,
  buildExportJson,
  downloadJson,
} from "@/lib/export-builders";
import Modal from "@/components/ui/Modal";

const SCOPE_FIELDS = [
  { id: "current1on1", label: "1:1 — what to be prepared for and have ready" },
  { id: "past1on1s", label: "1:1 updates — what you covered and agreed" },
  { id: "goals", label: "Goals" },
  { id: "development", label: "Learning & development plan" },
  { id: "performance", label: "Achievements & feedback" },
  { id: "career", label: "Career conversations" },
  { id: "actions", label: "Action items" },
  { id: "concerns", label: "Updates" },
  { id: "review", label: "Review & preparation — draft" },
];

function emptyScopes() {
  const s = {};
  EXPORT_SCOPE_IDS.forEach((id) => (s[id] = false));
  return s;
}

export default function ExportPage() {
  const { pairId, role, myName, partnerName, supabase } = usePulse();

  const [loading, setLoading] = useState(true);
  const [pair, setPair] = useState(null);
  const [topics, setTopics] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [goals, setGoals] = useState([]);
  const [devPlans, setDevPlans] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [career, setCareer] = useState([]);
  const [actions, setActions] = useState([]);
  const [concerns, setConcerns] = useState([]);
  const [reviewDraft, setReviewDraft] = useState("");

  const [scopes, setScopes] = useState(emptyScopes());
  const [meetingUnticked, setMeetingUnticked] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  async function loadAll() {
    setLoading(true);
    const [p, t, ci, m, g, d, ach, fb, ca, a, cc, rd] = await Promise.all([
      getMyPair(supabase, (await supabase.auth.getUser()).data.user.id),
      listTopics(supabase, pairId),
      listCheckinsAll(supabase, pairId),
      listMeetings(supabase, pairId),
      listGoals(supabase, pairId),
      listDevelopmentPlans(supabase, pairId),
      listAchievements(supabase, pairId),
      listFeedback(supabase, pairId),
      listCareerAnswers(supabase, pairId),
      listActions(supabase, pairId),
      listConcerns(supabase, pairId),
      getReviewDraft(supabase, pairId, role),
    ]);
    setPair(p);
    setTopics(t);
    setCheckins(ci);
    setMeetings(m);
    setGoals(g);
    setDevPlans(d);
    setAchievements(ach);
    setFeedback(fb);
    setCareer(ca);
    setActions(a);
    setConcerns(cc);
    setReviewDraft(rd?.draft || "");
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairId]);

  if (loading) return <section><h1>Export</h1><p className="subtitle">Loading…</p></section>;

  const empName = role === "employee" ? myName : partnerName;
  const mgrName = role === "manager" ? myName : partnerName;
  const otherRole = role === "manager" ? "employee" : "manager";
  const pendingCheckins = checkins.filter((c) => !c.meeting_id);
  const selectedMeetings = meetings.filter((m) => !meetingUnticked[m.id]);

  function toggleScope(id) {
    setScopes((s) => ({ ...s, [id]: !s[id] }));
  }
  function selectAll() {
    const s = {};
    EXPORT_SCOPE_IDS.forEach((id) => (s[id] = true));
    setScopes(s);
  }
  function clearAll() {
    setScopes(emptyScopes());
  }
  function toggleMeeting(id) {
    setMeetingUnticked((u) => ({ ...u, [id]: !u[id] }));
  }

  function bundle() {
    return {
      scopes,
      empName,
      mgrName,
      exportedBy: myName,
      pair,
      topics,
      pendingCheckins,
      selectedMeetings,
      goals,
      devPlans,
      achievements,
      feedback,
      career,
      actions,
      concerns,
      reviewDraft,
      fmtDate,
      fmtTime,
    };
  }

  function confirmExport(then) {
    setPendingAction(() => then);
    setConfirmOpen(true);
  }

  async function runConfirmed() {
    setConfirmOpen(false);
    if (pendingAction) await pendingAction();
    setPendingAction(null);
  }

  async function logExport(label) {
    await notify(supabase, pairId, `${myName} exported ${label}`, role, otherRole);
  }

  function exportWord() {
    confirmExport(async () => {
      downloadWord("performance-pulse", buildExportHtml(bundle()));
      await logExport("a Word file");
    });
  }
  function exportPdf() {
    confirmExport(async () => {
      if (openPdfWindow(buildExportHtml(bundle()))) {
        await logExport("a PDF");
      } else {
        window.alert("Your browser blocked the print window. Allow pop-ups for this page and try again.");
      }
    });
  }
  function exportExcel() {
    confirmExport(async () => {
      downloadExcel(buildExportRows(bundle()));
      await logExport("an Excel file");
    });
  }
  function exportJson() {
    confirmExport(async () => {
      downloadJson(buildExportJson(bundle()));
      await logExport("the raw data");
    });
  }

  function askHrEmail() {
    const v = window.prompt("HR contact's email address:", pair?.hr_email || "");
    if (v === null) return null;
    const trimmed = v.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      window.alert("That doesn't look like an email address.");
      return null;
    }
    updatePair(supabase, pairId, { hr_email: trimmed }).then((p) => setPair(p));
    return trimmed;
  }

  function sendToHr(format) {
    const to = pair?.hr_email || askHrEmail();
    if (!to) return;
    confirmExport(async () => {
      if (format === "word") {
        downloadWord("performance-pulse", buildExportHtml(bundle()));
      } else if (format === "excel") {
        downloadExcel(buildExportRows(bundle()));
      } else if (format === "pdf") {
        if (!openPdfWindow(buildExportHtml(bundle()))) {
          window.alert("Your browser blocked the print window. Allow pop-ups for this page and try again.");
          return;
        }
      }
      await logExport(`a ${format.toUpperCase()} file to send to HR`);
      const attachNote =
        format === "pdf"
          ? "The print window just opened on my side — I'm saving it as a PDF and attaching it to this email."
          : "The file just downloaded on my side — I'm attaching it to this email.";
      const subject = `Performance record — ${empName} (sent by ${myName})`;
      const body = `Hi,\n\nI'm sharing part of my Performance Pulse record with you. ${attachNote}\n\nThis was sent deliberately by me, not automatically by the app.\n\n${myName}`;
      window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    });
  }

  return (
    <section>
      <h1>Export</h1>
      <p className="subtitle">You decide what leaves this app. Nothing is ever sent anywhere automatically.</p>
      <div className="privacy-banner">
        <strong>Nothing is sent to HR automatically &mdash; ever.</strong> Exporting creates a file on your device. You choose
        who sees it, and when.
      </div>

      <div className="card">
        <h2>Choose what to include</h2>
        <p className="card-note">Tick everything you want in the file.</p>
        <div>
          {SCOPE_FIELDS.map((f) => (
            <div key={f.id}>
              <label className="checkline">
                <input type="checkbox" checked={scopes[f.id]} onChange={() => toggleScope(f.id)} />
                {f.label}
                {f.id === "concerns" && <span style={{ color: "var(--faint)", fontSize: 12 }}>&nbsp;(manager notes)</span>}
              </label>
              {f.id === "past1on1s" && scopes.past1on1s && (
                <div style={{ margin: "2px 0 10px 26px", paddingLeft: 12, borderLeft: "2px solid var(--border)" }}>
                  {meetings.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: "var(--faint)" }}>
                      No past 1:1s yet — close one out from My 1:1 → Wrap up.
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 11.5, color: "var(--faint)", marginBottom: 6 }}>Untick any you don&rsquo;t want to include.</div>
                      {meetings.map((m) => (
                        <label className="checkline" style={{ fontSize: 12.5 }} key={m.id}>
                          <input type="checkbox" checked={!meetingUnticked[m.id]} onChange={() => toggleMeeting(m.id)} />
                          {fmtDate(m.meeting_date)} &mdash; {(m.discussed || "No summary").slice(0, 60)}
                          {(m.discussed || "").length > 60 ? "…" : ""}
                        </label>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="btn-row" style={{ marginTop: 14 }}>
          <button className="btn ghost sm" onClick={selectAll}>Select all</button>
          <button className="btn ghost sm" onClick={clearAll}>Clear all</button>
        </div>
      </div>

      <div className="card">
        <h2>Create the file</h2>
        <p className="card-note">Word opens in Word, Pages, or Google Docs. PDF opens your print dialog &mdash; choose &ldquo;Save as PDF&rdquo;.</p>
        <div className="btn-row">
          <button className="btn" onClick={exportWord}>Download as Word</button>
          <button className="btn secondary" onClick={exportPdf}>Print / Save as PDF</button>
          <button className="btn secondary" onClick={exportExcel}>Download for Excel</button>
          <button className="btn ghost" onClick={exportJson}>Download raw data (JSON)</button>
        </div>
      </div>

      <div className="card">
        <h2>Send to HR</h2>
        <p className="card-note">
          Creates the file in the format you pick, then opens an email to your HR contact so you can attach it and send. HR
          hears about it from you, in that email &mdash; never from the app on its own. You can also print it out and hand it
          over.
        </p>
        <div className="btn-row">
          <button className="btn" onClick={() => sendToHr("word")}>Send as Word</button>
          <button className="btn secondary" onClick={() => sendToHr("pdf")}>Send as PDF</button>
          <button className="btn secondary" onClick={() => sendToHr("excel")}>Send as Excel</button>
          <button className="btn ghost sm" onClick={askHrEmail}>Set HR email</button>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        title="You're about to create a file"
        onClose={() => {
          setConfirmOpen(false);
          setPendingAction(null);
        }}
        onSave={runConfirmed}
        saveLabel="I understand — create the file"
      >
        <div className="coach" style={{ marginTop: 0 }}>
          <strong>Before you download</strong>
          This file will contain the information you selected. Once it&rsquo;s on your device, you control who sees it.
          Nothing is sent to HR, your organisation, or anyone else automatically &mdash; sharing it is entirely your decision.
        </div>
      </Modal>
    </section>
  );
}
