-- The Slack-ping trigger. Every row inserted into `notifications` POSTs itself
-- to /api/slack/notify, which decides whether it earns a real Slack DM (see
-- BK_KINDS / sendSlackDigest in lib/slack-send.js).
--
-- This was built by hand in the Supabase dashboard and lived only as a database
-- object until 2026-08-25, when it was read back out of the live database with
-- pg_get_functiondef / pg_get_triggerdef and written down here. If the database
-- is ever reset or a second environment is stood up, Slack DMs stop silently
-- without this file — nothing in the app errors, the pings just never arrive.
--
-- Requires the pg_net extension (live: pg_net 0.20.4, declared in schema
-- `extensions`). Note pg_net puts its functions in their own `net` schema
-- regardless of that declaration, which is why the call below is net.http_post.

create extension if not exists pg_net with schema extensions;

-- ⚠️ Replace PUT_THE_WEBHOOK_SECRET_HERE below with the value of the
-- SLACK_NOTIFY_WEBHOOK_SECRET environment variable set on the Vercel project.
-- The real secret is deliberately not in this file, and not in this repo. The
-- guard at the bottom refuses to let the migration finish until you swap it.
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

-- Fail loudly rather than installing a trigger that posts the wrong secret and
-- gets a silent 401 on every ping — the exact failure this file exists to stop.
do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'notify_slack_on_notification'
      and prosrc like '%PUT_THE_WEBHOOK_SECRET_HERE%'
  ) then
    raise exception
      'Replace PUT_THE_WEBHOOK_SECRET_HERE with the SLACK_NOTIFY_WEBHOOK_SECRET value before running this migration.';
  end if;
end;
$$;
