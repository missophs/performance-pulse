// Ported from performance-pulse.html's global JS helpers — same behavior, same names.

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

export function ago(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDate(s) {
  if (!s) return "";
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function initials(name) {
  if (!name || !name.trim()) return "?";
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function isOverdue(dueDate, status) {
  return status !== "Done" && !!dueDate && dueDate < today();
}

// Shared "what counts as open/active" predicates — used by the dashboard
// layout (nav badges), the dashboard page (stat tiles), and the bell.
export const isOpenTopic = (t) => t.status !== "Resolved" && t.status !== "Parking Lot" && t.status !== "Discussed";
export const isActiveGoal = (g) => g.status !== "Complete" && g.status !== "Deferred";
export const isOpenAction = (a) => a.status !== "Done";
export const isActiveDev = (d) => d.status !== "Complete" && d.status !== "Deferred";

export function staleGoal(goal) {
  if (goal.status === "Complete" || goal.status === "Deferred") return false;
  const last = goal.updated_at || goal.created_at;
  if (!last) return false;
  return daysBetween(new Date(last).getTime(), Date.now()) >= 21;
}
