"use client";

// Export tab logic — ported from pulse.html's buildExportHtml() / wrapDoc() /
// downloadWord() / buildExportRows() / downloadExcel() / openPdfWindow()
// (search that file for those names). Same assembly logic, same restraint
// about what gets included, sourced from Supabase list* calls instead of the
// original in-memory `data` blob.

import { today } from "@/lib/format";

export const EXPORT_SCOPE_IDS = [
  "current1on1",
  "past1on1s",
  "goals",
  "development",
  "performance",
  "career",
  "actions",
  "concerns",
  "review",
];

function esc(s) {
  return String(s == null ? "" : s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function ul(items) {
  // An empty section is left out of the file entirely — no "nothing recorded" filler.
  if (!items.length) return "";
  return `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
}

/**
 * bundle: { scopes, empName, mgrName, exportedBy, pair, topics, pendingCheckins,
 *           selectedMeetings, goals, devPlans, achievements, feedback, career,
 *           actions, concerns, reviewDraft }
 */
export function buildExportHtml(bundle) {
  const {
    scopes,
    empName,
    mgrName,
    exportedBy,
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
  } = bundle;

  const H = [];
  H.push("<h1>Performance Pulse</h1>");
  H.push(
    `<p><strong>${esc(empName)}</strong> and <strong>${esc(mgrName)}</strong><br>` +
      `Exported by ${esc(exportedBy)} on ${new Date().toLocaleString()}</p>`
  );
  H.push(
    `<p style="padding:10px;border:1px solid #ccc;background:#f6f4fc;"><em>This file was created intentionally by ${esc(
      exportedBy
    )}. It was not generated or sent automatically.</em></p>`
  );

  function section(title, body) {
    if (!body) return;
    H.push(`<h2>${title}</h2>${body}`);
  }

  if (scopes.current1on1) {
    let body =
      `<p><strong>Scheduled:</strong> ${
        pair?.next_1on1_date ? `${fmtDate(pair.next_1on1_date)} ${fmtTime(pair.next_1on1_time)}` : "Not scheduled"
      }<br>` + `<strong>Focus:</strong> ${esc(pair?.next_1on1_focus || "—")}</p>`;
    body += ul(
      topics.map((t) => {
        return (
          `<strong>${esc(t.text)}</strong> [${esc(t.category)} — ${esc(
            t.status === "open" ? "not yet discussed" : t.status
          )}]` +
          (t.why ? `<br>${esc(t.why)}` : "") +
          (t.notes ? `<br><em>Note: ${esc(t.notes)}</em>` : "") +
          `<br><small>Added by ${esc(t.created_by_name)}</small>`
        );
      })
    );
    if (pendingCheckins.length) {
      body += "<h3>Check-in preparation</h3>";
      pendingCheckins.forEach((c) => {
        body +=
          `<p><strong>${c.role === "manager" ? "Manager" : "Employee"} check-in</strong></p>` +
          ul(
            (c.asked || [])
              .filter((a) => a.answer)
              .map((a) => `<strong>${esc(String(a.q).replace(/<[^>]*>/g, ""))}</strong><br>${esc(a.answer)}`)
          );
      });
    }
    section("1:1 — prepared and ready", body);
  }

  if (scopes.past1on1s) {
    section(
      "1:1 updates",
      ul(
        selectedMeetings.map((m) => {
          return (
            `<strong>${fmtDate(m.meeting_date)}</strong>` +
            (m.discussed ? `<br><strong>Discussed:</strong> ${esc(m.discussed)}` : "") +
            (m.agreed ? `<br><strong>Agreed:</strong> ${esc(m.agreed)}` : "") +
            (m.revisit ? `<br><strong>To revisit:</strong> ${esc(m.revisit)}` : "") +
            (m.start_line || m.stop_line || m.keep_line
              ? `<br><strong>Start · Stop · Continue:</strong> ${esc(m.start_line || "—")} · ${esc(
                  m.stop_line || "—"
                )} · ${esc(m.keep_line || "—")}`
              : "") +
            (m.checkin90_date ? `<br><strong>90-day check-in:</strong> ${esc(fmtDate(m.checkin90_date))}` : "")
          );
        })
      )
    );
  }

  if (scopes.goals) {
    section(
      "Goals",
      ul(
        goals.map((g) => {
          return (
            `<strong>${esc(g.text)}</strong> [${esc(g.status)}, ${g.progress || 0}%]` +
            (g.why ? `<br><strong>Why:</strong> ${esc(g.why)}` : "") +
            (g.measure ? `<br><strong>Success measure:</strong> ${esc(g.measure)}` : "") +
            `<br><strong>Owner:</strong> ${esc(g.owner_label || empName)}` +
            (g.target_date ? ` &middot; <strong>Target:</strong> ${esc(g.target_date)}` : "") +
            (g.obstacles ? `<br><strong>Obstacles:</strong> ${esc(g.obstacles)}` : "") +
            (g.support ? `<br><strong>Support needed:</strong> ${esc(g.support)}` : "")
          );
        })
      )
    );
  }

  if (scopes.development) {
    section(
      "Development plan",
      ul(
        devPlans.map((d) => {
          return (
            `<strong>${esc(d.area)}</strong> [${esc(d.type)} — ${esc(d.status)}]` +
            (d.why ? `<br><strong>Why:</strong> ${esc(d.why)}` : "") +
            (d.activity ? `<br><strong>Activity:</strong> ${esc(d.activity)}` : "") +
            (d.support ? `<br><strong>Manager support:</strong> ${esc(d.support)}` : "") +
            (d.measure ? `<br><strong>Success measure:</strong> ${esc(d.measure)}` : "") +
            (d.target_date ? `<br><strong>Target:</strong> ${esc(d.target_date)}` : "")
          );
        })
      )
    );
  }

  if (scopes.performance) {
    section(
      "Achievements",
      ul(
        achievements.map((a) => {
          return (
            `<strong>${esc(a.title)}</strong> [${esc(a.category)}]` +
            (a.impact ? `<br>${esc(a.impact)}` : "") +
            `<br><small>${esc(a.achievement_date)} — ${esc(a.created_by_name)}</small>`
          );
        })
      )
    );
    section(
      "Feedback",
      ul(
        feedback.map((f) => {
          return (
            `<strong>${esc(f.type)}</strong> — ${esc(f.from_name)} to ${esc(f.to_name)}` +
            `<br>${esc(f.text)}` +
            (f.example ? `<br><em>Example: ${esc(f.example)}</em>` : "")
          );
        })
      )
    );
  }

  if (scopes.career) {
    section(
      "Career conversations",
      ul(career.map((c) => `<strong>${esc(c.question)}</strong><br>${esc(c.answer)}<br><small>${esc(c.created_by_name)}</small>`))
    );
  }

  if (scopes.actions) {
    section(
      "Action items",
      ul(
        actions.map((a) => {
          return (
            `<strong>${esc(a.text)}</strong> [${esc(a.status)}]<br>` +
            `Owner: ${esc(a.owner_label)}` +
            (a.due_date ? ` &middot; Due: ${esc(a.due_date)}` : "") +
            (a.notes ? `<br>${esc(a.notes)}` : "")
          );
        })
      )
    );
  }

  if (scopes.concerns) {
    section(
      "Manager updates",
      ul(
        concerns.map((c) => {
          return (
            `<strong>${esc(c.what)}</strong>` +
            (c.concern_date ? `<br><strong>When:</strong> ${esc(c.concern_date)}` : "") +
            (c.expectation ? `<br><strong>Expectation:</strong> ${esc(c.expectation)}` : "") +
            (c.communicated ? `<br><strong>Communicated:</strong> ${esc(c.communicated)}` : "") +
            (c.previously ? `<br><strong>Discussed before:</strong> ${esc(c.previously)}` : "") +
            (c.support ? `<br><strong>Support provided:</strong> ${esc(c.support)}` : "") +
            (c.outcome ? `<br><strong>Outcome sought:</strong> ${esc(c.outcome)}` : "")
          );
        })
      )
    );
  }

  if (scopes.review && reviewDraft) {
    section("Review & preparation — draft", `<pre style="font-family:inherit;white-space:pre-wrap;">${esc(reviewDraft)}</pre>`);
  }

  return H.join("\n");
}

export function wrapDoc(inner) {
  return (
    "<html xmlns:w='urn:schemas-microsoft-com:office:word'><head><meta charset='utf-8'>" +
    "<title>Performance Pulse</title><style>" +
    "body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#222;line-height:1.45;max-width:800px;margin:24px auto;padding:0 16px;}" +
    "h1{font-size:20pt;color:#5b21b6;margin-bottom:4px;}h2{font-size:14pt;color:#7c3aed;margin-top:22px;border-bottom:1px solid #ddd;padding-bottom:4px;}" +
    "h3{font-size:12pt;margin-top:14px;}li{margin-bottom:9px;}small{color:#666;}" +
    "</style></head><body>" +
    inner +
    "</body></html>"
  );
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadWord(name, inner) {
  const blob = new Blob(["﻿", wrapDoc(inner)], { type: "application/msword" });
  triggerDownload(blob, `${name}-${today()}.doc`);
}

export function openPdfWindow(inner) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(wrapDoc(inner));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
  return true;
}

/** Excel gets a flat table: one row per item, same scope choices as Word/PDF. */
export function buildExportRows(bundle) {
  const { scopes, empName, exportedBy, topics, selectedMeetings, goals, devPlans, achievements, feedback, career, actions, concerns, reviewDraft } =
    bundle;
  const rows = [["Section", "Item", "Detail", "Status", "Who", "Date"]];
  function row(section, item, detail, status, who, date) {
    rows.push([section, item || "", detail || "", status || "", who || "", date || ""]);
  }
  if (scopes.current1on1)
    topics.forEach((t) => {
      row("1:1 preparation", t.text, [t.why, t.notes].filter(Boolean).join(" — "), t.status, t.created_by_name, "");
    });
  if (scopes.past1on1s)
    selectedMeetings.forEach((m) => {
      row(
        "1:1 update",
        "1:1 summary",
        ["Discussed: " + (m.discussed || "—"), m.agreed ? "Agreed: " + m.agreed : "", m.revisit ? "Revisit: " + m.revisit : ""]
          .filter(Boolean)
          .join(" | "),
        "",
        "",
        m.meeting_date
      );
    });
  if (scopes.goals)
    goals.forEach((g) => {
      row(
        "Goals",
        g.text,
        [g.why, g.measure].filter(Boolean).join(" — "),
        `${g.status}, ${g.progress || 0}%`,
        g.owner_label || empName,
        g.target_date || ""
      );
    });
  if (scopes.development)
    devPlans.forEach((d) => {
      row(
        "Development",
        d.area,
        [d.activity, d.support ? "Support: " + d.support : ""].filter(Boolean).join(" — "),
        d.status,
        "",
        d.target_date || ""
      );
    });
  if (scopes.performance) {
    achievements.forEach((a) => {
      row("Achievements", a.title, a.impact, a.category, a.created_by_name, a.achievement_date);
    });
    feedback.forEach((f) => {
      row("Feedback", f.type, f.text, "", `${f.from_name} to ${f.to_name}`, "");
    });
  }
  if (scopes.career)
    career.forEach((c) => {
      row("Career", c.question, c.answer, "", c.created_by_name, "");
    });
  if (scopes.actions)
    actions.forEach((a) => {
      row("Actions", a.text, a.notes, a.status, a.owner_label, a.due_date || "");
    });
  if (scopes.concerns)
    concerns.forEach((c) => {
      row(
        "Updates",
        c.what,
        [
          c.expectation ? "Expectation: " + c.expectation : "",
          c.support ? "Support: " + c.support : "",
          c.outcome ? "Outcome sought: " + c.outcome : "",
        ]
          .filter(Boolean)
          .join(" | "),
        "",
        "",
        c.concern_date || ""
      );
    });
  if (scopes.review && reviewDraft) row("Review draft", "Prepared by " + exportedBy, reviewDraft, "", exportedBy, "");
  return rows;
}

export function downloadExcel(rows) {
  const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  // BOM so Excel reads accented characters correctly
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, `performance-pulse-${today()}.csv`);
}

/** Raw JSON dump — scoped to whatever is currently checked, same as the other three formats. */
export function buildExportJson(bundle) {
  const {
    scopes,
    empName,
    mgrName,
    exportedBy,
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
  } = bundle;

  const out = { employee: empName, manager: mgrName, exportedBy, exportedAt: new Date().toISOString() };
  if (scopes.current1on1) {
    out.current1on1 = {
      next1on1: { date: pair?.next_1on1_date || null, time: pair?.next_1on1_time || null, focus: pair?.next_1on1_focus || "" },
      topics,
      pendingCheckins,
    };
  }
  if (scopes.past1on1s) out.past1on1s = selectedMeetings;
  if (scopes.goals) out.goals = goals;
  if (scopes.development) out.development = devPlans;
  if (scopes.performance) {
    out.achievements = achievements;
    out.feedback = feedback;
  }
  if (scopes.career) out.career = career;
  if (scopes.actions) out.actions = actions;
  if (scopes.concerns) out.concerns = concerns;
  if (scopes.review && reviewDraft) out.reviewDraft = reviewDraft;
  return out;
}

export function downloadJson(obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  triggerDownload(blob, `performance-pulse-data-${today()}.json`);
}
