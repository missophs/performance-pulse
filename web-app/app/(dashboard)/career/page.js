"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePulse } from "@/components/PulseContext";
import { useToast } from "@/components/ui/ToastProvider";
import { listCareerAnswers, saveCareerAnswers, notify } from "@/lib/data";
import { ago } from "@/lib/format";
import { EMP_CAREER, MGR_CAREER } from "@/lib/career-content";
import Badge from "@/components/ui/Badge";

export default function CareerPage() {
  const { pairId, role, isMgr, myName, partnerName, supabase } = usePulse();
  const toast = useToast();
  const router = useRouter();
  const otherRole = isMgr ? "employee" : "manager";
  const employeeName = isMgr ? partnerName : myName;

  const [loading, setLoading] = useState(true);
  const [career, setCareer] = useState([]);
  const [answers, setAnswers] = useState({});

  const prompts = (isMgr ? MGR_CAREER : EMP_CAREER).map((q) => q.replace("{emp}", employeeName));

  async function loadAll() {
    setLoading(true);
    const c = await listCareerAnswers(supabase, pairId);
    setCareer(c);
    const next = {};
    prompts.forEach((q) => {
      const existing = c.find((x) => x.role === role && x.question === q);
      next[q] = existing ? existing.answer : "";
    });
    setAnswers(next);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairId, role]);

  async function handleSave() {
    const promptList = prompts.map((q) => ({ question: q, answer: answers[q] || "" }));
    const changed = promptList.some(({ question, answer }) => {
      const existing = career.find((c) => c.role === role && c.question === question);
      const trimmed = answer.trim();
      return trimmed ? (existing ? existing.answer !== trimmed : true) : !!existing;
    });
    await saveCareerAnswers(supabase, pairId, role, myName, promptList, career);
    if (changed) {
      try {
        await notify(supabase, pairId, `${myName} updated their career conversation`, role, otherRole, "career");
      } catch {
        // best effort
      }
      toast("Saved", "Your career answers were updated.");
    } else {
      toast("Nothing to save", "No answers changed.");
    }
    loadAll();
  }

  function handleCareerToDev() {
    const mine = career.filter((c) => c.role === role);
    const skills = mine.find((c) => /skills/i.test(c.question));
    const exp = mine.find((c) => /experience|responsibilit/i.test(c.question));
    const params = new URLSearchParams({ seed: "1", seedWhy: "Came out of a career conversation." });
    if (skills) params.set("seedArea", skills.answer.slice(0, 80));
    if (exp) params.set("seedActivity", exp.answer);
    router.push(`/development?${params.toString()}`);
  }

  const timeline = career.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return (
    <section>
      <h1>Career</h1>
      <p className="subtitle">Where you want to go, and what would help you get there. Nothing here promises a promotion — it's a conversation, not a commitment.</p>

      <div className="card">
        <h2>{isMgr ? `How you see ${employeeName} growing` : "Where you want to go"}</h2>
        <p className="card-note">
          {isMgr
            ? "Answer what you can. Nothing here is a promise of promotion — it's how you'd help them get there."
            : "Answer what you can. Your manager sees these, and you can turn any of it into a development plan."}
        </p>
        {loading ? (
          <p className="card-note">Loading…</p>
        ) : (
          <>
            {prompts.map((q, i) => (
              <div className="field" key={i}>
                <label htmlFor={`cr${i}`}>{q}</label>
                <textarea
                  id={`cr${i}`}
                  placeholder="Say as much or as little as you like…"
                  value={answers[q] || ""}
                  onChange={(e) => setAnswers({ ...answers, [q]: e.target.value })}
                />
              </div>
            ))}
            <button className="btn" onClick={handleSave}>Save my answers</button>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>What you've both said</h2>
          <button className="btn secondary sm" onClick={handleCareerToDev}>Turn this into a development plan</button>
        </div>
        {timeline.length === 0 ? (
          <div className="empty"><div className="big">Nothing here yet</div>Answer a few prompts above to start the conversation.</div>
        ) : (
          <ul className="list timeline">
            {timeline.map((c) => (
              <li key={c.id}>
                <div className="item-body">
                  <div className="item-text">{c.question}</div>
                  <div className="item-sub">{c.answer}</div>
                  <div className="item-meta">
                    <Badge cls={c.role === "manager" ? "b-pink" : "b-cyan"}>{c.created_by_name}</Badge>
                    <span>{ago(c.created_at)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
