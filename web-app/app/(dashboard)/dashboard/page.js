"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePulse } from "@/components/PulseContext";
import { useToast } from "@/components/ui/ToastProvider";
import {
  listTopics,
  listGoals,
  listActions,
  listDevelopmentPlans,
  listMeetings,
  listCheckinsAll,
  listAchievements,
  listFeedback,
  listCareerAnswers,
  buildHistory,
  listMessages,
  addMessage,
  listDocuments,
  addDocumentLink,
  uploadDocument,
  getDocumentUrl,
  deleteDocument,
  listHandbookLinks,
  uploadHandbookFile,
  getHandbookFileUrl,
  deleteHandbookLink,
  listNotifications,
  markAllNotificationsRead,
  groupNotifications,
  updatePair,
  getPair,
  notify,
} from "@/lib/data";
import { isOpenTopic, isActiveGoal, isOpenAction, isActiveDev, isOverdue, fmtDate, fmtTime, daysBetween, today, ago } from "@/lib/format";
import Badge from "@/components/ui/Badge";

const MSG_KINDS = ["Question", "Concern", "Heads-up", "Idea", "Other"];

export default function DashboardPage() {
  const { pairId, role, isMgr, myName, partnerName, supabase, email } = usePulse();
  // UI-only gate for the Handbook upload/remove buttons -- the real
  // enforcement is the is_hr() Postgres function (supabase/migrations/
  // 0013_global_handbook.sql), which hardcodes this same email for RLS.
  // The two are NOT wired together (no shared constant reaches SQL migration
  // text), so a change to who counts as HR must be made in both places or
  // this check and the database gate will disagree.
  const isHr = (email || "").toLowerCase() === "melissaw212@gmail.com";
  const toast = useToast();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [pair, setPair] = useState(null);
  const [topics, setTopics] = useState([]);
  const [goals, setGoals] = useState([]);
  const [actions, setActions] = useState([]);
  const [devPlans, setDevPlans] = useState([]);
  const [history, setHistory] = useState([]);
  const [messages, setMessages] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [handbook, setHandbook] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [howToOpen, setHowToOpen] = useState(true);
  const [msgText, setMsgText] = useState("");
  const [msgKind, setMsgKind] = useState("Question");
  const [n1Date, setN1Date] = useState("");
  const [n1Time, setN1Time] = useState("");
  const [n1Focus, setN1Focus] = useState("");
  const [linkName, setLinkName] = useState("");
  const [showSuggestForm, setShowSuggestForm] = useState(false);
  const [suggDate, setSuggDate] = useState("");
  const [suggTime, setSuggTime] = useState("");
  const [suggNote, setSuggNote] = useState("");

  async function loadAll() {
    setLoading(true);
    const [p, t, g, a, d, m, ci, ach, fb, ca, msgs, docs, hb, notifs] = await Promise.all([
      getPair(supabase, pairId),
      listTopics(supabase, pairId),
      listGoals(supabase, pairId),
      listActions(supabase, pairId),
      listDevelopmentPlans(supabase, pairId),
      listMeetings(supabase, pairId),
      listCheckinsAll(supabase, pairId),
      listAchievements(supabase, pairId),
      listFeedback(supabase, pairId),
      listCareerAnswers(supabase, pairId),
      listMessages(supabase, pairId),
      listDocuments(supabase, pairId),
      listHandbookLinks(supabase),
      listNotifications(supabase, pairId),
    ]);
    setPair(p);
    setTopics(t);
    setGoals(g);
    setActions(a);
    setDevPlans(d);
    setHistory(buildHistory({ meetings: m, checkins: ci, achievements: ach, feedback: fb, goals: g, development: d, career: ca, actions: a }));
    setMessages(msgs);
    setDocuments(docs);
    setHandbook(hb);
    setNotifications(notifs.filter((n) => n.to_role === role || n.to_role === "both"));
    setHowToOpen(!p?.how_to_hidden);
    setN1Date(p?.next_1on1_date || "");
    setN1Time(p?.next_1on1_time || "");
    setN1Focus(p?.next_1on1_focus || "");
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairId]);

  if (loading) return <section><h1>Dashboard</h1><p className="subtitle">Loading…</p></section>;

  const openTopics = topics.filter(isOpenTopic);
  const activeGoals = goals.filter(isActiveGoal);
  const openActions = actions.filter(isOpenAction);
  const activeDev = devPlans.filter(isActiveDev);
  const overdue = actions.filter((a) => isOverdue(a.due_date, a.status));
  const unread = notifications.filter((n) => !n.read);
  const groupedNotifications = groupNotifications(notifications);
  const avgProgress = activeGoals.length ? Math.round(activeGoals.reduce((s, g) => s + (g.progress || 0), 0) / activeGoals.length) : 0;

  const soonActions = actions
    .filter((a) => a.status !== "Done" && a.due_date && daysBetween(new Date(today() + "T00:00:00").getTime(), new Date(a.due_date + "T00:00:00").getTime()) <= 14)
    .sort((a, b) => (a.due_date < b.due_date ? -1 : 1));

  async function toggleHowTo() {
    const next = !howToOpen;
    setHowToOpen(next);
    await updatePair(supabase, pairId, { how_to_hidden: !next });
  }

  async function sendMessage() {
    if (!msgText.trim()) return;
    await addMessage(supabase, pairId, msgKind, msgText.trim(), role, myName);
    setMsgText("");
    toast("Sent", `${partnerName} will see this the next time they open Performance Pulse.`);
    loadAll();
  }

  async function saveNext1() {
    await updatePair(supabase, pairId, { next_1on1_date: n1Date || null, next_1on1_time: n1Time || null, next_1on1_focus: n1Focus });
    toast("Saved", "Next 1:1 details updated.");
    loadAll();
  }

  async function suggestReschedule() {
    if (!suggDate) return;
    await updatePair(supabase, pairId, {
      suggested_1on1_date: suggDate,
      suggested_1on1_time: suggTime || null,
      suggested_1on1_note: suggNote.trim() || null,
    });
    await notify(supabase, pairId, `${myName} suggested a different time for your next 1:1.`, role, "manager", "dashboard", null);
    setShowSuggestForm(false);
    setSuggDate("");
    setSuggTime("");
    setSuggNote("");
    toast("Sent", "Your manager will see this suggestion.");
    loadAll();
  }

  async function useSuggestion() {
    await updatePair(supabase, pairId, {
      next_1on1_date: pair.suggested_1on1_date,
      next_1on1_time: pair.suggested_1on1_time,
      suggested_1on1_date: null,
      suggested_1on1_time: null,
      suggested_1on1_note: null,
    });
    toast("Updated", "Next 1:1 set to the suggested time.");
    loadAll();
  }

  async function dismissSuggestion() {
    await updatePair(supabase, pairId, { suggested_1on1_date: null, suggested_1on1_time: null, suggested_1on1_note: null });
    loadAll();
  }

  // Floating local time (no timezone conversion) -- the simplest .ics that
  // every major calendar app opens directly, no server-side generation or
  // calendar-account connection needed. Known ceiling: relies on the
  // opener's own timezone matching what was intended; add a real timezone
  // (TZID) if this ever needs to be precise across time zones.
  function downloadIcs() {
    if (!n1Date) return;
    const dt = n1Date.replace(/-/g, "") + "T" + (n1Time ? n1Time.replace(":", "") + "00" : "090000");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Performance Pulse//EN",
      "BEGIN:VEVENT",
      `UID:${crypto.randomUUID()}@performance-pulse`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTSTART:${dt}`,
      `SUMMARY:1:1 with ${partnerName}`,
      n1Focus && `DESCRIPTION:${n1Focus.replace(/\n/g, "\\n")}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].filter(Boolean).join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "1-1-with-" + partnerName.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function addLink() {
    const name = window.prompt("What is this document called?");
    if (!name || !name.trim()) return;
    const url = window.prompt("Link to it (SharePoint, Drive, OneDrive…):");
    if (!url || !url.trim()) return;
    await addDocumentLink(supabase, pairId, name.trim(), url.trim(), myName);
    loadAll();
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadDocument(supabase, pairId, file, myName);
      loadAll();
    } catch (err) {
      toast("Couldn't upload that", err.message);
    }
    e.target.value = "";
  }

  async function openDoc(doc) {
    const url = await getDocumentUrl(supabase, doc);
    window.open(url, "_blank", "noopener");
  }

  async function removeDoc(doc) {
    if (!window.confirm(`Remove ${doc.name}?`)) return;
    await deleteDocument(supabase, doc);
    loadAll();
  }

  async function handleHandbookUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadHandbookFile(supabase, file);
      loadAll();
    } catch (err) {
      toast("Couldn't upload that", err.message);
    }
    e.target.value = "";
  }

  async function openHandbook(link) {
    const url = await getHandbookFileUrl(supabase, link);
    window.open(url, "_blank", "noopener");
  }

  async function removeHandbook(link) {
    if (!window.confirm(`Remove ${link.title}?`)) return;
    await deleteHandbookLink(supabase, link);
    loadAll();
  }

  async function markRead() {
    await markAllNotificationsRead(supabase, pairId, role);
    loadAll();
  }

  return (
    <section>
      <h1>Dashboard</h1>
      <p className="subtitle">Ongoing performance conversations — no ratings, no rankings, no automatic HR reporting.</p>
      <div className="privacy-banner">
        <strong>Private between you and your manager.</strong> Nothing here is automatically shared with HR. If you want HR to see something, you export it and share it yourself.
      </div>

      <p className="hb-strip">
        🔖{" "}
        {handbook.length === 0 ? (
          <>Please see the employee handbook for any questions.</>
        ) : (
          <>
            Please see the attached handbook for any questions:{" "}
            {handbook.map((h) => (
              <span key={h.id}>
                <a href="#" onClick={(e) => { e.preventDefault(); openHandbook(h); }}>{h.title}</a> <span className="hb-date">({fmtDate((h.created_at || "").slice(0, 10))})</span>
                {isHr && <button className="btn ghost sm" onClick={() => removeHandbook(h)}>Remove</button>}{" "}
              </span>
            ))}
          </>
        )}
        {isHr && (
          <label className="btn secondary sm" style={{ cursor: "pointer", marginLeft: 8 }}>
            HR only uploads
            <input type="file" style={{ display: "none" }} onChange={handleHandbookUpload} />
          </label>
        )}
      </p>

      <div className="card">
        <div className="card-head">
          <h2>How to use this</h2>
          <button className="btn ghost sm" onClick={toggleHowTo}>{howToOpen ? "Hide" : "Show"}</button>
        </div>
        {howToOpen && (
          <ol style={{ margin: "6px 0 4px 20px", lineHeight: 1.7 }}>
            <li><strong>Before your 1:1</strong>, go to <em>My 1:1</em> and add topics. Stuck for words? Use the suggested questions — or write your own.</li>
            <li><strong>The other person gets a ping</strong> that something was added — never the content itself.</li>
            <li><strong>In the meeting</strong>, work through the agenda together, mark each topic, and capture actions.</li>
            <li><strong>Everything saves as you go.</strong> Moving between tabs never loses anything.</li>
            <li><strong>Want HR to have something?</strong> Use <em>Send to HR</em> on the Export tab — HR is not notified automatically.</li>
          </ol>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Between you two</h2>
        </div>
        <p className="card-note">No meeting needed. Send it when it's on your mind — {partnerName} gets notified and answers when they can.</p>
        <div className="row">
          <select value={msgKind} onChange={(e) => setMsgKind(e.target.value)} style={{ maxWidth: 160 }}>
            {MSG_KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
          <input type="text" value={msgText} onChange={(e) => setMsgText(e.target.value)} placeholder="What's on your mind?" style={{ flex: 1 }} />
          <button className="btn sm" onClick={sendMessage}>Send</button>
        </div>
        {messages.length > 0 && (
          <ul className="list" style={{ marginTop: 12 }}>
            {messages.slice().reverse().slice(0, 6).map((m) => (
              <li key={m.id}>
                <div className="item-body">
                  <div className="item-text">{m.text}</div>
                  <div className="item-meta"><Badge cls="b-purple">{m.kind}</Badge><span>{m.created_by_name} · {ago(m.created_at)}</span></div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Documents</h2>
          <div className="btn-row">
            <button className="btn sm" onClick={addLink}>Add a link</button>
            <label className="btn secondary sm" style={{ cursor: "pointer" }}>
              Upload a file
              <input type="file" style={{ display: "none" }} onChange={handleFileUpload} />
            </label>
          </div>
        </div>
        <p className="card-note"><strong>Best practice: keep the file in OneDrive, SharePoint, or Google Drive and add the link here.</strong> Uploaded files are stored privately — only you and {partnerName} can open them.</p>
        {documents.length > 0 && (
          <ul className="list">
            {documents.map((d) => (
              <li key={d.id}>
                <div className="item-body">
                  <div className="item-text"><a href="#" onClick={(e) => { e.preventDefault(); openDoc(d); }}>{d.name}</a></div>
                  <div className="item-meta"><span>{d.created_by_name} · {ago(d.created_at)}</span></div>
                </div>
                <div className="item-actions">
                  <button className="btn ghost sm" onClick={() => removeDoc(d)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Your next 1:1</h2>
          <button className="btn sm" onClick={() => router.push("/one-on-one")}>Open 1:1 workspace</button>
        </div>
        {n1Date ? (
          <div className="item-meta" style={{ marginTop: 4 }}>
            <Badge cls={daysBetween(new Date(today() + "T00:00:00").getTime(), new Date(n1Date + "T00:00:00").getTime()) < 0 ? "b-grey" : "b-purple"}>
              {(() => {
                const days = daysBetween(new Date(today() + "T00:00:00").getTime(), new Date(n1Date + "T00:00:00").getTime());
                const when = days === 0 ? "Today" : days === 1 ? "Tomorrow" : days > 0 ? `In ${days} days` : `${Math.abs(days)} days ago`;
                return when + (n1Time ? ` at ${fmtTime(n1Time)}` : "");
              })()}
            </Badge>
            <span>{openTopics.length} topic{openTopics.length === 1 ? "" : "s"} on the agenda</span>
          </div>
        ) : (
          <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>No 1:1 scheduled yet{isMgr ? " — pick a date below so you both know when this is happening." : "."}</p>
        )}

        {isMgr ? (
          <>
            {pair?.suggested_1on1_date && (
              <div className="privacy-banner" style={{ marginTop: 12 }}>
                <strong>{partnerName} suggested a different time:</strong> {fmtDate(pair.suggested_1on1_date)}
                {pair.suggested_1on1_time ? ` at ${fmtTime(pair.suggested_1on1_time)}` : ""}
                {pair.suggested_1on1_note ? ` — ${pair.suggested_1on1_note}` : ""}
                <div style={{ marginTop: 8 }}>
                  <button className="btn sm" onClick={useSuggestion}>Use this date</button>{" "}
                  <button className="btn ghost sm" onClick={dismissSuggestion}>Dismiss</button>
                </div>
              </div>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              <div className="field"><label htmlFor="n1Date">Date</label><input id="n1Date" type="date" value={n1Date} onChange={(e) => setN1Date(e.target.value)} /></div>
              <div className="field"><label htmlFor="n1Time">Time</label><input id="n1Time" type="time" value={n1Time} onChange={(e) => setN1Time(e.target.value)} /></div>
            </div>
            <div className="field">
              <label htmlFor="n1Focus">What this conversation is for</label>
              <textarea id="n1Focus" value={n1Focus} onChange={(e) => setN1Focus(e.target.value)} placeholder="What should this 1:1 focus on?" />
            </div>
            <button className="btn secondary sm" onClick={saveNext1}>Save details</button>
          </>
        ) : (
          <>
            {n1Date && (
              <p style={{ marginTop: 12 }}>
                Your manager has scheduled a 1:1 for {fmtDate(n1Date)}{n1Time ? ` at ${fmtTime(n1Time)}` : ""}.
                {n1Focus ? ` Focus: ${n1Focus}` : ""}
              </p>
            )}
            {pair?.suggested_1on1_date && (
              <p style={{ color: "var(--muted)", fontSize: 13 }}>
                Your suggestion ({fmtDate(pair.suggested_1on1_date)}{pair.suggested_1on1_time ? ` at ${fmtTime(pair.suggested_1on1_time)}` : ""}) is waiting on your manager.
              </p>
            )}
            {!showSuggestForm ? (
              <button className="btn ghost sm" onClick={() => setShowSuggestForm(true)}>Suggest a different date/time</button>
            ) : (
              <>
                <div className="row" style={{ marginTop: 12 }}>
                  <div className="field"><label htmlFor="suggDate">Date</label><input id="suggDate" type="date" value={suggDate} onChange={(e) => setSuggDate(e.target.value)} /></div>
                  <div className="field"><label htmlFor="suggTime">Time</label><input id="suggTime" type="time" value={suggTime} onChange={(e) => setSuggTime(e.target.value)} /></div>
                </div>
                <div className="field">
                  <label htmlFor="suggNote">Why (optional)</label>
                  <input id="suggNote" type="text" value={suggNote} onChange={(e) => setSuggNote(e.target.value)} placeholder="e.g. conflicts with another meeting" />
                </div>
                <button className="btn secondary sm" onClick={suggestReschedule} disabled={!suggDate}>Send suggestion</button>{" "}
                <button className="btn ghost sm" onClick={() => setShowSuggestForm(false)}>Cancel</button>
              </>
            )}
          </>
        )}

        {n1Date && (
          <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={downloadIcs}>Download calendar invite</button>
        )}
      </div>

      <div className="grid">
        <button className="stat s-purple" onClick={() => router.push("/one-on-one")}>
          <div className="num">{openTopics.length}</div><div className="label">Open topics</div>
          <div className="desc">Waiting to be discussed.</div>
        </button>
        <button className="stat s-pink" onClick={() => router.push("/goals")}>
          <div className="num">{activeGoals.length}</div><div className="label">Active goals</div>
          <div className="desc">{activeGoals.length ? `Average progress ${avgProgress}%.` : "Set one together."}</div>
        </button>
        <button className="stat s-cyan" onClick={() => router.push("/actions")}>
          <div className="num">{openActions.length}</div><div className="label">Open actions</div>
          <div className="desc">{overdue.length ? `${overdue.length} past its date.` : "Nothing overdue."}</div>
        </button>
        <button className="stat s-green" onClick={() => router.push("/development")}>
          <div className="num">{activeDev.length}</div><div className="label">Development</div>
          <div className="desc">Growth plans in progress.</div>
        </button>
        <button className="stat s-amber" onClick={() => router.push("/history")}>
          <div className="num">{unread.length}</div><div className="label">Updates</div>
          <div className="desc">Unread activity from you both.</div>
        </button>
      </div>

      <div className="card">
        <h2>Topics on the agenda</h2>
        <p className="card-note">What you and your manager have each added for the next conversation.</p>
        {openTopics.length === 0 ? (
          <div className="empty"><div className="big">Nothing on the agenda</div>Add a topic from My 1:1 so the conversation has a shape.</div>
        ) : (
          <ul className="list">
            {openTopics.slice(0, 5).map((t) => (
              <li key={t.id}>
                <div className="item-body">
                  <div className="item-text">{t.text}</div>
                  <div className="item-meta"><Badge cls="b-purple">{t.category}</Badge><span>{t.created_by_name} · {ago(t.created_at)}</span></div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Coming up</h2>
        <p className="card-note">Actions due soon or already past their date.</p>
        {soonActions.length === 0 ? (
          <div className="empty"><div className="big">Nothing due soon</div>Actions with a date in the next two weeks show up here.</div>
        ) : (
          <ul className="list">
            {soonActions.map((a) => (
              <li key={a.id}>
                <div className="item-body">
                  <div className="item-text">{a.text}</div>
                  <div className="item-meta"><span>{a.owner_label} · due {fmtDate(a.due_date)}</span></div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Recent conversations</h2>
        {history.length === 0 ? (
          <div className="empty"><div className="big">Your story starts here</div>Everything you two do together builds up in this space.</div>
        ) : (
          <ul className="list timeline">
            {history.slice(0, 4).map((h, i) => (
              <li key={i}>
                <div className="item-body">
                  <div className="item-text">{h.title}</div>
                  <div className="item-meta"><Badge cls="b-purple">{h.cat}</Badge><span>{h.who || ""} · {ago(h.at)}</span></div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Updates</h2>
          <button className="btn ghost sm" onClick={markRead}>Mark all read</button>
        </div>
        <p className="card-note">Alerts appear here for both of you.</p>
        {notifications.length === 0 ? (
          <div className="empty"><div className="big">No updates</div>Nothing new from {partnerName}.</div>
        ) : (
          groupedNotifications.slice(0, 8).map((g) => (
            <div className={`notif${g.unread ? " unread" : ""}`} key={g.key}>
              <div style={{ display: "flex", gap: 8 }}>
                {g.unread && <span className="udot" />}
                <div>
                  <div className="item-text">
                    {g.count === 1 ? g.text : g.label}
                    {g.count > 1 && <span className="badge b-amber" style={{ marginLeft: 6 }}>{g.count}</span>}
                  </div>
                  {g.count > 1 && g.details.length > 0 && (
                    <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                      {g.details.map((d, i) => (
                        <li key={i} className="item-meta">{d}</li>
                      ))}
                    </ul>
                  )}
                  <div className="item-meta">{ago(g.createdAt)}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
