-- Real multi-tenant foundation ("anybody in any company can use it if they
-- buy it," Melissa's direction 2026-09-16 -- Slack-native, not a separate
-- deployment per customer). Checked first: only `pairs` needed a tenant
-- column -- every other table already cascades through pair_id, and the
-- existing RLS helpers (is_pair_member/is_pair_manager) check real
-- auth.uid() membership on the pairs row regardless of company, so they
-- don't need to change. The one place that WAS implicitly single-tenant is
-- lib/slack-user.js's resolveSlackUser, which matches a Slack user to a
-- pair by email alone, globally -- fine with one company, wrong with two.
--
-- Additive and backfilled, not destructive: every pair that exists today
-- gets assigned to one default company row, so nothing about the current
-- (only) company's data changes or breaks.

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

insert into companies (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Original workspace')
on conflict (id) do nothing;

-- Defaulted, not just backfilled: create_pair() (schema.sql) inserts a row
-- without ever mentioning company_id, and the website has no notion of
-- "which company" a signed-in user belongs to today -- it only ever talks
-- to this one deployment's one original company. Without this default,
-- shipping this migration would break every new signup through the
-- website's own onboarding the moment it ran. A Slack-native install
-- (lib/data.js's saveSlackInstallation) sets a real company_id explicitly
-- and never relies on this default.
alter table pairs add column if not exists company_id uuid references companies (id) default '00000000-0000-0000-0000-000000000001';
update pairs set company_id = '00000000-0000-0000-0000-000000000001' where company_id is null;
alter table pairs alter column company_id set not null;

-- Links one Slack workspace install to one company -- lets slackApi()
-- resolve the RIGHT bot token for a given incoming team_id instead of
-- always using whichever workspace installed most recently (see
-- lib/slack-api.js and lib/slack-user.js's next changes).
alter table slack_installations add column if not exists company_id uuid references companies (id);
update slack_installations set company_id = '00000000-0000-0000-0000-000000000001' where company_id is null;

alter table companies enable row level security;
