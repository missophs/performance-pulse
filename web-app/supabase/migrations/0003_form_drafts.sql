-- Adds form_drafts, generalizing the existing review_drafts pattern with a
-- `kind` column so multiple form types (topics, goals, development,
-- achievements, feedback) can each hold their own in-progress draft at once.
-- Run this once against a database that already has the original schema.sql
-- applied (already-fresh installs get this table from schema.sql directly).

create table if not exists form_drafts (
  pair_id uuid not null references pairs (id) on delete cascade,
  role text not null,
  kind text not null,
  draft jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (pair_id, role, kind)
);

alter table form_drafts enable row level security;

create policy "pair members can select" on form_drafts for select using (is_pair_member(pair_id));
create policy "pair members can insert" on form_drafts for insert with check (is_pair_member(pair_id));
create policy "pair members can update" on form_drafts for update using (is_pair_member(pair_id));
create policy "pair members can delete" on form_drafts for delete using (is_pair_member(pair_id));
