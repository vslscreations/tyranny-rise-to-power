BEGIN;
-- Approved balancing: one XP per completed activity, 100 XP per level,
-- and one $100 payment for every newly reached level (starting at Level 2).
ALTER TABLE public.xp_level_config ADD COLUMN xp_per_level bigint CHECK(xp_per_level>0);
GRANT UPDATE(xp_per_level) ON public.xp_level_config TO service_role;
UPDATE public.xp_level_config SET xp_per_level=100 WHERE singleton;
INSERT INTO public.xp_level_milestones(milestone_key,required_level,kind,enabled,definition)
  VALUES('level_up_cash',2,'reward',true,'{"amount":100,"repeat":"each_level"}');
INSERT INTO public.xp_activity_rules(activity_key,xp_amount,enabled) VALUES
  ('moneytree_approved',1,true),('social_post',1,true),('social_comment',1,true),
  ('social_reaction',1,true),('social_follow',1,true),('citizen_associate',1,true),
  ('private_message',1,true),('public_chat_message',1,true),('poll_vote',1,true),
  ('store_purchase',1,true),('daily_claim',1,true),('casino_round',1,true);

CREATE TABLE public.citizen_level_rewards (
  citizen_id uuid NOT NULL REFERENCES public.citizens(id) ON DELETE CASCADE,
  level integer NOT NULL CHECK(level>=2),
  amount numeric(12,2) NOT NULL CHECK(amount>0),
  xp_event_id bigint NOT NULL REFERENCES public.citizen_xp_ledger(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(citizen_id,level)
);
ALTER TABLE public.citizen_level_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.citizen_level_rewards FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.citizen_level_rewards TO service_role;

CREATE OR REPLACE FUNCTION public.citizen_level_state(p_citizen_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE total bigint; curve bigint[]; step bigint; current_level integer; floor_xp bigint; next_xp bigint; reward text;
BEGIN
  SELECT total_xp INTO total FROM public.citizen_xp WHERE citizen_id=p_citizen_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Citizen XP record not found.' USING ERRCODE='P0002'; END IF;
  SELECT thresholds,xp_per_level INTO curve,step FROM public.xp_level_config WHERE singleton;
  IF curve IS NULL THEN RAISE EXCEPTION 'Level configuration unavailable.'; END IF;
  IF step IS NOT NULL THEN
    current_level:=(total/step+1)::integer;
    floor_xp:=(current_level::bigint-1)*step;next_xp:=current_level::bigint*step;
  ELSE
    SELECT max(n)::integer INTO current_level FROM unnest(curve) WITH ORDINALITY t(xp,n) WHERE xp<=total;
    floor_xp:=curve[current_level];next_xp:=curve[current_level+1];
  END IF;
  SELECT definition->>'amount' INTO reward FROM public.xp_level_milestones
    WHERE milestone_key='level_up_cash' AND enabled AND kind='reward' AND required_level<=current_level+1
      AND NOT EXISTS(SELECT 1 FROM public.citizen_level_rewards WHERE citizen_id=p_citizen_id AND level=current_level+1);
  RETURN jsonb_build_object('citizen_id',p_citizen_id,'level',current_level,'total_xp',total::text,'next_level_reward_amount',reward,
    'level_start_xp',floor_xp::text,'xp_into_level',(total-floor_xp)::text,
    'next_level',CASE WHEN next_xp IS NULL THEN NULL ELSE current_level+1 END,
    'next_level_xp',next_xp::text,'xp_for_next_level',(next_xp-floor_xp)::text,
    'xp_remaining',(next_xp-total)::text,
    'progress_percent',CASE WHEN next_xp IS NULL THEN 0 ELSE round((total-floor_xp)::numeric*100/(next_xp-floor_xp),2) END);
END; $$;

-- Preserve the existing money/education protections and add one scoped server
-- authorization flag. Browser roles cannot run a SECURITY DEFINER credit path.
CREATE OR REPLACE FUNCTION public.prevent_protected_citizen_changes() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME='citizens' THEN
    IF NEW.citizen_id IS DISTINCT FROM OLD.citizen_id THEN RAISE EXCEPTION 'Citizen ID cannot be changed.'; END IF;
    IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN RAISE EXCEPTION 'Auth user link cannot be changed.'; END IF;
    IF NEW.registration_date IS DISTINCT FROM OLD.registration_date THEN RAISE EXCEPTION 'Registration date cannot be changed.'; END IF;
  END IF;
  IF TG_TABLE_NAME='citizen_private' THEN
    IF NEW.balance IS DISTINCT FROM OLD.balance AND NOT (
      current_user='postgres' AND (
        current_setting('app.moneytree_reward_credit',true)='on' OR
        current_setting('app.store_purchase_authorized',true)='on' OR
        current_setting('app.owner_balance_adjustment',true)='on' OR
        current_setting('app.level_reward_credit',true)='on'
      )
    ) THEN RAISE EXCEPTION 'Balance cannot be changed by browser clients.'; END IF;
    IF NEW.profession IS DISTINCT FROM OLD.profession THEN RAISE EXCEPTION 'Profession cannot be changed by browser clients.'; END IF;
    IF NEW.social_class IS DISTINCT FROM OLD.social_class THEN RAISE EXCEPTION 'Social class cannot be changed by browser clients.'; END IF;
    IF NEW.education IS DISTINCT FROM OLD.education AND NOT (current_user='postgres' AND current_setting('app.store_purchase_authorized',true)='on') THEN
      RAISE EXCEPTION 'Education cannot be changed by browser clients.'; END IF;
    IF NEW.account_status IS DISTINCT FROM OLD.account_status THEN RAISE EXCEPTION 'Account status cannot be changed by browser clients.'; END IF;
    IF NEW.privileges IS DISTINCT FROM OLD.privileges THEN RAISE EXCEPTION 'Privileges cannot be changed by browser clients.'; END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.prevent_protected_citizen_changes() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.award_citizen_xp(p_citizen_id uuid,p_activity_key text,p_event_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE total bigint; amount bigint; before_level integer; after_level integer; entry public.citizen_xp_ledger;
BEGIN
  IF p_activity_key IS NULL OR length(btrim(p_activity_key)) NOT BETWEEN 1 AND 128
    OR p_activity_key<>btrim(p_activity_key) OR p_event_key IS NULL
    OR length(btrim(p_event_key)) NOT BETWEEN 1 AND 255 OR p_event_key<>btrim(p_event_key) THEN
    RAISE EXCEPTION 'Valid activity and event keys are required.' USING ERRCODE='22023'; END IF;
  -- Use the same wallet-before-XP lock order as Store, casino and daily claims.
  PERFORM 1 FROM public.citizen_private WHERE citizen_id=p_citizen_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Citizen account not found.' USING ERRCODE='P0002'; END IF;
  SELECT total_xp INTO total FROM public.citizen_xp WHERE citizen_id=p_citizen_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Citizen XP record not found.' USING ERRCODE='P0002'; END IF;
  SELECT * INTO entry FROM public.citizen_xp_ledger
    WHERE citizen_id=p_citizen_id AND activity_key=p_activity_key AND event_key=p_event_key;
  IF FOUND THEN RETURN jsonb_build_object('duplicate',true,'event_id',entry.id::text,
    'awarded_xp',entry.amount::text,'progress',public.citizen_level_state(p_citizen_id)); END IF;
  SELECT xp_amount INTO amount FROM public.xp_activity_rules WHERE activity_key=p_activity_key AND enabled FOR SHARE;
  IF amount IS NULL THEN RAISE EXCEPTION 'XP activity is not enabled.' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.xp_level_config WHERE singleton FOR SHARE;
  before_level:=(public.citizen_level_state(p_citizen_id)->>'level')::integer;
  UPDATE public.citizen_xp SET total_xp=total+amount,updated_at=now() WHERE citizen_id=p_citizen_id;
  after_level:=(public.citizen_level_state(p_citizen_id)->>'level')::integer;
  INSERT INTO public.citizen_xp_ledger(citizen_id,activity_key,event_key,amount,total_xp_after,level_before,level_after)
    VALUES(p_citizen_id,p_activity_key,p_event_key,amount,total+amount,before_level,after_level) RETURNING * INTO entry;
  RETURN jsonb_build_object('duplicate',false,'event_id',entry.id::text,'awarded_xp',amount::text,
    'progress',public.citizen_level_state(p_citizen_id));
END; $$;

CREATE FUNCTION public.finish_citizen_xp_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE reward numeric(12,2); first_level integer; paid numeric; paid_levels integer;
  user_id uuid; previous_flag text;
BEGIN
  -- Account deletion in this transaction must not recreate rewards or signals.
  IF NOT EXISTS(SELECT 1 FROM public.citizen_xp_ledger WHERE id=NEW.id) THEN RETURN NEW; END IF;
  paid:=0;paid_levels:=0;
  IF NEW.level_after>NEW.level_before THEN
    SELECT (definition->>'amount')::numeric,required_level INTO reward,first_level
      FROM public.xp_level_milestones WHERE milestone_key='level_up_cash' AND enabled AND kind='reward' FOR SHARE;
    IF FOUND THEN
      IF reward IS NULL OR reward<=0 THEN RAISE EXCEPTION 'Invalid level reward configuration.'; END IF;
      WITH granted AS (
        INSERT INTO public.citizen_level_rewards(citizen_id,level,amount,xp_event_id)
        SELECT NEW.citizen_id,n,reward,NEW.id FROM generate_series(greatest(2,first_level,NEW.level_before+1),NEW.level_after) n
        ON CONFLICT(citizen_id,level) DO NOTHING RETURNING amount
      ) SELECT coalesce(sum(amount),0),count(*) INTO paid,paid_levels FROM granted;
      IF paid>0 THEN
        previous_flag:=current_setting('app.level_reward_credit',true);
        PERFORM set_config('app.level_reward_credit','on',true);
        UPDATE public.citizen_private SET balance=balance+paid WHERE citizen_id=NEW.citizen_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Citizen account not found.'; END IF;
        PERFORM set_config('app.level_reward_credit',coalesce(previous_flag,'off'),true);
        PERFORM public.emit_game_notification(NEW.citizen_id,'account','Level up: Level '||NEW.level_after,
          'You received $'||to_char(paid,'FM999999999990.00')||' for reaching '||paid_levels||
          CASE WHEN paid_levels=1 THEN ' new level.' ELSE ' new levels.' END,
          'mylife',NULL,'level-reward:'||NEW.id);
      END IF;
    END IF;
  END IF;
  SELECT auth_user_id INTO user_id FROM public.citizens WHERE id=NEW.citizen_id;
  IF user_id IS NOT NULL THEN
    PERFORM realtime.send(jsonb_build_object('balance_changed',paid>0),'xp_changed','citizen-balance:'||user_id::text,true);
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.finish_citizen_xp_event() FROM PUBLIC,anon,authenticated,service_role;
-- Pay after the source transaction has settled its wallet. Never overwrite a
-- purchase/casino result with a balance calculated before its level-up reward.
CREATE CONSTRAINT TRIGGER finish_citizen_xp_event AFTER INSERT ON public.citizen_xp_ledger
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.finish_citizen_xp_event();

CREATE FUNCTION public.capture_activity_xp() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE citizen uuid; activity text:=TG_ARGV[0]; event_key text; row_data jsonb:=to_jsonb(NEW);
BEGIN
  citizen:=(row_data->>TG_ARGV[1])::uuid;event_key:=row_data->>'id';
  IF TG_TABLE_NAME='moneytree_contributions' THEN
    IF NEW.moderation_state<>'approved' THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND OLD.moderation_state='approved' THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME IN ('social_posts','social_comments','social_chat_messages') THEN
    IF row_data->>'deleted_at' IS NOT NULL THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME='social_post_reactions' THEN event_key:=(row_data->>'post_id')||':'||(row_data->>'reaction_type');
  ELSIF TG_TABLE_NAME='social_follows' THEN event_key:=row_data->>'following_citizen_id';
  ELSIF TG_TABLE_NAME='citizen_relationships' THEN event_key:=row_data->>'target_citizen_id';
  ELSIF TG_TABLE_NAME='poll_votes' THEN event_key:=row_data->>'poll_id';
  ELSIF TG_TABLE_NAME='store_purchases' THEN
    IF NEW.status<>'completed' THEN RETURN NEW; END IF;
    event_key:=NEW.idempotency_key;
  ELSIF TG_TABLE_NAME='lucky7_transaction_history' THEN
    IF NEW.status<>'posted' THEN RETURN NEW; END IF;
    event_key:=NEW.idempotency_key;
  ELSIF TG_TABLE_NAME='moneytree_clock_in_claims' THEN event_key:=extract(epoch FROM NEW.window_start)::bigint::text;
  END IF;
  -- Disabled rules pause earning without breaking the underlying game action.
  PERFORM 1 FROM public.xp_activity_rules WHERE activity_key=activity AND enabled FOR SHARE;
  IF FOUND THEN PERFORM public.award_citizen_xp(citizen,activity,event_key); END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.capture_activity_xp() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_award_activity_xp AFTER INSERT OR UPDATE OF moderation_state ON public.moneytree_contributions
  FOR EACH ROW EXECUTE FUNCTION public.capture_activity_xp('moneytree_approved','citizen_id');
CREATE TRIGGER zz_award_activity_xp AFTER INSERT ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.capture_activity_xp('social_post','citizen_id');
CREATE TRIGGER zz_award_activity_xp AFTER INSERT ON public.social_comments
  FOR EACH ROW EXECUTE FUNCTION public.capture_activity_xp('social_comment','citizen_id');
CREATE TRIGGER zz_award_activity_xp AFTER INSERT ON public.social_post_reactions
  FOR EACH ROW EXECUTE FUNCTION public.capture_activity_xp('social_reaction','citizen_id');
CREATE TRIGGER zz_award_activity_xp AFTER INSERT ON public.social_follows
  FOR EACH ROW EXECUTE FUNCTION public.capture_activity_xp('social_follow','follower_citizen_id');
CREATE TRIGGER zz_award_activity_xp AFTER INSERT ON public.citizen_relationships
  FOR EACH ROW EXECUTE FUNCTION public.capture_activity_xp('citizen_associate','owner_citizen_id');
CREATE TRIGGER zz_award_activity_xp AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.capture_activity_xp('private_message','sender_citizen_id');
CREATE TRIGGER zz_award_activity_xp AFTER INSERT ON public.social_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.capture_activity_xp('public_chat_message','citizen_id');
CREATE TRIGGER zz_award_activity_xp AFTER INSERT ON public.poll_votes
  FOR EACH ROW EXECUTE FUNCTION public.capture_activity_xp('poll_vote','citizen_id');
CREATE TRIGGER zz_award_activity_xp AFTER INSERT ON public.store_purchases
  FOR EACH ROW EXECUTE FUNCTION public.capture_activity_xp('store_purchase','citizen_id');
CREATE TRIGGER zz_award_activity_xp AFTER INSERT ON public.moneytree_clock_in_claims
  FOR EACH ROW EXECUTE FUNCTION public.capture_activity_xp('daily_claim','citizen_id');
CREATE TRIGGER zz_award_activity_xp AFTER INSERT ON public.lucky7_transaction_history
  FOR EACH ROW EXECUTE FUNCTION public.capture_activity_xp('casino_round','citizen_id');
CREATE TRIGGER audit_world_activity AFTER INSERT ON public.citizen_level_rewards
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('economy','Level-up reward','level,amount','');
COMMIT;
