-- Prepared locally only. Applying this migration requires separate database authorization.
-- Reject historical UUID collisions rather than silently assigning a wrong kind.
INSERT INTO public.object_ref (id, kind)
SELECT id, 'person' FROM public.person UNION ALL
SELECT id, 'artifact' FROM public.artifact UNION ALL
SELECT id, 'concept' FROM public.concept UNION ALL
SELECT id, 'organisation' FROM public.organisation;
--> statement-breakpoint
CREATE FUNCTION public.memory_register_subtype() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.object_ref WHERE id = OLD.id AND kind = TG_TABLE_NAME;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Memory object IDs are immutable' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.object_ref (id, kind) VALUES (NEW.id, TG_TABLE_NAME)
    ON CONFLICT (id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.object_ref WHERE id = NEW.id AND kind = TG_TABLE_NAME) THEN
    RAISE EXCEPTION 'Memory subtype mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.memory_check_subtypes() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF EXISTS (
    WITH subtypes AS (
      SELECT id, 'person' kind FROM public.person UNION ALL
      SELECT id, 'artifact' FROM public.artifact UNION ALL
      SELECT id, 'concept' FROM public.concept UNION ALL
      SELECT id, 'organisation' FROM public.organisation UNION ALL
      SELECT id, 'encounter' FROM public.encounter UNION ALL
      SELECT id, 'observation' FROM public.observation)
    SELECT 1 FROM public.object_ref r FULL JOIN subtypes s ON s.id = r.id
    GROUP BY coalesce(r.id, s.id), r.kind
    HAVING count(s.id) <> 1 OR count(r.id) <> 1 OR bool_or(s.kind IS DISTINCT FROM r.kind)
  ) THEN
    RAISE EXCEPTION 'Memory registry requires exactly one matching subtype' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
DO $$
DECLARE subtype text;
BEGIN
  FOREACH subtype IN ARRAY ARRAY['person','artifact','concept','organisation','encounter','observation'] LOOP
    EXECUTE format('CREATE TRIGGER memory_register BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.memory_register_subtype()', subtype);
    EXECUTE format('CREATE TRIGGER memory_unregister AFTER DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.memory_register_subtype()', subtype);
    EXECUTE format('CREATE CONSTRAINT TRIGGER memory_subtype_guard AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.memory_check_subtypes()', subtype);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER memory_registry_guard AFTER INSERT OR UPDATE OR DELETE ON public.object_ref
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.memory_check_subtypes();
--> statement-breakpoint
-- Serialize graph mutations so concurrent inverse links cannot evade cycle validation.
CREATE FUNCTION public.memory_graph_lock() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_setting('transaction_isolation') = 'repeatable read' THEN
    RAISE EXCEPTION 'Memory graph writes require read committed or serializable isolation' USING ERRCODE = '25000';
  END IF;
  PERFORM pg_advisory_xact_lock(1790703955, 1);
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.memory_check_graphs() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE edges AS (
      SELECT 'alias' graph, former_object_id a, canonical_object_id b FROM public.object_alias
      UNION ALL SELECT 'revision', id, supersedes_id FROM public.observation WHERE supersedes_id IS NOT NULL
      UNION ALL SELECT 'evidence', observation_id, supporting_observation_id
        FROM public.observation_evidence WHERE supporting_observation_id IS NOT NULL
    ), paths AS (
      SELECT graph, a, b, ARRAY[a,b] path, a = b cyclic FROM edges
      UNION ALL SELECT p.graph, p.a, e.b, p.path || e.b, e.b = ANY(p.path)
        FROM paths p JOIN edges e ON e.graph = p.graph AND e.a = p.b WHERE NOT p.cyclic
    ) SELECT 1 FROM paths WHERE cyclic
  ) THEN
    RAISE EXCEPTION 'Memory alias, revision or evidence cycle' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.object_alias a
    JOIN public.object_ref f ON f.id = a.former_object_id
    JOIN public.object_ref c ON c.id = a.canonical_object_id WHERE f.kind <> c.kind) THEN
    RAISE EXCEPTION 'Memory aliases must retain object kind' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.observation_review r
    JOIN public.observation original ON original.id = r.observation_id
    JOIN public.observation replacement ON replacement.id = r.replacement_observation_id
    WHERE replacement.truth_layer <> 'user' OR replacement.subject_id <> original.subject_id
      OR replacement.supersedes_id IS DISTINCT FROM original.id) THEN
    RAISE EXCEPTION 'Review replacement must be a linked User revision' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.observation o WHERE o.truth_layer IN ('source','extracted')
    AND o.support_status = 'verified' AND NOT EXISTS (
      SELECT 1 FROM public.observation_evidence e LEFT JOIN public.observation supporting
        ON supporting.id = e.supporting_observation_id
      WHERE e.observation_id = o.id AND e.support_role = 'supports'
        AND (e.snapshot_id IS NOT NULL OR (o.truth_layer = 'extracted'
          AND supporting.truth_layer IN ('source','extracted') AND supporting.support_status = 'verified'))
    )) THEN
    RAISE EXCEPTION 'Verified source/extraction requires captured support' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.memory_immutable_assertion() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'Append a revision instead of updating memory evidence' USING ERRCODE = '23514';
END $$;
--> statement-breakpoint
CREATE TRIGGER memory_observation_immutable BEFORE UPDATE ON public.observation
FOR EACH ROW EXECUTE FUNCTION public.memory_immutable_assertion();
--> statement-breakpoint
CREATE TRIGGER memory_evidence_immutable BEFORE UPDATE ON public.observation_evidence
FOR EACH ROW EXECUTE FUNCTION public.memory_immutable_assertion();
--> statement-breakpoint
DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['object_alias','observation','observation_evidence','observation_review'] LOOP
    EXECUTE format('CREATE TRIGGER memory_graph_serialization BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.memory_graph_lock()', relation_name);
    EXECUTE format('CREATE CONSTRAINT TRIGGER memory_graph_guard AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.memory_check_graphs()', relation_name);
  END LOOP;
END $$;
