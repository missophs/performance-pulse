// The one and only AI call anywhere in this app (Melissa's call,
// 2026-09-18, revised same day once she confirmed the source should be the
// structured 1:1 data already in the app -- topics, goals, actions, and
// past wrap-up notes -- not the private Slack DM). See web-app/CLAUDE.md's
// governance rule: never automatic, output always labeled AI-generated and
// reviewable/editable by the manager before it's treated as final.
// Server-only -- needs ANTHROPIC_API_KEY, which must stay server-side.

import Anthropic from "@anthropic-ai/sdk";
import { topicStatusBadge } from "@/lib/badges";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// One header + one line per item, skipped entirely when the list is empty.
function section(header, items, fmt) {
  return items?.length ? [header, ...items.map(fmt)] : [];
}

// Builds a plain-text transcript of everything logged for a pair -- see
// callers for the exact field names (they match the modals in slack-views.js).
// Topic status reuses topicStatusBadge (lib/badges.js) instead of the raw DB
// value, so the AI sees the same wording ("Not yet discussed") the Slack/
// website UI already shows instead of the literal word "open".
export function buildOneOnOneTranscript({ topics, goals, actions, meetings }) {
  const lines = [
    ...section("Topics:", topics, (t) => `- ${t.text} (${t.category}, ${topicStatusBadge(t.status).label})${t.why ? ` -- ${t.why}` : ""}`),
    ...section("\nGoals:", goals, (g) => `- ${g.text} (${g.status}, ${g.progress || 0}%)${g.why ? ` -- ${g.why}` : ""}`),
    ...section("\nActions:", actions, (a) => `- ${a.text} (owner: ${a.owner_label}, ${a.status})${a.due_date ? `, due ${a.due_date}` : ""}`),
    // Includes Start/Stop/Keep, not just Discussed/Agreed/Revisit -- these are
    // real logged retro notes (see meetingBlocks, lib/slack-views.js) that the
    // transcript used to drop silently.
    ...section("\nPast 1:1 notes:", meetings, (m) => {
      const parts = [
        m.discussed && `discussed: ${m.discussed}`,
        m.agreed && `agreed: ${m.agreed}`,
        m.revisit && `revisit: ${m.revisit}`,
        m.start_line && `start: ${m.start_line}`,
        m.stop_line && `stop: ${m.stop_line}`,
        m.keep_line && `keep: ${m.keep_line}`,
      ];
      return `- ${m.meeting_date} -- ${parts.filter(Boolean).join("; ")}`;
    }),
  ];
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
