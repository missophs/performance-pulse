// Exact status → badge-color mappings ported from performance-pulse.html.

export function topicStatusBadge(status) {
  const m = {
    open: "b-grey",
    Discussed: "b-cyan",
    "Needs Assistance": "b-amber",
    "Follow Up": "b-purple",
    "Parking Lot": "b-grey",
    Other: "b-grey",
    Resolved: "b-green",
  };
  return { cls: m[status] || "b-grey", label: status === "open" ? "Not yet discussed" : status };
}

export function goalStatusBadge(status) {
  const m = { "Not Started": "b-grey", "In Progress": "b-cyan", "At Risk": "b-amber", Complete: "b-green", Deferred: "b-grey" };
  return { cls: m[status] || "b-grey", label: status };
}

export function devStatusBadge(status) {
  const m = { "Not Started": "b-grey", "In Progress": "b-cyan", Complete: "b-green", Deferred: "b-grey" };
  return { cls: m[status] || "b-grey", label: status };
}

export function actionBadge(action, overdue) {
  if (action.status === "Done") return { cls: "b-green", label: "Done" };
  if (overdue) return { cls: "b-red", label: "Past due" };
  if (action.status === "Blocked") return { cls: "b-amber", label: "Blocked" };
  if (action.status === "In Progress") return { cls: "b-cyan", label: "In progress" };
  return { cls: "b-grey", label: "Open" };
}

export function roleBadge(role) {
  return role === "manager" ? "b-pink" : "b-cyan";
}
