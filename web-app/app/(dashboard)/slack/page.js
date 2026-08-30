"use client";

import { useEffect, useState } from "react";
import { usePulse } from "@/components/PulseContext";
import { useToast } from "@/components/ui/ToastProvider";
import { listTopics, listActions, listDevelopmentPlans, getPair } from "@/lib/data";
import { isOpenTopic, fmtDate, fmtTime } from "@/lib/format";
import { BK_KINDS, buildBlockKit } from "@/lib/block-kit";

function canPing() {
  return typeof window !== "undefined" && typeof Notification !== "undefined";
}

export default function SlackPage() {
  const { pairId, isMgr, myName, partnerName, supabase } = usePulse();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [pair, setPair] = useState(null);
  const [topics, setTopics] = useState([]);
  const [actions, setActions] = useState([]);
  const [devPlans, setDevPlans] = useState([]);

  const [pingSupported, setPingSupported] = useState(false);
  const [pingPermission, setPingPermission] = useState("default");
  const [bkKind, setBkKind] = useState("topic");

  async function loadAll() {
    setLoading(true);
    const [p, t, a, d] = await Promise.all([
      getPair(supabase, pairId),
      listTopics(supabase, pairId),
      listActions(supabase, pairId),
      listDevelopmentPlans(supabase, pairId),
    ]);
    setPair(p);
    setTopics(t);
    setActions(a);
    setDevPlans(d);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairId]);

  useEffect(() => {
    refreshPingState();
  }, []);

  function refreshPingState() {
    if (canPing()) {
      setPingSupported(true);
      setPingPermission(Notification.permission);
    } else {
      setPingSupported(false);
    }
  }

  function sendPing(title, text) {
    toast(title, text);
    if (!canPing() || Notification.permission !== "granted") return false;
    try {
      const n = new Notification(title, { body: text, tag: "performance-pulse" });
      n.onclick = () => {
        window.focus();
        n.close();
      };
      return true;
    } catch (e) {
      return false;
    }
  }

  function enablePing() {
    if (!canPing()) {
      refreshPingState();
      return;
    }
    try {
      const r = Notification.requestPermission(() => refreshPingState());
      if (r && typeof r.then === "function") r.then(() => refreshPingState());
    } catch (e) {
      refreshPingState();
    }
  }

  function testPing() {
    const ok = sendPing("Performance Pulse", `${partnerName} added a topic to your 1:1 agenda.`);
    if (!ok && canPing() && Notification.permission !== "granted") {
      toast("Toast only", "Desktop pings aren't switched on, so this stayed inside the app.");
    }
    refreshPingState();
  }

  async function copyJson(json) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(json);
        toast("Copied", "Paste it into Slack's Block Kit Builder to see it render.");
      } catch (e) {
        toast("Couldn't copy", "Select the JSON and copy it by hand — the browser blocked the clipboard.");
      }
    } else {
      toast("Couldn't copy", "Select the JSON and copy it by hand — the browser blocked the clipboard.");
    }
  }

  if (loading) return <section><h1>Slack</h1><p className="subtitle">Loading…</p></section>;

  const openTopicsCount = topics.filter(isOpenTopic).length;
  const mineActionsCount = actions.filter((a) => a.status !== "Done" && (a.owner_label === myName || a.owner_label === "Both of us")).length;
  const next1on1When = pair?.next_1on1_date ? `${fmtDate(pair.next_1on1_date)} at ${fmtTime(pair.next_1on1_time)}` : "not in the diary yet";

  const kind = BK_KINDS.find((k) => k.id === bkKind) || BK_KINDS[0];
  const payload = buildBlockKit(bkKind, {
    partnerName,
    isMgr,
    openTopicsCount,
    next1on1When,
    mineActionsCount,
    devPlansCount: devPlans.length,
  });
  const json = JSON.stringify(payload, null, 2);

  return (
    <section>
      <h1>Slack</h1>
      <p className="subtitle">A ping that finds you, and the Block Kit layout behind it.</p>

      <div className="privacy-banner">
        <strong>Pings never carry performance content.</strong> Slack workspace admins can export DM history, so a message here only says that something happened. The substance stays in this app, between the two of you.
      </div>

      <div className="card">
        <h2>The ping</h2>
        <p className="card-note">A notification that arrives on its own, instead of a bell you have to remember to check.</p>
        <div className="btn-row">
          <button className="btn" onClick={enablePing}>Turn on desktop pings</button>
          <button className="btn secondary" onClick={testPing}>Send a test ping</button>
        </div>
        <div className="limits">
          {!pingSupported ? (
            "This browser doesn't offer desktop notifications. The in-app toast still works."
          ) : pingPermission === "granted" ? (
            <>
              <strong>Desktop pings are on.</strong> They fire only while this page is open in a tab. Nothing can reach you once
              it&rsquo;s closed &mdash; that needs a server pushing to you, which this tab doesn&rsquo;t have.
            </>
          ) : pingPermission === "denied" ? (
            <>
              <strong>Your browser has blocked notifications for this page.</strong> Turn them back on in your browser&rsquo;s
              settings for this site, then reload.
            </>
          ) : (
            "Not on yet — your browser will ask once. Toasts inside the app work either way."
          )}
        </div>
      </div>

      <div className="card">
        <h2>Block Kit layouts</h2>
        <p className="card-note">
          Pick a ping. The JSON is valid Block Kit built from what is actually in this workspace right now &mdash; paste it into
          Slack&rsquo;s Block Kit Builder and it renders as a real message.
        </p>
        <div className="filters">
          {BK_KINDS.map((k) => (
            <button key={k.id} className={`chip${k.id === bkKind ? " active" : ""}`} onClick={() => setBkKind(k.id)}>
              {k.label}
            </button>
          ))}
        </div>
        <div className="code-head">
          <span style={{ fontSize: 12, color: "var(--faint)" }}>
            Sent to {myName} · {kind.label}
          </span>
          <div className="btn-row" style={{ margin: 0 }}>
            <button className="btn ghost sm" onClick={() => copyJson(json)}>Copy JSON</button>
            <button className="btn ghost sm" onClick={() => window.open("https://app.slack.com/block-kit-builder", "_blank", "noopener")}>
              Open Block Kit Builder
            </button>
          </div>
        </div>
        <pre className="code">{json}</pre>
        <div className="limits">
          Block Kit describes how a Slack message <em>looks</em>. It is not what delivers it. Sending these for real needs a
          Slack app with a server behind it, which also means performance data would live on that server rather than staying
          scoped to just the two of you here.
        </div>
      </div>
    </section>
  );
}
