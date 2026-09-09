-- Incident 2026-09-08: the notifications Slack webhook silently failed for
-- every website-originated notification (a real user adding a goal,
-- marking a topic discussed, etc.) while Slack-bot-originated writes kept
-- working fine. Root cause, confirmed via Postgres logs (event_message:
-- "new row violates row-level security policy for table \"hooks\""):
-- migration 0024 created supabase_functions.hooks with no RLS statement of
-- its own -- running it through the Supabase SQL Editor auto-appended
-- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` with zero policies, which
-- blocks every write except service_role's (service_role bypasses RLS
-- unconditionally). supabase_functions.http_request()'s trigger body
-- inserts into this table as part of every notifications insert; when that
-- insert runs under a real website user's `authenticated` role (not
-- service_role), the hooks insert violates RLS and the WHOLE notifications
-- insert rolls back. Every Slack-bot code path never hit this because
-- every Slack handler (app/api/slack/**) uses the admin/service-role
-- client.
--
-- This is the tracked, idempotent version of the emergency fix already
-- applied live via the SQL Editor, plus two defense-in-depth hardenings
-- (from a follow-up audit) so the same failure can't recur even if a
-- future hand-run migration trips Supabase's auto-RLS-append again:
--   1. Disable RLS on supabase_functions.hooks -- it's Supabase's own
--      internal plumbing/audit-trail table, not user data, and ships
--      without RLS in a normal (non-broken) project bootstrap.
--   2. Mark http_request() SECURITY DEFINER -- so its own insert into
--      hooks always runs as the function owner (postgres), never as
--      whatever role fired the outer INSERT, independent of whatever RLS
--      state the table ends up in later.
--   3. Narrow the `grant all` left over from 0024 (nothing but this
--      trigger ever writes to these tables) down to what's actually
--      used -- INSERT for anon/authenticated -- keeping full access for
--      postgres/service_role.
--
-- Also drops a leftover trigger + function (notifications_slack_notify /
-- notify_slack_on_notification) found during the same incident: an
-- abandoned earlier manual attempt at this same webhook, pointing at a
-- stale secret. Dead code, unrelated to the bug above, but confusing
-- duplicate machinery hitting the same endpoint.

begin;

alter table supabase_functions.hooks disable row level security;

create or replace function supabase_functions.http_request()
returns trigger
language plpgsql
security definer
as $function$
  declare
    request_id bigint;
    payload jsonb;
    url text := TG_ARGV[0]::text;
    method text := TG_ARGV[1]::text;
    headers jsonb default '{}'::jsonb;
    params jsonb default '{}'::jsonb;
    timeout_ms integer default 1000;
  begin
    if url is null or method is null then
      raise exception 'url and method are required';
    end if;

    if TG_ARGV[2] is null then
      headers = '{"Content-Type":"application/json"}'::jsonb;
    else
      headers = TG_ARGV[2]::jsonb;
    end if;

    if TG_ARGV[3] is null then
      params = '{}'::jsonb;
    else
      params = TG_ARGV[3]::jsonb;
    end if;

    if TG_ARGV[4] is null then
      timeout_ms = 1000;
    else
      timeout_ms = TG_ARGV[4]::integer;
    end if;

    case
      when method = 'GET' then
        select http_get into request_id from net.http_get(
          url,
          params,
          headers,
          timeout_ms
        );
      when method = 'POST' then
        payload = jsonb_build_object(
          'old_record', OLD,
          'record', NEW,
          'type', TG_OP,
          'table', TG_TABLE_NAME,
          'schema', TG_TABLE_SCHEMA
        );

        select http_post into request_id from net.http_post(
          url,
          payload,
          params,
          headers,
          timeout_ms
        );
      else
        raise exception 'method argument % is invalid', method;
    end case;

    insert into supabase_functions.hooks
      (hook_table_id, hook_name, request_id)
    values
      (TG_RELID, TG_NAME, request_id);

    return NEW;
  end
$function$;

revoke all on supabase_functions.hooks from anon, authenticated;
grant insert on supabase_functions.hooks to anon, authenticated;
revoke all on supabase_functions.migrations from anon, authenticated;

drop trigger if exists notifications_slack_notify on public.notifications;
drop function if exists public.notify_slack_on_notification();

commit;
