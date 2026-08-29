-- Performance Pulse — schema + RLS
-- Paste this whole file into the Supabase SQL Editor (Dashboard → SQL Editor → New query) and run it.
-- Safe to re-run on a fresh project. Not idempotent against a partially-applied version — if you
-- need to re-run after an error, drop the created objects first or start a new project.

create extension if not exists citext;

-- ============================================================================
-- profiles — one row per auth user, keeps a copy of email for invite matching
-- ============================================================================

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- citext, not text: every comparison against this column is
  -- case-insensitive by construction, so a partner typed as "Name@Co.com"
  -- always matches an account signed up as "name@co.com" without every
  -- caller having to remember to call lower() itself.
  email citext not null,
  full_name text not null default '',
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- ============================================================================
-- pairs — exactly one employee + one manager account. v1 is one pair per
-- account (enforced by the partial unique indexes below) — a user who needs
-- a second 1:1 relationship needs a second account for now.
-- ============================================================================

create table pairs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references profiles (id) on delete cascade,
  manager_id uuid references profiles (id) on delete cascade,
  employee_email citext not null,
  manager_email citext not null,
  next_1on1_date date,
  next_1on1_time time,
  next_1on1_focus text not null default '',
  hr_email text not null default '',
  assist_enabled boolean not null default true,
  how_to_hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index pairs_employee_id_key on pairs (employee_id) where employee_id is not null;
create unique index pairs_manager_id_key on pairs (manager_id) where manager_id is not null;

alter table pairs enable row level security;

-- ============================================================================
-- Pair-scoped record tables — mirror of the original localStorage shape.
-- created_by_role / created_by_name are denormalized display fields (the
-- original app stored `by`/`byName` on every record for the same reason:
-- showing who wrote something doesn't require a join).
-- ============================================================================

create table topics (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references pairs (id) on delete cascade,
  text text not null,
  why text not null default '',
  category text not null,
  status text not null default 'open',
  notes text not null default '',
  created_by_role text not null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table checkins (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references pairs (id) on delete cascade,
  role text not null,
  asked jsonb not null default '[]',
  meeting_id uuid,
  in_progress boolean not null default false,
  draft_state jsonb,
  created_at timestamptz not null default now()
);

create table meetings (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references pairs (id) on delete cascade,
  meeting_date date not null,
  meeting_time time,
  discussed text not null default '',
  agreed text not null default '',
  revisit text not null default '',
  start_line text not null default '',
  stop_line text not null default '',
  keep_line text not null default '',
  checkin90_date date,
  topics_snapshot jsonb not null default '[]',
  created_by_name text not null,
  created_at timestamptz not null default now()
);

alter table checkins
  add constraint checkins_meeting_id_fkey foreign key (meeting_id) references meetings (id) on delete set null;

create table achievements (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references pairs (id) on delete cascade,
  title text not null,
  category text not null,
  impact text not null default '',
  achievement_date date,
  created_by_role text not null,
  created_by_name text not null,
  created_at timestamptz not null default now()
);

create table feedback_entries (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references pairs (id) on delete cascade,
  giver_role text not null,
  from_name text not null,
  to_name text not null,
  type text not null,
  text text not null,
  example text not null default '',
  created_at timestamptz not null default now()
);

create table feedback_requests (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references pairs (id) on delete cascade,
  from_role text not null,
  from_name text not null,
  about text not null default '',
  why text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references pairs (id) on delete cascade,
  text text not null,
  why text not null default '',
  measure text not null default '',
  owner_label text not null,
  target_date date,
  status text not null default 'Not Started',
  progress smallint not null default 0,
  obstacles text not null default '',
  support text not null default '',
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table development_plans (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references pairs (id) on delete cascade,
  area text not null,
  why text not null default '',
  type text not null,
  activity text not null default '',
  support text not null default '',
  target_date date,
  status text not null default 'Not Started',
  measure text not null default '',
  created_by_role text not null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table career_answers (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references pairs (id) on delete cascade,
  role text not null,
  question text not null,
  answer text not null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  unique (pair_id, role, question)
);

create table concerns (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references pairs (id) on delete cascade,
  what text not null,
  concern_date date,
  expectation text not null default '',
  communicated text not null default '',
  previously text not null default '',
  support text not null default '',
  outcome text not null default '',
  created_by_name text not null,
  created_at timestamptz not null default now()
);

create table actions (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references pairs (id) on delete cascade,
  text text not null,
  owner_label text not null,
  due_date date,
  status text not null default 'Open',
  related text not null default '',
  notes text not null default '',
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references pairs (id) on delete cascade,
  text text not null,
  created_by_role text not null,
  to_role text not null,
  view text,
  -- One of lib/block-kit.js's BK_KINDS ids ("topic", "wrap", "feedback", ...),
  -- or null. Tells the Slack sender which ping to build; null means this
  -- notification has no Slack equivalent yet and the sender skips it.
  kind text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Append-only record of state changes (topic marked discussed, action ticked
-- done, feedback request closed). Everything else here records only creation,
-- so a change used to leave no trace of who made it. See 0004_activity_log.sql
-- for the full reasoning; note there is deliberately no update/delete policy.
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references pairs (id) on delete cascade,
  entity text not null,
  -- Not a foreign key on purpose: wrap-up deletes discussed topics, and the
  -- record is meant to outlive the row.
  entity_id uuid,
  -- App-only. Holds real topic text, so it must never reach Slack.
  label text not null,
  field text not null default 'status',
  old_value text,
  new_value text not null,
  actor_name text not null,
  actor_role text not null,
  source text not null default 'web',
  created_at timestamptz not null default now()
);

create index activity_log_pair_created_idx on activity_log (pair_id, created_at desc);

create table review_drafts (
  pair_id uuid not null references pairs (id) on delete cascade,
  role text not null,
  draft text not null default '',
  updated_at timestamptz not null default now(),
  primary key (pair_id, role)
);

-- Generalizes review_drafts to cover multiple in-progress forms at once
-- (topics, goals, development, achievements, feedback) — one row per
-- pair+role+kind, so e.g. a manager's in-progress topic draft and an
-- employee's in-progress feedback draft don't collide.
create table form_drafts (
  pair_id uuid not null references pairs (id) on delete cascade,
  role text not null,
  kind text not null,
  draft jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (pair_id, role, kind)
);

create table custom_suggestions (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references pairs (id) on delete cascade,
  role text not null,
  text text not null,
  category text not null,
  created_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references pairs (id) on delete cascade,
  name text not null,
  url text,
  storage_path text,
  size bigint,
  mime_type text,
  created_by_name text not null,
  created_at timestamptz not null default now()
);

create table handbook_links (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references pairs (id) on delete cascade,
  title text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references pairs (id) on delete cascade,
  kind text not null,
  text text not null,
  role text not null,
  created_by_name text not null,
  created_at timestamptz not null default now()
);

alter table checkins enable row level security;
alter table meetings enable row level security;
alter table achievements enable row level security;
alter table feedback_entries enable row level security;
alter table feedback_requests enable row level security;
alter table goals enable row level security;
alter table development_plans enable row level security;
alter table career_answers enable row level security;
alter table concerns enable row level security;
alter table actions enable row level security;
alter table notifications enable row level security;
alter table activity_log enable row level security;
alter table review_drafts enable row level security;
alter table form_drafts enable row level security;
alter table custom_suggestions enable row level security;
alter table documents enable row level security;
alter table handbook_links enable row level security;
alter table messages enable row level security;
alter table topics enable row level security;

-- ============================================================================
-- Auth wiring: create a profile on signup, and resolve any pending pair
-- invite that was waiting on this email address.
-- ============================================================================

create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''));

  -- Narrowed to the single oldest matching invite (not a bare WHERE) because
  -- employee_email/manager_email are citext now: two pre-existing pending
  -- invites for the same address that only differ by case (impossible to
  -- create going forward, but reachable from rows written before citext)
  -- would otherwise both match in one UPDATE and collide on
  -- pairs_employee_id_key/pairs_manager_id_key, aborting this whole signup.
  update pairs set employee_id = new.id
  where id = (
    select id from pairs
    where employee_email = new.email and employee_id is null
    order by created_at asc
    limit 1
  );

  update pairs set manager_id = new.id
  where id = (
    select id from pairs
    where manager_email = new.email and manager_id is null
    order by created_at asc
    limit 1
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Creates (or resolves) the pair for the calling user. If the partner already
-- has an account, links immediately; otherwise stores their email and the
-- on_auth_user_created trigger above links it the moment they sign up.
create function create_pair(my_role text, partner_email text)
returns pairs
language plpgsql
security definer
set search_path = public
as $$
declare
  my_email text;
  partner_id uuid;
  result pairs;
begin
  if my_role not in ('employee', 'manager') then
    raise exception 'my_role must be employee or manager';
  end if;

  select email into my_email from profiles where id = auth.uid();
  if my_email is null then
    raise exception 'no profile for current user';
  end if;

  -- employee_email/manager_email/profiles.email are citext, so this match is
  -- already case-insensitive — a partner typed as "Name@Example.com" still
  -- links to an account signed up as "name@example.com" with no lower() here.
  -- `limit 1` is defensive: profiles.email has no uniqueness constraint, so if
  -- two profile rows were ever case-variants of the same address this picks
  -- one deterministically instead of an unspecified row.
  select id into partner_id from profiles
  where email = partner_email
  order by id
  limit 1;

  if my_role = 'employee' then
    insert into pairs (employee_id, manager_id, employee_email, manager_email)
    values (auth.uid(), partner_id, my_email, partner_email)
    returning * into result;
  else
    insert into pairs (employee_id, manager_id, employee_email, manager_email)
    values (partner_id, auth.uid(), partner_email, my_email)
    returning * into result;
  end if;

  return result;
end;
$$;

-- ============================================================================
-- RLS policies
-- ============================================================================

create function is_pair_member(check_pair_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from pairs
    where id = check_pair_id
      and (employee_id = auth.uid() or manager_id = auth.uid())
  );
$$;

create policy "select own or partner profile" on profiles for select using (
  id = auth.uid()
  or exists (
    select 1 from pairs
    where (employee_id = auth.uid() and manager_id = profiles.id)
       or (manager_id = auth.uid() and employee_id = profiles.id)
  )
);
create policy "update own profile" on profiles for update using (id = auth.uid());

create policy "select own pair" on pairs for select using (
  employee_id = auth.uid() or manager_id = auth.uid()
);
create policy "update own pair" on pairs for update using (
  employee_id = auth.uid() or manager_id = auth.uid()
);

-- Every pair-scoped table gets the same four policies: a member of the pair
-- can select/insert/update/delete rows belonging to that pair. Looping over
-- the table list here instead of writing 64 near-identical CREATE POLICY
-- statements by hand.
do $$
declare
  t text;
  pair_scoped_tables text[] := array[
    'topics', 'checkins', 'meetings', 'achievements', 'feedback_entries',
    'feedback_requests', 'goals', 'development_plans', 'career_answers',
    'concerns', 'actions', 'notifications', 'review_drafts', 'form_drafts',
    'custom_suggestions', 'documents', 'handbook_links', 'messages'
  ];
begin
  foreach t in array pair_scoped_tables loop
    execute format(
      'create policy "pair members can select" on %I for select using (is_pair_member(pair_id));',
      t
    );
    execute format(
      'create policy "pair members can insert" on %I for insert with check (is_pair_member(pair_id));',
      t
    );
    execute format(
      'create policy "pair members can update" on %I for update using (is_pair_member(pair_id));',
      t
    );
    execute format(
      'create policy "pair members can delete" on %I for delete using (is_pair_member(pair_id));',
      t
    );
  end loop;
end;
$$;

-- activity_log is deliberately left out of that loop: it gets select and insert
-- only, so Postgres itself refuses updates and deletes. An audit trail either
-- person could quietly rewrite would not be one.
create policy "pair members can select" on activity_log
  for select using (is_pair_member(pair_id));

create policy "pair members can insert" on activity_log
  for insert with check (is_pair_member(pair_id));

-- ============================================================================
-- Storage bucket for uploaded documents (Dashboard → Documents card).
-- Files are private; access is gated by the same pair membership as the row
-- in `documents` that references them. Path convention: <pair_id>/<uuid>-<name>
-- ============================================================================

insert into storage.buckets (id, name, public) values ('documents', 'documents', false);

create policy "pair members can read documents" on storage.objects for select using (
  bucket_id = 'documents' and is_pair_member((storage.foldername(name))[1]::uuid)
);
create policy "pair members can upload documents" on storage.objects for insert with check (
  bucket_id = 'documents' and is_pair_member((storage.foldername(name))[1]::uuid)
);
create policy "pair members can delete documents" on storage.objects for delete using (
  bucket_id = 'documents' and is_pair_member((storage.foldername(name))[1]::uuid)
);

-- ============================================================================
-- Slack ping trigger: every notifications row POSTs itself to
-- /api/slack/notify, which decides whether it earns a real Slack DM.
-- Full notes, including the secret you must fill in, are in
-- supabase/migrations/0005_slack_notify_trigger.sql. Without this, Slack DMs
-- stop silently — nothing errors, the pings just never arrive.
-- ============================================================================

create extension if not exists pg_net with schema extensions;

-- ⚠️ Replace PUT_THE_WEBHOOK_SECRET_HERE with the value of the
-- SLACK_NOTIFY_WEBHOOK_SECRET environment variable set on the Vercel project.
create or replace function notify_slack_on_notification()
returns trigger
language plpgsql
security definer
as $function$
begin
  perform net.http_post(
    url := 'https://performance-pulse-lyart.vercel.app/api/slack/notify',
    body := jsonb_build_object('record', to_jsonb(NEW)),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', 'PUT_THE_WEBHOOK_SECRET_HERE'
    ),
    timeout_milliseconds := 5000
  );
  return NEW;
end;
$function$;

create trigger notifications_slack_notify
  after insert on notifications
  for each row execute function notify_slack_on_notification();
