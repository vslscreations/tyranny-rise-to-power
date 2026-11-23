BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE public.web_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  citizen_id uuid NOT NULL REFERENCES public.citizens(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX web_push_citizen ON public.web_push_subscriptions(citizen_id);
CREATE TABLE public.web_push_deliveries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subscription_id uuid NOT NULL REFERENCES public.web_push_subscriptions(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES public.game_notifications(id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  last_status integer,
  UNIQUE(subscription_id, notification_id)
);
CREATE INDEX web_push_pending ON public.web_push_deliveries(available_at) WHERE delivered_at IS NULL;
ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_push_subscriptions, public.web_push_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.web_push_subscriptions, public.web_push_deliveries TO service_role;
GRANT USAGE ON SEQUENCE public.web_push_deliveries_id_seq TO service_role;

CREATE FUNCTION public.register_web_push(p_citizen uuid, p_endpoint text, p_p256dh text, p_auth text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  -- Replace the device binding atomically, discarding deliveries for a former account.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_endpoint, 0));
  DELETE FROM public.web_push_subscriptions WHERE endpoint=p_endpoint AND citizen_id<>p_citizen;
  IF (SELECT count(*) FROM public.web_push_subscriptions WHERE citizen_id=p_citizen) >= 10
     AND NOT EXISTS (SELECT 1 FROM public.web_push_subscriptions WHERE endpoint=p_endpoint) THEN
    RAISE EXCEPTION 'Device limit reached. Disable notifications on an older device first.';
  END IF;
  INSERT INTO public.web_push_subscriptions(citizen_id,endpoint,p256dh,auth)
  VALUES(p_citizen,p_endpoint,p_p256dh,p_auth)
  ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth;
END;
$$;

CREATE FUNCTION public.queue_web_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.web_push_deliveries(subscription_id,notification_id)
  SELECT s.id,NEW.id FROM public.web_push_subscriptions s
  JOIN public.citizens c ON c.id=s.citizen_id
  WHERE s.citizen_id=NEW.recipient_id OR
    (NEW.recipient_id IS NULL AND NEW.category='world' AND NEW.created_at>=c.registration_date);
  RETURN NEW;
END;
$$;
CREATE TRIGGER queue_phone_notification AFTER INSERT ON public.game_notifications
FOR EACH ROW EXECUTE FUNCTION public.queue_web_push();

CREATE FUNCTION public.claim_web_push() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  WITH picked AS (
    SELECT d.id FROM public.web_push_deliveries d
    JOIN public.game_notifications n ON n.id=d.notification_id
    JOIN public.web_push_subscriptions s ON s.id=d.subscription_id
    WHERE d.delivered_at IS NULL AND d.attempts<6 AND d.available_at<=now()
      AND n.created_at>now()-interval '24 hours'
      AND NOT EXISTS (SELECT 1 FROM public.game_notification_reads r
        WHERE r.notification_id=n.id AND r.citizen_id=s.citizen_id)
    ORDER BY d.id LIMIT 40 FOR UPDATE OF d SKIP LOCKED
  ), claimed AS (
    UPDATE public.web_push_deliveries d SET attempts=attempts+1,available_at=now()+interval '5 minutes'
    FROM picked WHERE d.id=picked.id RETURNING d.*
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'notification_id',d.notification_id,'subscription_id',s.id,
    'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth)), '[]'::jsonb)
  INTO result FROM claimed d JOIN public.web_push_subscriptions s ON s.id=d.subscription_id;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.register_web_push(uuid,text,text,text), public.queue_web_push(), public.claim_web_push() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_web_push(uuid,text,text,text), public.claim_web_push() TO service_role;

-- Secret and URL are provisioned separately in Vault, never in source control.
CREATE FUNCTION public.dispatch_web_push() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE worker_secret text; worker_url text;
BEGIN
  DELETE FROM public.web_push_deliveries d USING public.game_notifications n
    WHERE d.notification_id=n.id AND n.created_at<now()-interval '2 days';
  IF NOT EXISTS(SELECT 1 FROM public.web_push_deliveries
    WHERE delivered_at IS NULL AND attempts<6 AND available_at<=now()) THEN RETURN; END IF;
  SELECT decrypted_secret INTO worker_secret FROM vault.decrypted_secrets WHERE name='tyranny_push_worker_secret';
  SELECT decrypted_secret INTO worker_url FROM vault.decrypted_secrets WHERE name='tyranny_push_worker_url';
  IF worker_secret IS NULL OR worker_url IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url:=worker_url,
    headers:=jsonb_build_object('Content-Type','application/json','x-push-worker-secret',worker_secret),
    body:='{}'::jsonb, timeout_milliseconds:=55000);
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_web_push() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('tyranny-web-push','* * * * *','SELECT public.dispatch_web_push()');
COMMIT;
