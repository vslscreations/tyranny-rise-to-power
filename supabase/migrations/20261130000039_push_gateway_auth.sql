BEGIN;
CREATE OR REPLACE FUNCTION public.dispatch_web_push() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE worker_secret text; worker_url text; gateway_token text;
BEGIN
  DELETE FROM public.web_push_deliveries d USING public.game_notifications n
    WHERE d.notification_id=n.id AND n.created_at<now()-interval '2 days';
  IF NOT EXISTS(SELECT 1 FROM public.web_push_deliveries
    WHERE delivered_at IS NULL AND attempts<6 AND available_at<=now()) THEN RETURN; END IF;
  SELECT decrypted_secret INTO worker_secret FROM vault.decrypted_secrets WHERE name='tyranny_push_worker_secret';
  SELECT decrypted_secret INTO worker_url FROM vault.decrypted_secrets WHERE name='tyranny_push_worker_url';
  SELECT decrypted_secret INTO gateway_token FROM vault.decrypted_secrets WHERE name='tyranny_push_gateway_token';
  IF worker_secret IS NULL OR worker_url IS NULL OR gateway_token IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url:=worker_url,
    headers:=jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer '||gateway_token,'x-push-worker-secret',worker_secret),
    body:='{}'::jsonb, timeout_milliseconds:=55000);
END;
$$;
COMMIT;
