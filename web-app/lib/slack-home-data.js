// Everything the Slack Home tab needs, in one call. Shared by the events
// route (rendering it) and the interactivity route (re-rendering it after a
// mutation), so both stay in sync with the same shape.

import { listTopics, listActions, listGoals, listDevelopmentPlans, listAchievements, listFeedback, listFeedbackRequests, listDocuments, listCustomSuggestions, listMessages, listConcerns } from "@/lib/data";

export async function loadHomeData(supabaseAdmin, pairId) {
  const [topics, actionsList, goals, devPlans, achievements, feedback, feedbackRequests, documents, customSuggestions, messages, concerns] = await Promise.all([
    listTopics(supabaseAdmin, pairId),
    listActions(supabaseAdmin, pairId),
    listGoals(supabaseAdmin, pairId),
    listDevelopmentPlans(supabaseAdmin, pairId),
    listAchievements(supabaseAdmin, pairId),
    listFeedback(supabaseAdmin, pairId),
    listFeedbackRequests(supabaseAdmin, pairId),
    listDocuments(supabaseAdmin, pairId),
    listCustomSuggestions(supabaseAdmin, pairId),
    listMessages(supabaseAdmin, pairId),
    // supabaseAdmin is service-role and bypasses RLS entirely (see
    // web-app/CLAUDE.md's governance note), so this returns every concern
    // including unshared drafts -- callers building an employee-facing view
    // MUST filter to shared_at != null themselves. See listConcernsModal.
    listConcerns(supabaseAdmin, pairId),
  ]);
  return { topics, actions: actionsList, goals, devPlans, achievements, feedback, feedbackRequests, documents, customSuggestions, messages, concerns };
}
