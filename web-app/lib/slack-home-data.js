// Everything the Slack Home tab needs, in one call. Shared by the events
// route (rendering it) and the interactivity route (re-rendering it after a
// mutation), so both stay in sync with the same shape.

import { listTopics, listActions, listGoals, listDevelopmentPlans, listAchievements, listFeedback, listFeedbackRequests, listDocuments, listCustomSuggestions } from "@/lib/data";

export async function loadHomeData(supabaseAdmin, pairId) {
  const [topics, actionsList, goals, devPlans, achievements, feedback, feedbackRequests, documents, customSuggestions] = await Promise.all([
    listTopics(supabaseAdmin, pairId),
    listActions(supabaseAdmin, pairId),
    listGoals(supabaseAdmin, pairId),
    listDevelopmentPlans(supabaseAdmin, pairId),
    listAchievements(supabaseAdmin, pairId),
    listFeedback(supabaseAdmin, pairId),
    listFeedbackRequests(supabaseAdmin, pairId),
    listDocuments(supabaseAdmin, pairId),
    listCustomSuggestions(supabaseAdmin, pairId),
  ]);
  return { topics, actions: actionsList, goals, devPlans, achievements, feedback, feedbackRequests, documents, customSuggestions };
}
