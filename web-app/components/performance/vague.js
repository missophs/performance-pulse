// Ported verbatim from performance-pulse.html's VAGUE / isVague() —
// simple keyword matching, not ML. Used to gate the coach nudge shown
// when someone writes feedback or a concern that reads as a judgement
// rather than something observable, with no example attached.

const VAGUE = [
  "needs improvement", "needs to improve", "not great", "poor", "bad at", "better at",
  "more proactive", "attitude", "communication", "professionalism", "lacks", "struggles",
  "dont care", "doesnt care", "dont seem", "doesnt seem", "not committed", "not engaged",
  "never", "always", "not a team player", "low energy", "difficult", "lazy", "careless", "sloppy",
  "unreliable", "disorganised", "disorganized", "checked out", "no urgency", "not motivated",
];

export function isVague(text) {
  if (!text) return false;
  const t = text.toLowerCase().replace(/[’']/g, "");
  const hit = VAGUE.some((v) => t.indexOf(v) > -1);
  return hit && text.trim().split(/\s+/).length < 25;
}
