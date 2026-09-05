-- Stores the shared HR passcode for the Handbook upload/remove controls
-- (app/api/handbook/route.js) as a real, resettable value instead of a
-- fixed env var, so HR can change it themselves via a "Reset PIN" button
-- without a redeploy. Same shape as slack_pair_selections (0011): RLS on,
-- no policies -- only the service-role client (used exclusively by
-- app/api/handbook/route.js) can read or write this table.
create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

insert into app_settings (key, value)
values ('hr_handbook_passcode', '1111')
on conflict (key) do nothing;
