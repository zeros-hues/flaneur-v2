CREATE TABLE "attention_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"stop_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "attention_event_kind" CHECK ("attention_event"."kind" in ('shown','opened','kept','useful','reduced','dismissed','passed','unavailable'))
);
--> statement-breakpoint
CREATE TABLE "walk_session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"local_day" date NOT NULL,
	"timezone" text NOT NULL,
	"explicit_context" text,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"sealed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"stop_count" smallint NOT NULL,
	CONSTRAINT "walk_session_owner_day" UNIQUE("owner_id","local_day"),
	CONSTRAINT "walk_session_timezone_length" CHECK (length("walk_session"."timezone") between 1 and 100),
	CONSTRAINT "walk_session_context_length" CHECK (length("walk_session"."explicit_context") <= 2000),
	CONSTRAINT "walk_session_stop_count" CHECK ("walk_session"."stop_count" between 0 and 3),
	CONSTRAINT "walk_session_sealing" CHECK ("walk_session"."sealed_at" is null or "walk_session"."sealed_at" >= "walk_session"."created_at"),
	CONSTRAINT "walk_session_completion" CHECK ("walk_session"."completed_at" is null or ("walk_session"."sealed_at" is not null and "walk_session"."completed_at" >= "walk_session"."sealed_at"))
);
--> statement-breakpoint
CREATE TABLE "walk_stop" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"selection_reasons" jsonb NOT NULL,
	"selection_support" jsonb NOT NULL,
	"selection_inputs" jsonb NOT NULL,
	"rank_version" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" text,
	CONSTRAINT "walk_stop_session_position" UNIQUE("session_id","position"),
	CONSTRAINT "walk_stop_session_object" UNIQUE("session_id","object_id"),
	CONSTRAINT "walk_stop_position" CHECK ("walk_stop"."position" between 1 and 3),
	CONSTRAINT "walk_stop_reasons" CHECK (jsonb_typeof("walk_stop"."selection_reasons")='array' and jsonb_array_length("walk_stop"."selection_reasons") between 1 and 4 and octet_length("walk_stop"."selection_reasons"::text)<=4096),
	CONSTRAINT "walk_stop_support" CHECK (jsonb_typeof("walk_stop"."selection_support")='array' and jsonb_array_length("walk_stop"."selection_support") between 1 and 5 and octet_length("walk_stop"."selection_support"::text)<=16384),
	CONSTRAINT "walk_stop_inputs" CHECK (jsonb_typeof("walk_stop"."selection_inputs")='object' and octet_length("walk_stop"."selection_inputs"::text)<=1024),
	CONSTRAINT "walk_stop_rank_version" CHECK ("walk_stop"."rank_version"='contextual-v1'),
	CONSTRAINT "walk_stop_resolution" CHECK ("walk_stop"."resolution" in ('kept','useful','reduced','dismissed','passed','unavailable')),
	CONSTRAINT "walk_stop_resolution_time" CHECK (("walk_stop"."resolved_at" is null)=("walk_stop"."resolution" is null))
);
--> statement-breakpoint
ALTER TABLE "attention_event" ADD CONSTRAINT "attention_event_stop_id_walk_stop_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."walk_stop"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walk_stop" ADD CONSTRAINT "walk_stop_session_id_walk_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."walk_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walk_stop" ADD CONSTRAINT "walk_stop_object_id_object_ref_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."object_ref"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attention_event_one_shown" ON "attention_event" USING btree ("stop_id") WHERE "attention_event"."kind"='shown';--> statement-breakpoint
CREATE UNIQUE INDEX "attention_event_one_resolution" ON "attention_event" USING btree ("stop_id") WHERE "attention_event"."kind" in ('kept','useful','reduced','dismissed','passed','unavailable');--> statement-breakpoint
CREATE INDEX "attention_event_stop_history" ON "attention_event" USING btree ("stop_id","recorded_at");--> statement-breakpoint
CREATE INDEX "walk_session_owner_history" ON "walk_session" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "walk_stop_object_history" ON "walk_stop" USING btree ("object_id","session_id");
--> statement-breakpoint
CREATE FUNCTION public.guard_walk_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='WALK_HISTORY_IMMUTABLE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('flaneur:walk-owner:'||NEW.owner_id::text,0));
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.timezone) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='WALK_TIMEZONE_INVALID';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.sealed_at IS NOT NULL OR NEW.completed_at IS NOT NULL OR NEW.stop_count<>0
      OR NEW.local_day<>(NEW.created_at AT TIME ZONE NEW.timezone)::date
      OR EXISTS(SELECT 1 FROM public.walk_session WHERE owner_id=NEW.owner_id AND timezone<>NEW.timezone) THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='WALK_SESSION_INVALID';
    END IF;
  ELSE
    IF (NEW.id,NEW.owner_id,NEW.local_day,NEW.timezone,NEW.explicit_context,NEW.created_at)
      IS DISTINCT FROM (OLD.id,OLD.owner_id,OLD.local_day,OLD.timezone,OLD.explicit_context,OLD.created_at)
      OR (OLD.sealed_at IS NOT NULL AND (NEW.sealed_at,NEW.stop_count) IS DISTINCT FROM (OLD.sealed_at,OLD.stop_count))
      OR (OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at) THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='WALK_SESSION_IMMUTABLE';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_walk_session BEFORE INSERT OR UPDATE OR DELETE ON public.walk_session
  FOR EACH ROW EXECUTE FUNCTION public.guard_walk_session();

CREATE FUNCTION public.guard_walk_stop() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE session_row public.walk_session; object_row public.object_ref;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='WALK_HISTORY_IMMUTABLE'; END IF;
  SELECT * INTO session_row FROM public.walk_session WHERE id=NEW.session_id FOR UPDATE;
  IF TG_OP='INSERT' THEN
    PERFORM pg_advisory_xact_lock_shared(1790703955,1);
    SELECT * INTO object_row FROM public.object_ref WHERE id=NEW.object_id FOR SHARE;
    IF session_row.sealed_at IS NOT NULL OR object_row.id IS NULL OR object_row.kind NOT IN ('person','artifact')
      OR object_row.archived_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.object_alias WHERE former_object_id=NEW.object_id)
      OR NEW.resolved_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='WALK_STOP_INVALID';
    END IF;
  ELSE
    IF (NEW.id,NEW.session_id,NEW.object_id,NEW.position,NEW.selection_reasons,NEW.selection_support,NEW.selection_inputs,NEW.rank_version)
      IS DISTINCT FROM (OLD.id,OLD.session_id,OLD.object_id,OLD.position,OLD.selection_reasons,OLD.selection_support,OLD.selection_inputs,OLD.rank_version)
      OR (OLD.resolved_at IS NOT NULL AND (NEW.resolved_at,NEW.resolution) IS DISTINCT FROM (OLD.resolved_at,OLD.resolution))
      OR (NEW.resolved_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.attention_event
        WHERE stop_id=NEW.id AND kind=NEW.resolution AND recorded_at=NEW.resolved_at)) THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='WALK_STOP_IMMUTABLE';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_walk_stop BEFORE INSERT OR UPDATE OR DELETE ON public.walk_stop
  FOR EACH ROW EXECUTE FUNCTION public.guard_walk_stop();

CREATE FUNCTION public.guard_attention_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE stop_row public.walk_stop; session_row public.walk_session;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='WALK_EVENT_IMMUTABLE'; END IF;
  SELECT s.* INTO session_row FROM public.walk_session s JOIN public.walk_stop t ON t.session_id=s.id WHERE t.id=NEW.stop_id FOR UPDATE OF s;
  SELECT * INTO stop_row FROM public.walk_stop WHERE id=NEW.stop_id FOR UPDATE;
  IF stop_row.id IS NULL OR session_row.sealed_at IS NULL OR session_row.completed_at IS NOT NULL OR stop_row.resolved_at IS NOT NULL
    OR (NEW.kind NOT IN ('shown','unavailable') AND NOT EXISTS(SELECT 1 FROM public.attention_event WHERE stop_id=NEW.stop_id AND kind='shown')) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='WALK_EVENT_INVALID';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_attention_event BEFORE INSERT OR UPDATE OR DELETE ON public.attention_event
  FOR EACH ROW EXECUTE FUNCTION public.guard_attention_event();

CREATE FUNCTION public.check_walk_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE session_row public.walk_session; target_id uuid;
BEGIN
  IF TG_TABLE_NAME='walk_session' THEN target_id:=NEW.id; ELSE target_id:=NEW.session_id; END IF;
  SELECT * INTO session_row FROM public.walk_session WHERE id=target_id;
  IF session_row.sealed_at IS NULL OR session_row.stop_count<>(SELECT count(*) FROM public.walk_stop WHERE session_id=session_row.id)
    OR EXISTS(SELECT 1 FROM public.walk_stop WHERE session_id=session_row.id AND position>session_row.stop_count)
    OR ((session_row.completed_at IS NOT NULL) IS DISTINCT FROM
      NOT EXISTS(SELECT 1 FROM public.walk_stop WHERE session_id=session_row.id AND resolved_at IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='WALK_BOUNDARY_INVALID';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER check_walk_session_boundary AFTER INSERT OR UPDATE ON public.walk_session
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_walk_boundary();
CREATE CONSTRAINT TRIGGER check_walk_stop_boundary AFTER INSERT OR UPDATE ON public.walk_stop
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_walk_boundary();
CREATE FUNCTION public.check_attention_resolution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind IN ('kept','useful','reduced','dismissed','passed','unavailable') AND NOT EXISTS(
    SELECT 1 FROM public.walk_stop WHERE id=NEW.stop_id AND resolution=NEW.kind AND resolved_at=NEW.recorded_at) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='WALK_RESOLUTION_INVALID';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER check_attention_resolution AFTER INSERT ON public.attention_event
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_attention_resolution();
