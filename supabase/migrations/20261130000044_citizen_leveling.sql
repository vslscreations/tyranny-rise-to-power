BEGIN;

-- Only Level 1 is configured. Future thresholds and earning amounts require
-- an explicit balancing decision; this migration never awards XP or rewards.
CREATE FUNCTION public.valid_xp_thresholds(p_thresholds bigint[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT coalesce(array_ndims(p_thresholds)=1 AND array_lower(p_thresholds,1)=1
    AND cardinality(p_thresholds) BETWEEN 1 AND 10000 AND p_thresholds[1]=0
    AND NOT EXISTS (
      SELECT 1 FROM unnest(p_thresholds) WITH ORDINALITY AS t(xp,n)
      WHERE xp IS NULL OR xp<0 OR (n>1 AND xp<=p_thresholds[(n-1)::integer])
    ),false);
$$;

CREATE TABLE public.xp_level_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  thresholds bigint[] NOT NULL DEFAULT ARRAY[0::bigint]
    CHECK(public.valid_xp_thresholds(thresholds))
);
INSERT INTO public.xp_level_config DEFAULT VALUES;

CREATE TABLE public.citizen_xp (
  citizen_id uuid PRIMARY KEY REFERENCES public.citizens(id) ON DELETE CASCADE,
  total_xp bigint NOT NULL DEFAULT 0 CHECK(total_xp>=0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.xp_activity_rules (
  activity_key text PRIMARY KEY CHECK(length(btrim(activity_key)) BETWEEN 1 AND 128 AND activity_key=btrim(activity_key)),
  xp_amount bigint CHECK(xp_amount>0),
  enabled boolean NOT NULL DEFAULT false,
  CHECK(NOT enabled OR xp_amount IS NOT NULL)
);
CREATE TABLE public.citizen_xp_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  citizen_id uuid NOT NULL REFERENCES public.citizens(id) ON DELETE CASCADE,
  activity_key text NOT NULL,
  event_key text NOT NULL CHECK(length(btrim(event_key)) BETWEEN 1 AND 255),
  amount bigint NOT NULL CHECK(amount>0),
  total_xp_after bigint NOT NULL CHECK(total_xp_after>=amount),
  level_before integer NOT NULL CHECK(level_before>=1),
  level_after integer NOT NULL CHECK(level_after>=level_before),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(citizen_id,activity_key,event_key)
);
-- Empty definitions for future server-validated rewards and feature gates.
-- These definitions grant nothing; no existing game system consults them yet.
CREATE TABLE public.xp_level_milestones (
  milestone_key text PRIMARY KEY CHECK(length(btrim(milestone_key)) BETWEEN 1 AND 128),
  required_level integer NOT NULL CHECK(required_level>=1),
  kind text NOT NULL CHECK(kind IN ('reward','feature_unlock')),
  enabled boolean NOT NULL DEFAULT false,
  definition jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(definition)='object')
);

ALTER TABLE public.xp_level_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citizen_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_activity_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citizen_xp_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_level_milestones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.xp_level_config, public.citizen_xp, public.xp_activity_rules,
  public.citizen_xp_ledger, public.xp_level_milestones FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.citizen_xp_ledger_id_seq FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.xp_level_config,public.citizen_xp,public.citizen_xp_ledger TO service_role;
GRANT UPDATE(thresholds) ON public.xp_level_config TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.xp_activity_rules,public.xp_level_milestones TO service_role;
REVOKE ALL ON FUNCTION public.valid_xp_thresholds(bigint[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.valid_xp_thresholds(bigint[]) TO service_role;

CREATE FUNCTION public.initialize_citizen_xp() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.citizen_xp(citizen_id) VALUES(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.initialize_citizen_xp() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER initialize_citizen_xp AFTER INSERT ON public.citizens
  FOR EACH ROW EXECUTE FUNCTION public.initialize_citizen_xp();
INSERT INTO public.citizen_xp(citizen_id) SELECT id FROM public.citizens;

-- Private shared calculation used by the self-read endpoint and future trusted
-- server integrations. Bigint values cross JSON as strings, without precision loss.
CREATE FUNCTION public.citizen_level_state(p_citizen_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE total bigint; curve bigint[]; current_level integer; floor_xp bigint; next_xp bigint;
BEGIN
  SELECT total_xp INTO total FROM public.citizen_xp WHERE citizen_id=p_citizen_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Citizen XP record not found.' USING ERRCODE='P0002'; END IF;
  SELECT thresholds INTO curve FROM public.xp_level_config WHERE singleton;
  IF curve IS NULL THEN RAISE EXCEPTION 'Level configuration unavailable.'; END IF;
  SELECT max(n)::integer INTO current_level FROM unnest(curve) WITH ORDINALITY t(xp,n) WHERE xp<=total;
  floor_xp:=curve[current_level]; next_xp:=curve[current_level+1];
  RETURN jsonb_build_object('citizen_id',p_citizen_id,'level',current_level,'total_xp',total::text,
    'level_start_xp',floor_xp::text,'xp_into_level',(total-floor_xp)::text,
    'next_level',CASE WHEN next_xp IS NULL THEN NULL ELSE current_level+1 END,
    'next_level_xp',next_xp::text,'xp_for_next_level',(next_xp-floor_xp)::text,
    'xp_remaining',(next_xp-total)::text,
    'progress_percent',CASE WHEN next_xp IS NULL THEN 0 ELSE round((total-floor_xp)::numeric*100/(next_xp-floor_xp),2) END);
END;
$$;
REVOKE ALL ON FUNCTION public.citizen_level_state(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.citizen_level_state(uuid) TO service_role;

CREATE FUNCTION public.get_my_level_progress() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE citizen uuid;
BEGIN
  SELECT id INTO citizen FROM public.citizens WHERE auth_user_id=auth.uid();
  IF citizen IS NULL THEN RAISE EXCEPTION 'A signed-in citizen is required.' USING ERRCODE='42501'; END IF;
  RETURN public.citizen_level_state(citizen);
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_level_progress() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_level_progress() TO authenticated;

-- Not callable by a player or moderator browser. A future trusted server must
-- validate the activity and supply its stable, server-derived event ID. Amounts
-- come exclusively from configured rules, never from a request's amount field.
CREATE FUNCTION public.award_citizen_xp(p_citizen_id uuid,p_activity_key text,p_event_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE total bigint; amount bigint; before_level integer; after_level integer; entry public.citizen_xp_ledger;
BEGIN
  IF p_activity_key IS NULL OR length(btrim(p_activity_key)) NOT BETWEEN 1 AND 128
    OR p_activity_key<>btrim(p_activity_key) OR p_event_key IS NULL
    OR length(btrim(p_event_key)) NOT BETWEEN 1 AND 255 OR p_event_key<>btrim(p_event_key) THEN
    RAISE EXCEPTION 'Valid activity and event keys are required.' USING ERRCODE='22023'; END IF;
  -- Serialize grants per citizen. This prevents duplicate credits and lost
  -- increments even when different activities arrive at the same time.
  SELECT total_xp INTO total FROM public.citizen_xp WHERE citizen_id=p_citizen_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Citizen XP record not found.' USING ERRCODE='P0002'; END IF;
  SELECT * INTO entry FROM public.citizen_xp_ledger
    WHERE citizen_id=p_citizen_id AND activity_key=p_activity_key AND event_key=p_event_key;
  IF FOUND THEN RETURN jsonb_build_object('duplicate',true,'event_id',entry.id::text,
    'awarded_xp',entry.amount::text,'progress',public.citizen_level_state(p_citizen_id)); END IF;
  SELECT xp_amount INTO amount FROM public.xp_activity_rules WHERE activity_key=p_activity_key AND enabled FOR SHARE;
  IF amount IS NULL THEN RAISE EXCEPTION 'XP activity is not enabled.' USING ERRCODE='22023'; END IF;
  -- Keep a stable curve for this transaction, including the before/after ledger.
  PERFORM 1 FROM public.xp_level_config WHERE singleton FOR SHARE;
  before_level:=(public.citizen_level_state(p_citizen_id)->>'level')::integer;
  UPDATE public.citizen_xp SET total_xp=total+amount,updated_at=now() WHERE citizen_id=p_citizen_id;
  after_level:=(public.citizen_level_state(p_citizen_id)->>'level')::integer;
  INSERT INTO public.citizen_xp_ledger(citizen_id,activity_key,event_key,amount,total_xp_after,level_before,level_after)
    VALUES(p_citizen_id,p_activity_key,p_event_key,amount,total+amount,before_level,after_level) RETURNING * INTO entry;
  RETURN jsonb_build_object('duplicate',false,'event_id',entry.id::text,'awarded_xp',amount::text,
    'progress',public.citizen_level_state(p_citizen_id));
END;
$$;
REVOKE ALL ON FUNCTION public.award_citizen_xp(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.award_citizen_xp(uuid,text,text) TO service_role;

-- Integrate with the existing owner-only audit feed when installed. Deployment
-- initialization is intentionally silent; only future XP changes are journaled.
DO $$ BEGIN
  IF to_regprocedure('public.capture_world_activity()') IS NOT NULL THEN
    CREATE TRIGGER audit_world_activity AFTER UPDATE ON public.citizen_xp FOR EACH ROW
      EXECUTE FUNCTION public.capture_world_activity('citizens','Citizen XP','total_xp','');
  END IF;
END; $$;
COMMIT;
