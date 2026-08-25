-- Append-only record of state changes — marking a topic discussed, ticking an
-- action done, closing a feedback request. Everything else in the app records
-- only *creation* (see buildHistory in lib/data.js), so until now a change left
-- no trace of who made it or when. Notifications aren't a substitute: they're
-- capped, trimmed, and deletable.
--
-- Deliberately append-only: pair members can read and insert, and there is no
-- update or delete policy, so with RLS on, Postgres refuses both. An audit
-- trail either party could quietly rewrite would not be one.

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references pairs (id) on delete cascade,
  -- 'topic' | 'action' | 'feedback_request'
  entity text not null,
  -- Intentionally NOT a foreign key: wrapping up a 1:1 deletes the discussed
  -- topics, and the whole point is that the record outlives the row.
  entity_id uuid,
  -- What the thing was called at the time, captured on write for the same
  -- reason. App-only — this holds real topic text and must never be sent to
  -- Slack, which only ever sees counts and categories.
  label text not null,
  field text not null default 'status',
  old_value text,
  new_value text not null,
  actor_name text not null,
  actor_role text not null,
  -- 'web' | 'slack' — which surface the change came from.
  source text not null default 'web',
  created_at timestamptz not null default now()
);

create index activity_log_pair_created_idx on activity_log (pair_id, created_at desc);

alter table activity_log enable row level security;

create policy "pair members can select" on activity_log
  for select using (is_pair_member(pair_id));

create policy "pair members can insert" on activity_log
  for insert with check (is_pair_member(pair_id));

-- No update or delete policy, on purpose. See the note at the top.
