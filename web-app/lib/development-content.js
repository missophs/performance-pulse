// Ported verbatim from performance-pulse.html: DEV_TYPES, DEV_STATES, DEV_IDEAS,
// LD_RULES and ldMatch(). Fixed, hand-written content — not a model, not ML.
// Tab-specific, so it lives here rather than in lib/data.js.

export const DEV_TYPES = [
  "Course",
  "Training",
  "Coaching",
  "Mentoring",
  "Job shadowing",
  "Stretch assignment",
  "New project",
  "Conference",
  "Certification",
  "Reading / resource",
  "Peer learning",
  "Leadership exposure",
  "Cross-functional experience",
];

export const DEV_STATES = ["Not Started", "In Progress", "Complete", "Deferred"];

// Activity ideas per development type — a fixed list to get people unstuck,
// not a recommendation engine.
export const DEV_IDEAS = {
  Course: ["Pick one course and block the time for it in the calendar now", "Agree which two things you'll apply within a month of finishing"],
  Training: ["Run a short internal session teaching what you learned", "Pair with someone who already does this well"],
  Coaching: ["Set a standing 30 minutes with a coach for one quarter", "Bring one real, current problem to each session"],
  Mentoring: ["Find a mentor outside your immediate team", "Agree three things you want out of it before the first meeting"],
  "Job shadowing": ["Sit in on a function you depend on but don't understand", "Shadow a peer through a full cycle of their work"],
  "Stretch assignment": ["Lead a piece of work one size larger than usual", "Own something end to end rather than a slice of it"],
  "New project": ["Take a project in an unfamiliar part of the business", "Join something cross-functional where you're not the expert"],
  Conference: ["Go with two specific questions you want answered", "Write up what's worth changing and share it"],
  Certification: ["Map the certification to the skill it actually proves", "Set the exam date first, work backwards"],
  "Reading / resource": ["Pick one book and one person to discuss it with", "Summarise the useful third and bin the rest"],
  "Peer learning": ["Set up a regular swap with a peer in another team", "Review each other's work before it goes out"],
  "Leadership exposure": ["Present to the leadership team once a quarter", "Sit in on a planning session as an observer first"],
  "Cross-functional experience": ["Spend a fixed stint embedded with another function", "Take the interface between two teams as your problem"],
};

// A fixed table written by a person, matched on keywords. Not a language
// model: it has not read the goals, feedback, or anything else in this
// workspace, and it says so.
export const LD_RULES = [
  {
    keys: ["present", "presentation", "speak", "slide", "deck", "storytell", "executive presence", "board", "keynote", "stage", "pitch"],
    area: "Executive presentation skills",
    why: "Be more effective in front of senior stakeholders, where the audience is short on time and long on questions.",
    picks: [
      ["Leadership exposure", "Present the monthly business update to the leadership team"],
      ["Coaching", "Two sessions with a presentation coach before the next big one"],
      ["Stretch assignment", "Own the narrative for one quarterly review end to end"],
    ],
    support: "Review the first two decks and give feedback before they go out.",
    measure: "Leads the quarterly leadership presentation without needing a rehearsal safety net.",
  },
  {
    keys: ["manage people", "managing", "first-time manager", "lead a team", "leadership", "supervis", "become a manager", "people leader", "line manage"],
    area: "People leadership",
    why: "Move from doing the work well to getting good work done through other people — a different job, not a bigger version of the same one.",
    picks: [
      ["Mentoring", "Find a manager two levels up outside your reporting line and meet monthly"],
      ["Stretch assignment", "Lead a small project team where you have no formal authority"],
      ["Training", "A structured first-line manager programme, then apply one thing per week"],
    ],
    support: "Debrief every people decision together for the first quarter, before and after.",
    measure: "Runs their own team's planning and 1:1s with the manager only as a sounding board.",
  },
  {
    keys: ["influence", "stakeholder", "buy-in", "buy in", "persuad", "negotiat", "politics", "alignment", "push back", "pushback"],
    area: "Influence and stakeholder management",
    why: "Get to a decision when you do not control the people whose agreement you need.",
    picks: [
      ["Coaching", "Map the stakeholders on one live piece of work and test the map with a coach"],
      ["Job shadowing", "Sit in on negotiations run by someone who does this well"],
      ["Cross-functional experience", "Take the interface between two teams as your own problem to solve"],
    ],
    support: "Sit in on one stakeholder meeting a month as an observer, then debrief.",
    measure: "Lands a cross-team decision without escalating it upward.",
  },
  {
    keys: ["difficult conversation", "conflict", "feedback conversation", "tough conversation", "confront", "disagree", "tension", "underperform"],
    area: "Difficult conversations",
    why: "Say the hard thing early and clearly, while it is still a small problem.",
    picks: [
      ["Training", "A conversation-skills workshop with live practice, not just theory"],
      ["Coaching", "Rehearse the next real conversation with a coach beforehand"],
      ["Peer learning", "Swap prep and debriefs with a peer who faces the same conversations"],
    ],
    support: "Role-play the conversation before it happens and debrief straight after.",
    measure: "Raises an issue within a week of noticing it, rather than at review time.",
  },
  {
    keys: ["delegat", "prioriti", "workload", "time management", "overwhelm", "capacity", "too much", "saying no", "say no", "bandwidth", "stretched"],
    area: "Delegation and prioritisation",
    why: "Free up the time that only you can spend, and stop being the bottleneck on your own team.",
    picks: [
      ["Coaching", "List everything you did last week and agree what should not have been yours"],
      ["Stretch assignment", "Hand one recurring responsibility to someone else and coach them through it"],
      ["Reading / resource", "One book on prioritisation, and one person to argue about it with"],
    ],
    support: "Agree together what they stop doing — not just what they start.",
    measure: "Two standing responsibilities are owned by someone else and running without them.",
  },
  {
    keys: ["data", "analytic", "analysis", "sql", "metric", "measur", "reporting", "dashboard", "statistic", "excel", "numbers", "quantitat"],
    area: "Analytical and data skills",
    why: "Argue from evidence rather than instinct, and spot when the numbers are not saying what people claim.",
    picks: [
      ["Course", "One structured course, with the time blocked in the calendar now"],
      ["New project", "Own one piece of analysis end to end, including the recommendation"],
      ["Peer learning", "Have an analyst review your work before it goes to anyone else"],
    ],
    support: "Review the first two analyses and push on the assumptions behind them.",
    measure: "Produces the analysis behind a decision without needing it checked first.",
  },
  {
    keys: ["commercial", "business acumen", "strategy", "strategic", "p&l", "margin", "revenue", "pricing", "finance", "budget", "cost"],
    area: "Commercial and strategic judgement",
    why: "Understand how the work connects to how the business actually makes money.",
    picks: [
      ["Job shadowing", "Spend time with finance through a full planning cycle"],
      ["Leadership exposure", "Observe the quarterly business review before contributing to one"],
      ["Stretch assignment", "Build the business case for one piece of work, including what you would not do"],
    ],
    support: "Walk through the P&L behind their area, line by line, once.",
    measure: "Frames proposals in terms of the commercial trade-off, unprompted.",
  },
  {
    keys: ["cross-functional", "cross functional", "silo", "other teams", "breadth", "end to end", "end-to-end", "different function", "rotation", "understand the business"],
    area: "Cross-functional breadth",
    why: "See the whole system rather than one part of it, so the handoffs stop being someone else's problem.",
    picks: [
      ["Cross-functional experience", "A fixed stint embedded with a function you depend on"],
      ["Job shadowing", "Follow one piece of work all the way through, across every team it touches"],
      ["New project", "Join something where you are explicitly not the expert in the room"],
    ],
    support: "Broker the introduction and protect the time so it does not get squeezed out.",
    measure: "Can explain how their work lands for the two teams downstream of it.",
  },
  {
    keys: ["customer", "client", "user", "account", "service", "stakeholder facing", "front line", "frontline", "escalation"],
    area: "Customer and client capability",
    why: "Build the judgement to handle the account when it is not going well, not only when it is.",
    picks: [
      ["Job shadowing", "Sit in on the next three escalations, then run the fourth"],
      ["Stretch assignment", "Own one account through a full renewal cycle"],
      ["Mentoring", "Pair with the person who keeps the hardest accounts happy"],
    ],
    support: "Attend the first two as backup, say nothing unless asked.",
    measure: "Handles a live escalation end to end with the manager informed rather than involved.",
  },
  {
    keys: ["writ", "written", "document", "email", "memo", "communicat clear", "clarity", "concise", "report"],
    area: "Written communication",
    why: "Write so the point survives being skim-read by someone who is busy.",
    picks: [
      ["Coaching", "Have three real documents edited hard, with the reasons explained"],
      ["Peer learning", "Review each other's writing before anything goes out"],
      ["Reading / resource", "One book on structured writing, applied to the next real document"],
    ],
    support: "Edit the next three documents together rather than rewriting them alone.",
    measure: "Documents go out after one round of edits instead of three.",
  },
];

export function ldMatch(text) {
  const t = " " + String(text || "").toLowerCase().replace(/[’']/g, "") + " ";
  let best = null;
  let bestScore = 0;
  LD_RULES.forEach((r) => {
    let s = 0;
    r.keys.forEach((k) => {
      if (t.indexOf(k) > -1) s++;
    });
    if (s > bestScore) {
      bestScore = s;
      best = r;
    }
  });
  return bestScore ? best : null;
}
