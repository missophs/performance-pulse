// The one and only AI call anywhere in this app (Melissa's call,
// 2026-09-18) -- see web-app/CLAUDE.md's governance rule: this exists
// specifically to summarize the private manager<->employee conversation on
// demand, is never run automatically, and its output is always labeled as
// AI-generated and reviewable/editable by the manager before it's treated
// as final. Server-only -- needs ANTHROPIC_API_KEY, which must stay
// server-side.

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// messages: [{ author: string, text: string }, ...], oldest first.
export async function summarizeConversation(messages) {
  const transcript = messages.map((m) => `${m.author}: ${m.text}`).join("\n");
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content:
          "Summarize the following private 1:1 conversation between a manager and their employee, in 3-5 plain sentences. " +
          "Focus on what was actually discussed and any commitments made. Do not invent anything not present in the " +
          "conversation, and do not add advice, judgment, or a performance rating.\n\n" +
          transcript,
      },
    ],
  });
  return response.content.find((b) => b.type === "text")?.text?.trim() || "";
}
