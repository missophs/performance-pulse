-- Private manager<->employee Slack chat (Melissa's call, 2026-09-17): the
-- conversation itself lives entirely in a real Slack group DM, never in this
-- database -- Performance Pulse posts one intro message the first time it's
-- opened and never reads the thread again. This column only remembers
-- "have we already sent that intro for this pair," so re-clicking "Message
-- X" doesn't spam it a second time. See lib/slack-send.js's
-- openPairConversation and "message_partner" in
-- app/api/slack/interactivity/route.js.

alter table pairs add column if not exists chat_opened_at timestamptz;
