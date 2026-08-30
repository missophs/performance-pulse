// Suggested goal starting points and SMART-goal guidance for the Add Goal
// modal on both surfaces — sourced once so the website and Slack show
// identical text (Melissa's instruction: goal-setting content must be
// verbatim in both places, not independently worded per surface).
//
// Either role can still write a fully custom goal — this is a picker, not a
// restriction, same relationship as SUGGESTIONS (lib/one-on-one-content.js)
// has to a topic's free-text field.
// `label` is a short teaser for Slack's dropdown, which can't wrap or fit a
// full sentence in its narrow menu box. `text` is the exact goal text that
// gets inserted either way — the website shows `text` directly (no width
// limit there), so the actual goal content stays verbatim on both surfaces.
export const GOAL_SUGGESTIONS = {
  "Skill growth": [
    { text: "Pick one new skill or certification that helps you grow in your current career path.", label: "Pick a new skill or certification" },
  ],
  "Focus & quality": [
    { text: "Measure success by the quality of completed results, not the number of hours spent online.", label: "Measure quality, not hours worked" },
    { text: "Align your weekly tasks directly with the big-picture goals of the team.", label: "Align weekly tasks with team goals" },
  ],
  "Time management": [{ text: "Improve time management.", label: "Improve time management." }],
  Collaboration: [
    { text: "Support a colleague in achieving their goals — it lifts personal motivation, productivity, and team resilience.", label: "Support a colleague's goals" },
  ],
};

// Shown on every Add Goal modal, both surfaces, verbatim.
export const SMART_GOAL_HELP = {
  intro: "Managers: use SMART when setting or reviewing a goal, and share this so your employee knows how goals here are structured.",
  criteria: [
    ["Specific", "Clear and well-defined; answers what you want to accomplish."],
    ["Measurable", "Includes metrics or concrete criteria to track your progress."],
    ["Achievable", "Realistic and possible to reach with your current skills and resources."],
    ["Relevant", "Matters to you and aligns with your broader objectives or values."],
    ["Time-bound", "Has a clear deadline or target date for completion."],
  ],
};

// Shown only to the employee when they open Add Goal.
export const EMPLOYEE_GOAL_PROMPT =
  "Please provide 3-5 goals that align with what you need to accomplish, and how you plan to execute them.";
