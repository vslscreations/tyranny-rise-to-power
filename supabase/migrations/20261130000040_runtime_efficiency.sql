BEGIN;

-- Match the moderation queue's existing membership check without fetching it.
CREATE FUNCTION public.can_access_moderator_app() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.moneytree_moderators m
    JOIN public.citizens c ON c.id = m.citizen_id
    WHERE c.auth_user_id = auth.uid()
  );
$$;

-- Closed inboxes need only a count, not notification bodies or a history page.
CREATE FUNCTION public.get_game_notification_unread_count() RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE citizen uuid; registered timestamptz; result bigint;
BEGIN
  SELECT c.id, c.registration_date INTO citizen, registered
    FROM public.citizens c WHERE c.auth_user_id = auth.uid();
  IF citizen IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501'; END IF;
  SELECT count(*) INTO result FROM public.game_notifications n
    WHERE (n.recipient_id = citizen OR
      (n.recipient_id IS NULL AND n.created_at >= coalesce(registered, '-infinity'::timestamptz)))
    AND NOT EXISTS (SELECT 1 FROM public.game_notification_reads r
      WHERE r.citizen_id = citizen AND r.notification_id = n.id);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.can_access_moderator_app(), public.get_game_notification_unread_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_moderator_app(), public.get_game_notification_unread_count() TO authenticated;

-- Use the same eligibility as claim_web_push so read/expired deliveries do not
-- cause an empty Edge Function invocation every minute.
CREATE OR REPLACE FUNCTION public.dispatch_web_push() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE worker_secret text; worker_url text; gateway_token text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.web_push_deliveries d
    JOIN public.game_notifications n ON n.id = d.notification_id
    JOIN public.web_push_subscriptions s ON s.id = d.subscription_id
    WHERE d.delivered_at IS NULL AND d.attempts < 6 AND d.available_at <= now()
      AND n.created_at > now() - interval '24 hours'
      AND NOT EXISTS (SELECT 1 FROM public.game_notification_reads r
        WHERE r.notification_id = n.id AND r.citizen_id = s.citizen_id)
  ) THEN RETURN; END IF;
  SELECT decrypted_secret INTO worker_secret FROM vault.decrypted_secrets WHERE name = 'tyranny_push_worker_secret';
  SELECT decrypted_secret INTO worker_url FROM vault.decrypted_secrets WHERE name = 'tyranny_push_worker_url';
  SELECT decrypted_secret INTO gateway_token FROM vault.decrypted_secrets WHERE name = 'tyranny_push_gateway_token';
  IF worker_secret IS NULL OR worker_url IS NULL OR gateway_token IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url := worker_url,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || gateway_token, 'x-push-worker-secret', worker_secret),
    body := '{}'::jsonb, timeout_milliseconds := 55000);
END;
$$;

-- Retain the two-day delivery cleanup, but run it hourly rather than every minute.
SELECT cron.schedule('tyranny-web-push-cleanup', '17 * * * *',
  $job$DELETE FROM public.web_push_deliveries d USING public.game_notifications n
    WHERE d.notification_id = n.id AND n.created_at < now() - interval '2 days'$job$);
COMMIT;
