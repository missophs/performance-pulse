// Shared plumbing for every Slack "add X" modal that supports a "Save
// draft" button (Topics, Goals, Development plans, Achievements,
// Feedback) — see app/api/slack/interactivity/route.js's SAVE_DRAFT map
// and lib/slack-views.js's addTopicModal/addGoalModal/addDevPlanModal/
// addAchievementModal/addFeedbackModal, all of which are driven off this
// file instead of five independent copies of the same workaround.
//
// Confirmed live, the hard way, on Topics (SLACK_TODO.md item 0j):
// views.update does NOT reliably push a new value into an existing
// block_id's actual submitted state, for either plain_text_input or
// static_select, even though a plain_text_input can visibly LOOK correct
// on screen — a real topic got saved with category correct but text
// silently empty, caught only by checking the database after, not from
// the UI. Slack only reliably re-registers a field's value at a true
// first-render of that exact block_id within a given view session, so
// re-using the same block_id across a views.update patch of an
// already-open view is unsafe for both display AND submission.
//
// The fix: whenever a modal is (re)built with a non-empty draft — which
// only ever happens when patching an already-open view (a "Save draft"
// confirmation re-render, a suggestion pick, etc.), never on a true fresh
// open — every field-carrying input block renders under a "_v2"-suffixed
// block_id instead of its plain one, so Slack sees each field for the
// first time under whichever id it's about to submit under. Every reader
// (SUBMISSIONS handlers, SAVE_DRAFT capture, draft prefill) tries the
// "_v2" id first and falls back to the plain one, since only one of the
// pair is ever actually present in a given view's submitted state.
//
// FIELDS is just a modal's list of field base names (its input blocks'
// non-v2 block_ids) — everything below is driven off that one list so a
// new field can't be added to a modal without automatically getting this
// behavior.

// The block_id to render field `name` under. `v2` should be true whenever
// the modal is being (re)built with a non-empty draft — see the file
// comment above.
export function fieldBlockId(name, v2) {
  return v2 ? `${name}_v2` : name;
}

// Expands a modal's FIELDS list into every block_id its SAVE_DRAFT capture
// (see route.js) needs to check: both the plain and "_v2" form of each
// field, since a draft can be captured mid-session in either, depending on
// whether that particular "Save draft" click happened before or after the
// modal first got patched into v2 mode.
export function withV2(FIELDS) {
  return FIELDS.flatMap((f) => [f, fieldBlockId(f, true)]);
}

// Wraps a raw single-block_id reader (route.js's fieldVal) into the
// dual-lookup version every SUBMISSIONS/SAVE_DRAFT read needs: try the
// "_v2" id first, fall back to the plain one, since only one of the pair
// is ever actually present in a given view's submitted state.
export function makeFieldValV2(fieldVal) {
  return (values, name) => fieldVal(values, fieldBlockId(name, true)) ?? fieldVal(values, name);
}

// Collapses a draft that may carry any of FIELDS under its "_v2" key
// (saved mid-patch) back down to the plain keys every addXModal's own
// draft?.foo reads expect. Draft objects with no v2 keys at all (or no
// draft at all) pass through unchanged.
export function normalizeDraft(FIELDS, draft) {
  if (!draft) return draft;
  const out = { ...draft };
  for (const f of FIELDS) {
    const v2Key = fieldBlockId(f, true);
    if (out[v2Key] !== undefined) out[f] = out[v2Key];
    delete out[v2Key];
  }
  return out;
}
