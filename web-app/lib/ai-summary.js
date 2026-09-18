// The one and only AI call anywhere in this app (Melissa's call,
// 2026-09-18, revised same day once she confirmed the source should be the
// structured 1:1 data already in the app -- topics, goals, actions, and
// past wrap-up notes -- not the private Slack DM). See web-app/CLAUDE.md's
// governance rule: never automatic, output always labeled AI-generated and
// reviewable/editable by the manager before it's treated as final.
// Server-only -- needs ANTHROPIC_API_KEY, which must stay server-side.

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Builds a plain-text transcript of everything logged for a pair -- see
// callers for the exact field names (they match the modals in slack-views.js).
export function buildOneOnOneTranscript({ topics, goals, actions, meetings }) {
  const lines = [];
  if (topics?.length) {
    lines.push("Topics:");
    topics.forEach((t) => lines.push(`- ${t.text} (${t.category}, ${t.status || "open"})${t.why ? ` -- ${t.why}` : ""}`));
  }
  if (goals?.length) {
    lines.push("\nGoals:");
    goals.forEach((g) => lines.push(`- ${g.text} (${g.status}, ${g.progress || 0}%)${g.why ? ` -- ${g.why}` : ""}`));
  }
  if (actions?.length) {
    lines.push("\nActions:");
    actions.forEach((a) => lines.push(`- ${a.text} (owner: ${a.owner_label}, ${a.status})${a.due_date ? `, due ${a.due_date}` : ""}`));
  }
  if (meetings?.length) {
    lines.push("\nPast 1:1 notes:");
    meetings.forEach((m) => {
      const parts = [m.discussed && `discussed: ${m.discussed}`, m.agreed && `agreed: ${m.agreed}`, m.revisit && `revisit: ${m.revisit}`];
      lines.push(`- ${m.meeting_date} -- ${parts.filter(Boolean).join("; ")}`);
    });
  }
  return lines.join("\n").trim();
}

export async function summarizeOneOnOne(data) {
  const transcript = buildOneOnOneTranscript(data);
  if (!transcript) return "";
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content:
          "Summarize the following 1:1 history between a manager and their employee -- topics, goals, actions, and " +
          "past meeting notes logged in their shared tracking app -- in 3-5 plain sentences. Focus on what's been " +
          "discussed and where things currently stand. Do not invent anything not present below, and do not add " +
          "advice, judgment, or a performance rating.\n\n" +
          transcript,
      },
    ],
  });
  return response.content.find((b) => b.type === "text")?.text?.trim() || "";
}
