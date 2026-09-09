-- This project's `supabase_functions` schema (the internal plumbing Supabase's
-- Studio uses to create Database Webhooks) does not exist -- confirmed via
-- `select exists(select 1 from information_schema.schemata where
-- schema_name = 'supabase_functions')` returning false, while `pg_net` (the
-- extension it depends on) is installed. Attempting to create any Database
-- Webhook in the Studio UI fails with:
--   ERROR: 3F000: schema "supabase_functions" does not exist
-- This recreates exactly what Supabase's own project bootstrap normally
-- provisions automatically. Idempotent (if not exists / or replace
-- throughout) and additive only -- touches no application table.

begin;

create schema if not exists supabase_functions;

create table if not exists supabase_functions.migrations (
  version text primary key,
  inserted_at timestamptz not null default now()
);

create table if not exists supabase_functions.hooks (
  id bigserial primary key,
  hook_table_id integer not null,
  hook_name text not null,
  created_at timestamptz not null default now(),
  request_id bigint
);
create index if not exists supabase_functions_hooks_request_id_idx on supabase_functions.hooks (request_id);
create index if not exists supabase_functions_hooks_h_table_id_h_name_idx on supabase_functions.hooks (hook_table_id, hook_name);
comment on schema supabase_functions is 'Supabase Functions Schema.';
comment on table supabase_functions.hooks is 'Supabase Functions Hooks: Audit trail for triggered hooks.';

create or replace function supabase_functions.http_request()
returns trigger
language plpgsql
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

grant usage on schema supabase_functions to postgres, anon, authenticated, service_role;
grant all on supabase_functions.hooks to postgres, anon, authenticated, service_role;
grant all on supabase_functions.migrations to postgres, anon, authenticated, service_role;
grant all on all sequences in schema supabase_functions to postgres, anon, authenticated, service_role;
grant execute on function supabase_functions.http_request() to postgres, anon, authenticated, service_role;

commit;
