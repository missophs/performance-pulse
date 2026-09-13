


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "citext" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";





SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."pairs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid",
    "manager_id" "uuid",
    "employee_email" "public"."citext" NOT NULL,
    "manager_email" "public"."citext" NOT NULL,
    "next_1on1_date" "date",
    "next_1on1_time" time without time zone,
    "next_1on1_focus" "text" DEFAULT ''::"text" NOT NULL,
    "hr_email" "text" DEFAULT ''::"text" NOT NULL,
    "assist_enabled" boolean DEFAULT true NOT NULL,
    "how_to_hidden" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "closing_note" "text",
    "employee_label" "text",
    "suggested_1on1_date" "date",
    "suggested_1on1_time" time without time zone,
    "suggested_1on1_note" "text"
);


ALTER TABLE "public"."pairs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_pair"("my_role" "text", "partner_email" "text") RETURNS "public"."pairs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  select id into partner_id from profiles
  where email = partner_email
  order by id
  limit 1;

  begin
    if my_role = 'employee' then
      insert into pairs (employee_id, manager_id, employee_email, manager_email)
      values (auth.uid(), partner_id, my_email, partner_email)
      returning * into result;
    else
      insert into pairs (employee_id, manager_id, employee_email, manager_email)
      values (partner_id, auth.uid(), partner_email, my_email)
      returning * into result;
    end if;
  exception
    when unique_violation then
      raise exception 'You''re already paired with this person.';
  end;

  return result;
end;
$$;


ALTER FUNCTION "public"."create_pair"("my_role" "text", "partner_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_pairs_close"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.closed_at is not null and old.closed_at is null then
    if auth.uid() is not null and auth.uid() <> old.manager_id then
      raise exception 'Only the manager (or HR) can end this pairing';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."guard_pairs_close"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (select 1 from profiles where email = new.email)
     and not exists (select 1 from pairs where employee_email = new.email or manager_email = new.email) then
    raise exception 'not_provisioned: % is not on the roster yet -- ask HR to add you first', new.email;
  end if;

  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''));

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


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_hr"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and email = 'melissaw212@gmail.com'
  );
$$;


ALTER FUNCTION "public"."is_hr"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_own_role_row"("check_pair_id" "uuid", "check_role" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from pairs
    where id = check_pair_id
      and (
        (check_role = 'employee' and employee_id = auth.uid())
        or (check_role = 'manager' and manager_id = auth.uid())
      )
  );
$$;


ALTER FUNCTION "public"."is_own_role_row"("check_pair_id" "uuid", "check_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_pair_manager"("check_pair_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from pairs
    where id = check_pair_id
      and manager_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_pair_manager"("check_pair_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_pair_member"("check_pair_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from pairs
    where id = check_pair_id
      and (employee_id = auth.uid() or manager_id = auth.uid())
  );
$$;


ALTER FUNCTION "public"."is_pair_member"("check_pair_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."achievements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pair_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "category" "text" NOT NULL,
    "impact" "text" DEFAULT ''::"text" NOT NULL,
    "achievement_date" "date",
    "created_by_role" "text" NOT NULL,
    "created_by_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."achievements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pair_id" "uuid" NOT NULL,
    "text" "text" NOT NULL,
    "owner_label" "text" NOT NULL,
    "due_date" "date",
    "status" "text" DEFAULT 'Open'::"text" NOT NULL,
    "related" "text" DEFAULT ''::"text" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_by_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pair_id" "uuid" NOT NULL,
    "entity" "text" NOT NULL,
    "entity_id" "uuid",
    "label" "text" NOT NULL,
    "field" "text" DEFAULT 'status'::"text" NOT NULL,
    "old_value" "text",
    "new_value" "text" NOT NULL,
    "actor_name" "text" NOT NULL,
    "actor_role" "text" NOT NULL,
    "source" "text" DEFAULT 'web'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."career_answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pair_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text" NOT NULL,
    "created_by_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."career_answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checkins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pair_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "asked" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "meeting_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "in_progress" boolean DEFAULT false NOT NULL,
    "draft_state" "jsonb"
);


ALTER TABLE "public"."checkins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."concerns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pair_id" "uuid" NOT NULL,
    "what" "text" NOT NULL,
    "concern_date" "date",
    "expectation" "text" DEFAULT ''::"text" NOT NULL,
    "communicated" "text" DEFAULT ''::"text" NOT NULL,
    "previously" "text" DEFAULT ''::"text" NOT NULL,
    "support" "text" DEFAULT ''::"text" NOT NULL,
    "outcome" "text" DEFAULT ''::"text" NOT NULL,
    "created_by_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."concerns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pair_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "text" "text" NOT NULL,
    "category" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."custom_suggestions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."development_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pair_id" "uuid" NOT NULL,
    "area" "text" NOT NULL,
    "why" "text" DEFAULT ''::"text" NOT NULL,
    "type" "text" NOT NULL,
    "activity" "text" DEFAULT ''::"text" NOT NULL,
    "support" "text" DEFAULT ''::"text" NOT NULL,
    "target_date" "date",
    "status" "text" DEFAULT 'Not Started'::"text" NOT NULL,
    "measure" "text" DEFAULT ''::"text" NOT NULL,
    "created_by_role" "text" NOT NULL,
    "created_by_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."development_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pair_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "url" "text",
    "storage_path" "text",
    "size" bigint,
    "mime_type" "text",
    "created_by_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pair_id" "uuid" NOT NULL,
    "giver_role" "text" NOT NULL,
    "from_name" "text" NOT NULL,
    "to_name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "text" "text" NOT NULL,
    "example" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "response" "text",
    "responded_at" timestamp with time zone
);


ALTER TABLE "public"."feedback_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pair_id" "uuid" NOT NULL,
    "from_role" "text" NOT NULL,
    "from_name" "text" NOT NULL,
    "about" "text" DEFAULT ''::"text" NOT NULL,
    "why" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."feedback_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."form_drafts" (
    "pair_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "draft" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."form_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pair_id" "uuid" NOT NULL,
    "text" "text" NOT NULL,
    "why" "text" DEFAULT ''::"text" NOT NULL,
    "measure" "text" DEFAULT ''::"text" NOT NULL,
    "owner_label" "text" NOT NULL,
    "target_date" "date",
    "status" "text" DEFAULT 'Not Started'::"text" NOT NULL,
    "progress" smallint DEFAULT 0 NOT NULL,
    "obstacles" "text" DEFAULT ''::"text" NOT NULL,
    "support" "text" DEFAULT ''::"text" NOT NULL,
    "created_by_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."handbook_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "storage_path" "text",
    "size" bigint,
    "mime_type" "text"
);


ALTER TABLE "public"."handbook_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meetings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pair_id" "uuid" NOT NULL,
    "meeting_date" "date" NOT NULL,
    "meeting_time" time without time zone,
    "discussed" "text" DEFAULT ''::"text" NOT NULL,
    "agreed" "text" DEFAULT ''::"text" NOT NULL,
    "revisit" "text" DEFAULT ''::"text" NOT NULL,
    "start_line" "text" DEFAULT ''::"text" NOT NULL,
    "stop_line" "text" DEFAULT ''::"text" NOT NULL,
    "keep_line" "text" DEFAULT ''::"text" NOT NULL,
    "checkin90_date" "date",
    "topics_snapshot" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_by_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."meetings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pair_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "text" "text" NOT NULL,
    "role" "text" NOT NULL,
    "created_by_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pair_id" "uuid" NOT NULL,
    "text" "text" NOT NULL,
    "created_by_role" "text" NOT NULL,
    "to_role" "text" NOT NULL,
    "view" "text",
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kind" "text",
    "entity_id" "uuid"
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "public"."citext" NOT NULL,
    "full_name" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_drafts" (
    "pair_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "draft" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."review_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."slack_pair_selections" (
    "slack_user_id" "text" NOT NULL,
    "pair_id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."slack_pair_selections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pair_id" "uuid" NOT NULL,
    "text" "text" NOT NULL,
    "why" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_by_role" "text" NOT NULL,
    "created_by_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_at" timestamp with time zone
);


ALTER TABLE "public"."topics" OWNER TO "postgres";


ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."actions"
    ADD CONSTRAINT "actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."career_answers"
    ADD CONSTRAINT "career_answers_pair_id_role_question_key" UNIQUE ("pair_id", "role", "question");



ALTER TABLE ONLY "public"."career_answers"
    ADD CONSTRAINT "career_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkins"
    ADD CONSTRAINT "checkins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."concerns"
    ADD CONSTRAINT "concerns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_suggestions"
    ADD CONSTRAINT "custom_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."development_plans"
    ADD CONSTRAINT "development_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_entries"
    ADD CONSTRAINT "feedback_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_requests"
    ADD CONSTRAINT "feedback_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."form_drafts"
    ADD CONSTRAINT "form_drafts_pkey" PRIMARY KEY ("pair_id", "role", "kind");



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."handbook_links"
    ADD CONSTRAINT "handbook_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pairs"
    ADD CONSTRAINT "pairs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_drafts"
    ADD CONSTRAINT "review_drafts_pkey" PRIMARY KEY ("pair_id", "role");



ALTER TABLE ONLY "public"."slack_pair_selections"
    ADD CONSTRAINT "slack_pair_selections_pkey" PRIMARY KEY ("slack_user_id");



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_pkey" PRIMARY KEY ("id");



CREATE INDEX "activity_log_pair_created_idx" ON "public"."activity_log" USING "btree" ("pair_id", "created_at" DESC);



CREATE UNIQUE INDEX "pairs_active_employee_manager_email_key" ON "public"."pairs" USING "btree" ("employee_email", "manager_email") WHERE ("closed_at" IS NULL);



CREATE INDEX "pairs_employee_email_idx" ON "public"."pairs" USING "btree" ("employee_email");



CREATE UNIQUE INDEX "pairs_employee_manager_key" ON "public"."pairs" USING "btree" ("employee_id", "manager_id") WHERE ("closed_at" IS NULL);



CREATE INDEX "pairs_manager_email_idx" ON "public"."pairs" USING "btree" ("manager_email");



CREATE INDEX "profiles_email_idx" ON "public"."profiles" USING "btree" ("email");



CREATE OR REPLACE TRIGGER "pairs_close_guard" BEFORE UPDATE ON "public"."pairs" FOR EACH ROW EXECUTE FUNCTION "public"."guard_pairs_close"();



CREATE OR REPLACE TRIGGER "slack_notify" AFTER INSERT ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://performance-pulse-lyart.vercel.app/api/slack/notify', 'POST', '{"Content-type":"application/json","x-webhook-secret":"f7f1949b4fe83d4b7a1b5248bcd606d238a22aa04a8398cc330f61b07e899fc4"}', '{}', '5000');



ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."actions"
    ADD CONSTRAINT "actions_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."career_answers"
    ADD CONSTRAINT "career_answers_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checkins"
    ADD CONSTRAINT "checkins_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."checkins"
    ADD CONSTRAINT "checkins_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."concerns"
    ADD CONSTRAINT "concerns_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."custom_suggestions"
    ADD CONSTRAINT "custom_suggestions_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."development_plans"
    ADD CONSTRAINT "development_plans_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_entries"
    ADD CONSTRAINT "feedback_entries_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_requests"
    ADD CONSTRAINT "feedback_requests_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."form_drafts"
    ADD CONSTRAINT "form_drafts_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pairs"
    ADD CONSTRAINT "pairs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pairs"
    ADD CONSTRAINT "pairs_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_drafts"
    ADD CONSTRAINT "review_drafts_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."slack_pair_selections"
    ADD CONSTRAINT "slack_pair_selections_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE CASCADE;



ALTER TABLE "public"."achievements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "any signed-in user can select" ON "public"."handbook_links" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."career_answers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."checkins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."concerns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."custom_suggestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."development_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."form_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."handbook_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hr can delete" ON "public"."handbook_links" FOR DELETE USING ("public"."is_hr"());



CREATE POLICY "hr can insert" ON "public"."handbook_links" FOR INSERT WITH CHECK ("public"."is_hr"());



CREATE POLICY "hr can update" ON "public"."handbook_links" FOR UPDATE USING ("public"."is_hr"());



CREATE POLICY "manager can delete" ON "public"."concerns" FOR DELETE USING ("public"."is_pair_manager"("pair_id"));



CREATE POLICY "manager can insert" ON "public"."concerns" FOR INSERT WITH CHECK ("public"."is_pair_manager"("pair_id"));



CREATE POLICY "manager can select" ON "public"."concerns" FOR SELECT USING ("public"."is_pair_manager"("pair_id"));



CREATE POLICY "manager can update" ON "public"."concerns" FOR UPDATE USING ("public"."is_pair_manager"("pair_id"));



ALTER TABLE "public"."meetings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "own role can delete" ON "public"."form_drafts" FOR DELETE USING ("public"."is_own_role_row"("pair_id", "role"));



CREATE POLICY "own role can delete" ON "public"."review_drafts" FOR DELETE USING ("public"."is_own_role_row"("pair_id", "role"));



CREATE POLICY "own role can insert" ON "public"."form_drafts" FOR INSERT WITH CHECK ("public"."is_own_role_row"("pair_id", "role"));



CREATE POLICY "own role can insert" ON "public"."review_drafts" FOR INSERT WITH CHECK ("public"."is_own_role_row"("pair_id", "role"));



CREATE POLICY "own role can select" ON "public"."form_drafts" FOR SELECT USING ("public"."is_own_role_row"("pair_id", "role"));



CREATE POLICY "own role can select" ON "public"."review_drafts" FOR SELECT USING ("public"."is_own_role_row"("pair_id", "role"));



CREATE POLICY "own role can update" ON "public"."form_drafts" FOR UPDATE USING ("public"."is_own_role_row"("pair_id", "role"));



CREATE POLICY "own role can update" ON "public"."review_drafts" FOR UPDATE USING ("public"."is_own_role_row"("pair_id", "role"));



CREATE POLICY "pair members can delete" ON "public"."achievements" FOR DELETE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can delete" ON "public"."actions" FOR DELETE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can delete" ON "public"."career_answers" FOR DELETE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can delete" ON "public"."checkins" FOR DELETE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can delete" ON "public"."custom_suggestions" FOR DELETE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can delete" ON "public"."development_plans" FOR DELETE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can delete" ON "public"."documents" FOR DELETE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can delete" ON "public"."feedback_entries" FOR DELETE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can delete" ON "public"."feedback_requests" FOR DELETE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can delete" ON "public"."goals" FOR DELETE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can delete" ON "public"."meetings" FOR DELETE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can delete" ON "public"."messages" FOR DELETE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can delete" ON "public"."notifications" FOR DELETE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can delete" ON "public"."topics" FOR DELETE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can insert" ON "public"."achievements" FOR INSERT WITH CHECK ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can insert" ON "public"."actions" FOR INSERT WITH CHECK ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can insert" ON "public"."activity_log" FOR INSERT WITH CHECK ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can insert" ON "public"."career_answers" FOR INSERT WITH CHECK ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can insert" ON "public"."checkins" FOR INSERT WITH CHECK ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can insert" ON "public"."custom_suggestions" FOR INSERT WITH CHECK ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can insert" ON "public"."development_plans" FOR INSERT WITH CHECK ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can insert" ON "public"."documents" FOR INSERT WITH CHECK ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can insert" ON "public"."feedback_entries" FOR INSERT WITH CHECK ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can insert" ON "public"."feedback_requests" FOR INSERT WITH CHECK ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can insert" ON "public"."goals" FOR INSERT WITH CHECK ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can insert" ON "public"."meetings" FOR INSERT WITH CHECK ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can insert" ON "public"."messages" FOR INSERT WITH CHECK ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can insert" ON "public"."notifications" FOR INSERT WITH CHECK ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can insert" ON "public"."topics" FOR INSERT WITH CHECK ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can select" ON "public"."achievements" FOR SELECT USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can select" ON "public"."actions" FOR SELECT USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can select" ON "public"."activity_log" FOR SELECT USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can select" ON "public"."career_answers" FOR SELECT USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can select" ON "public"."checkins" FOR SELECT USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can select" ON "public"."custom_suggestions" FOR SELECT USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can select" ON "public"."development_plans" FOR SELECT USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can select" ON "public"."documents" FOR SELECT USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can select" ON "public"."feedback_entries" FOR SELECT USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can select" ON "public"."feedback_requests" FOR SELECT USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can select" ON "public"."goals" FOR SELECT USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can select" ON "public"."meetings" FOR SELECT USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can select" ON "public"."messages" FOR SELECT USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can select" ON "public"."notifications" FOR SELECT USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can select" ON "public"."topics" FOR SELECT USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can update" ON "public"."achievements" FOR UPDATE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can update" ON "public"."actions" FOR UPDATE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can update" ON "public"."career_answers" FOR UPDATE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can update" ON "public"."checkins" FOR UPDATE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can update" ON "public"."custom_suggestions" FOR UPDATE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can update" ON "public"."development_plans" FOR UPDATE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can update" ON "public"."documents" FOR UPDATE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can update" ON "public"."feedback_entries" FOR UPDATE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can update" ON "public"."feedback_requests" FOR UPDATE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can update" ON "public"."goals" FOR UPDATE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can update" ON "public"."meetings" FOR UPDATE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can update" ON "public"."messages" FOR UPDATE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can update" ON "public"."notifications" FOR UPDATE USING ("public"."is_pair_member"("pair_id"));



CREATE POLICY "pair members can update" ON "public"."topics" FOR UPDATE USING ("public"."is_pair_member"("pair_id"));



ALTER TABLE "public"."pairs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_drafts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "select own or partner profile" ON "public"."profiles" FOR SELECT USING ((("id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."pairs"
  WHERE ((("pairs"."employee_id" = "auth"."uid"()) AND ("pairs"."manager_id" = "profiles"."id")) OR (("pairs"."manager_id" = "auth"."uid"()) AND ("pairs"."employee_id" = "profiles"."id")))))));



CREATE POLICY "select own pair" ON "public"."pairs" FOR SELECT USING ((("employee_id" = "auth"."uid"()) OR ("manager_id" = "auth"."uid"())));



ALTER TABLE "public"."slack_pair_selections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."topics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "update own pair" ON "public"."pairs" FOR UPDATE USING ((("employee_id" = "auth"."uid"()) OR ("manager_id" = "auth"."uid"())));



CREATE POLICY "update own profile" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextin"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextout"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextrecv"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citextsend"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext"(boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."citext"(character) TO "postgres";
GRANT ALL ON FUNCTION "public"."citext"(character) TO "anon";
GRANT ALL ON FUNCTION "public"."citext"(character) TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext"(character) TO "service_role";



GRANT ALL ON FUNCTION "public"."citext"("inet") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext"("inet") TO "anon";
GRANT ALL ON FUNCTION "public"."citext"("inet") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext"("inet") TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_cmp"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_eq"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_ge"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_gt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_hash"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_hash_extended"("public"."citext", bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_larger"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_le"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_lt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_ne"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_cmp"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_ge"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_gt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_le"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_pattern_lt"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."citext_smaller"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON TABLE "public"."pairs" TO "anon";
GRANT ALL ON TABLE "public"."pairs" TO "authenticated";
GRANT ALL ON TABLE "public"."pairs" TO "service_role";



GRANT ALL ON FUNCTION "public"."create_pair"("my_role" "text", "partner_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_pair"("my_role" "text", "partner_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_pair"("my_role" "text", "partner_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_pairs_close"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_pairs_close"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_pairs_close"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_hr"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_hr"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_hr"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_own_role_row"("check_pair_id" "uuid", "check_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_own_role_row"("check_pair_id" "uuid", "check_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_own_role_row"("check_pair_id" "uuid", "check_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_pair_manager"("check_pair_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_pair_manager"("check_pair_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_pair_manager"("check_pair_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_pair_member"("check_pair_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_pair_member"("check_pair_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_pair_member"("check_pair_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_match"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_matches"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_replace"("public"."citext", "public"."citext", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_array"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."regexp_split_to_table"("public"."citext", "public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace"("public"."citext", "public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."split_part"("public"."citext", "public"."citext", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strpos"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticlike"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticnlike"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexeq"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."texticregexne"("public"."citext", "public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."translate"("public"."citext", "public"."citext", "text") TO "service_role";












GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."max"("public"."citext") TO "service_role";



GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "postgres";
GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "anon";
GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "authenticated";
GRANT ALL ON FUNCTION "public"."min"("public"."citext") TO "service_role";









GRANT ALL ON TABLE "public"."achievements" TO "anon";
GRANT ALL ON TABLE "public"."achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."achievements" TO "service_role";



GRANT ALL ON TABLE "public"."actions" TO "anon";
GRANT ALL ON TABLE "public"."actions" TO "authenticated";
GRANT ALL ON TABLE "public"."actions" TO "service_role";



GRANT ALL ON TABLE "public"."activity_log" TO "anon";
GRANT ALL ON TABLE "public"."activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."career_answers" TO "anon";
GRANT ALL ON TABLE "public"."career_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."career_answers" TO "service_role";



GRANT ALL ON TABLE "public"."checkins" TO "anon";
GRANT ALL ON TABLE "public"."checkins" TO "authenticated";
GRANT ALL ON TABLE "public"."checkins" TO "service_role";



GRANT ALL ON TABLE "public"."concerns" TO "anon";
GRANT ALL ON TABLE "public"."concerns" TO "authenticated";
GRANT ALL ON TABLE "public"."concerns" TO "service_role";



GRANT ALL ON TABLE "public"."custom_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."custom_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."development_plans" TO "anon";
GRANT ALL ON TABLE "public"."development_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."development_plans" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_entries" TO "anon";
GRANT ALL ON TABLE "public"."feedback_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_entries" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_requests" TO "anon";
GRANT ALL ON TABLE "public"."feedback_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_requests" TO "service_role";



GRANT ALL ON TABLE "public"."form_drafts" TO "anon";
GRANT ALL ON TABLE "public"."form_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."form_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."goals" TO "anon";
GRANT ALL ON TABLE "public"."goals" TO "authenticated";
GRANT ALL ON TABLE "public"."goals" TO "service_role";



GRANT ALL ON TABLE "public"."handbook_links" TO "anon";
GRANT ALL ON TABLE "public"."handbook_links" TO "authenticated";
GRANT ALL ON TABLE "public"."handbook_links" TO "service_role";



GRANT ALL ON TABLE "public"."meetings" TO "anon";
GRANT ALL ON TABLE "public"."meetings" TO "authenticated";
GRANT ALL ON TABLE "public"."meetings" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."review_drafts" TO "anon";
GRANT ALL ON TABLE "public"."review_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."review_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."slack_pair_selections" TO "anon";
GRANT ALL ON TABLE "public"."slack_pair_selections" TO "authenticated";
GRANT ALL ON TABLE "public"."slack_pair_selections" TO "service_role";



GRANT ALL ON TABLE "public"."topics" TO "anon";
GRANT ALL ON TABLE "public"."topics" TO "authenticated";
GRANT ALL ON TABLE "public"."topics" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































