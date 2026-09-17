// Slack Block Kit generator — ported verbatim from pulse.html's blockKit()
// (search that file for BK_KINDS / function blockKit). This is
// presentation-only: it builds real Block Kit JSON for the user to paste
// into Slack's Block Kit Builder. It never calls Slack, and it never embeds
// topic/feedback/goal/concern text — only counts and dates. That restraint
// is the point (see the privacy banner on the Slack tab) — do not "improve"
// this into something that includes content.

export const BK_KINDS = [
  { id: "topic", label: "Topic added" },
  { id: "upcoming", label: "1:1 coming up" },
  { id: "feedback", label: "Feedback waiting" },
  { id: "request", label: "Feedback asked for" },
  { id: "dev", label: "Development plan" },
  { id: "goal", label: "Goal added" },
  { id: "achievement", label: "Achievement logged" },
  { id: "action", label: "Action due" },
  { id: "wrap", label: "1:1 wrapped up" },
  { id: "concern", label: "Concern shared" },
];

function bkSection(md) {
  return { type: "section", text: { type: "mrkdwn", text: md } };
}
function bkContext(md) {
  return { type: "context", elements: [{ type: "mrkdwn", text: md }] };
}
function bkHeader() {
  return { type: "header", text: { type: "plain_text", text: "Performance Pulse", emoji: true } };
}
// Acts right here in Slack, via the interactivity endpoint -- no website
// link (Melissa's call, 2026-09-17: Slack is the product, not a gateway to
// it). `value`, when given, is the id of the specific record this button
// acts on (e.g. a feedback request), threaded through to the interactivity
// route's OPENERS the same way any other Slack-supplied id gets there.
function bkOpenAction(label, inSlackActionId, value) {
  return {
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: label || "Open in Slack", emoji: true },
        style: "primary",
        action_id: inSlackActionId,
        ...(value !== undefined && value !== null && value !== "" ? { value: String(value) } : {}),
      },
    ],
  };
}
function bkFoot() {
  return bkContext(
    ":lock: Nothing about your performance is in this message. The detail stays in the app, visible only to you and your manager."
  );
}

// Singular/plural nouns for the digest's count line. BK_KINDS labels read as
// event names ("Goal added"), which don't compose into "2 goals · 1 topic".
const KIND_NOUNS = {
  topic: ["topic", "topics"],
  upcoming: ["1:1 reminder", "1:1 reminders"],
  feedback: ["piece of feedback", "pieces of feedback"],
  request: ["feedback request", "feedback requests"],
  dev: ["development plan", "development plans"],
  goal: ["goal", "goals"],
  achievement: ["achievement", "achievements"],
  action: ["action", "actions"],
  wrap: ["1:1 wrap-up", "1:1 wrap-ups"],
  concern: ["concern", "concerns"],
};

/**
 * One DM covering several notifications that landed together, so adding three
 * goals in a row is one message instead of three. Same privacy rule as
 * buildBlockKit: counts and kinds only, never what anyone actually wrote.
 * kindCounts: [{ kind, count }], highest count first.
 */
export function buildDigestBlockKit(kindCounts, ctx) {
  const total = kindCounts.reduce((n, k) => n + k.count, 0);
  const parts = kindCounts.map(({ kind, count }) => {
    const noun = KIND_NOUNS[kind] || ["update", "updates"];
    return `${count} ${count === 1 ? noun[0] : noun[1]}`;
  });
  return {
    text: `${ctx.partnerName} made ${total} updates`,
    blocks: [
      bkHeader(),
      bkSection(`*${ctx.partnerName}* made ${total} updates.`),
      bkContext(parts.join("  ·  ")),
      { type: "divider" },
      bkFoot(),
    ],
  };
}

/**
 * Build a Block Kit payload for one ping kind, from live counts only.
 * ctx: { partnerName, isMgr, openTopicsCount, next1on1When, mineActionsCount,
 *        devPlansCount, requestId }
 * requestId (kind "request" only): the specific feedback_requests row this
 * ping is about, so "Answer it" can open a modal that both saves the entry
 * and closes that exact request (see SLACK_TODO.md item 0e) instead of a
 * generic, unlinked "Give feedback" modal.
 */
export function buildBlockKit(kind, ctx) {
  const { partnerName, isMgr, openTopicsCount, next1on1When, mineActionsCount, devPlansCount, requestId } = ctx;
  const b = [bkHeader()];
  let text = "";

  if (kind === "topic") {
    text = `${partnerName} added a topic to your 1:1 agenda`;
    b.push(bkSection(`*${partnerName}* added a topic to your 1:1 agenda.`));
    b.push(bkContext(`${openTopicsCount} topic${openTopicsCount === 1 ? "" : "s"} open  ·  Next 1:1 ${next1on1When}`));
    b.push(bkOpenAction("See the agenda", "open_list_topics"));
  } else if (kind === "upcoming") {
    text = `Your 1:1 with ${partnerName} is ${next1on1When}`;
    b.push(bkSection(`Your 1:1 with *${partnerName}* is *${next1on1When}*.`));
    b.push(
      bkContext(
        openTopicsCount
          ? `${openTopicsCount} topic${openTopicsCount === 1 ? "" : "s"} waiting  ·  Worth ten minutes of prep`
          : "Nothing on the agenda yet"
      )
    );
    b.push(bkOpenAction("Prepare for it", "open_list_topics"));
  } else if (kind === "feedback") {
    text = `${partnerName} left you feedback`;
    b.push(bkSection(`*${partnerName}* left you feedback.`));
    b.push(bkContext("Read it when you have a quiet minute, not between meetings."));
    b.push(bkOpenAction("Read it", "open_list_feedback"));
  } else if (kind === "request") {
    text = `${partnerName} asked you for feedback`;
    b.push(bkSection(`*${partnerName}* asked you for feedback.`));
    b.push(bkContext("No deadline. Answer it whenever you're ready."));
    // With a requestId, "Answer it" opens a modal that both saves the entry
    // and closes this exact request (see SLACK_TODO.md item 0e). Without
    // one — an older notification row from before this column existed, or
    // any other gap — fall back to the plain, unlinked feedback modal
    // rather than erroring, same as this button always behaved before.
    b.push(bkOpenAction("Answer it", requestId ? "open_answer_feedback_request" : "open_add_feedback", requestId));
  } else if (kind === "dev") {
    text = `${partnerName} added a development plan`;
    b.push(bkSection(`*${partnerName}* ${isMgr ? "requested" : "recommended"} a development plan for you.`));
    b.push(
      bkContext(
        `${devPlansCount} plan${devPlansCount === 1 ? "" : "s"} in the workspace  ·  Nothing is agreed until you both say so`
      )
    );
    b.push(bkOpenAction("Take a look", "open_list_devplans"));
  } else if (kind === "goal") {
    text = `${partnerName} added a goal`;
    b.push(bkSection(`*${partnerName}* added a goal.`));
    b.push(bkContext("Nothing to approve — it's there for your next 1:1."));
    b.push(bkOpenAction("Take a look", "open_list_goals"));
  } else if (kind === "achievement") {
    text = `${partnerName} logged an achievement`;
    b.push(bkSection(`*${partnerName}* logged an achievement.`));
    b.push(bkContext("Worth reading now, so review time isn't a scramble to remember."));
    b.push(bkOpenAction("See it", "open_list_achievements"));
  } else if (kind === "action") {
    text = `${mineActionsCount} action${mineActionsCount === 1 ? "" : "s"} assigned to you`;
    b.push(bkSection(`You have *${mineActionsCount} open action${mineActionsCount === 1 ? "" : "s"}* from your 1:1s.`));
    b.push(bkContext("Listed in the app with owners and dates. No nagging, no scores."));
    b.push(bkOpenAction("See what's open", "open_list_actions"));
  } else if (kind === "concern") {
    text = `${partnerName} shared something with you in Concerns`;
    b.push(bkSection(`*${partnerName}* shared something with you in Concerns.`));
    b.push(bkContext("You can read it and respond whenever you're ready."));
    b.push(bkOpenAction("Read it", "open_list_concerns"));
  } else {
    text = `Your 1:1 with ${partnerName} is wrapped up`;
    b.push(bkSection(`Your 1:1 with *${partnerName}* is wrapped up.`));
    b.push(bkContext("What you discussed, what you agreed, and who owns what — all written down."));
    b.push(bkOpenAction("Read the summary", "open_last_meeting"));
  }

  b.push({ type: "divider" });
  b.push(bkFoot());
  return { text, blocks: b };
}
