BEGIN;
CREATE TABLE public.creator_notification_recipients (
  citizen_id uuid PRIMARY KEY REFERENCES public.citizens(id) ON DELETE CASCADE
);
CREATE TABLE public.creator_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.citizens(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('citizen', 'submission')),
  source_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE (recipient_id, kind, source_id)
);
CREATE INDEX creator_notifications_inbox ON public.creator_notifications(recipient_id, created_at DESC, id DESC);
CREATE INDEX creator_notifications_unread ON public.creator_notifications(recipient_id) WHERE read_at IS NULL;
ALTER TABLE public.creator_notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creator_notification_recipients, public.creator_notifications FROM PUBLIC, anon, authenticated;

-- Enroll only the requested, already-authorized owner; do not grant ownership.
DO $$
BEGIN
  INSERT INTO public.creator_notification_recipients(citizen_id)
    SELECT c.id FROM auth.users u JOIN public.citizens c ON c.auth_user_id=u.id
    JOIN public.moneytree_owners o ON o.citizen_id=c.id
    WHERE lower(u.email)='vslsphoto@gmail.com';
  IF (SELECT count(*) FROM public.creator_notification_recipients) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one existing owner for creator notifications';
  END IF;
END;
$$;

CREATE FUNCTION public.current_creator_notification_recipient() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.id FROM public.citizens c
  JOIN public.creator_notification_recipients r ON r.citizen_id=c.id
  JOIN public.moneytree_owners o ON o.citizen_id=c.id
  WHERE c.auth_user_id=auth.uid();
$$;
REVOKE ALL ON FUNCTION public.current_creator_notification_recipient() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_creator_notification_status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('enabled', c.id IS NOT NULL, 'unread_count',
    (SELECT count(*) FROM public.creator_notifications n WHERE n.recipient_id=c.id AND n.read_at IS NULL))
  FROM (SELECT public.current_creator_notification_recipient() AS id) c;
$$;

CREATE FUNCTION public.get_creator_notifications(p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE recipient uuid := public.current_creator_notification_recipient(); result jsonb;
BEGIN
  IF recipient IS NULL THEN RAISE EXCEPTION 'Creator access required.' USING ERRCODE='42501'; END IF;
  IF p_offset IS NULL OR p_offset<0 OR p_offset>100000 THEN RAISE EXCEPTION 'Invalid offset'; END IF;
  WITH page AS (
    SELECT id,kind,source_id,title,body,created_at,read_at FROM public.creator_notifications
    WHERE recipient_id=recipient ORDER BY created_at DESC,id DESC LIMIT 41 OFFSET p_offset
  )
  SELECT jsonb_build_object('server_time',now(),
    'items',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY created_at DESC,id DESC)
      FROM (SELECT * FROM page ORDER BY created_at DESC,id DESC LIMIT 40) p),'[]'::jsonb),
    'has_more',(SELECT count(*)>40 FROM page),
    'unread_count',(SELECT count(*) FROM public.creator_notifications WHERE recipient_id=recipient AND read_at IS NULL)) INTO result;
  RETURN result;
END;
$$;

CREATE FUNCTION public.read_creator_notifications(p_id uuid DEFAULT NULL, p_before timestamptz DEFAULT now()) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE recipient uuid := public.current_creator_notification_recipient();
BEGIN
  IF recipient IS NULL THEN RAISE EXCEPTION 'Creator access required.' USING ERRCODE='42501'; END IF;
  UPDATE public.creator_notifications SET read_at=now()
    WHERE recipient_id=recipient AND read_at IS NULL AND (p_id IS NULL OR id=p_id)
      AND created_at<=least(coalesce(p_before,now()),now());
END;
$$;
REVOKE ALL ON FUNCTION public.get_creator_notification_status(), public.get_creator_notifications(integer), public.read_creator_notifications(uuid,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_creator_notification_status(), public.get_creator_notifications(integer), public.read_creator_notifications(uuid,timestamptz) TO authenticated;

CREATE FUNCTION public.capture_creator_notification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE recipient record; kind text; title text; body text; citizen_name text; discussion_title text; inserted_id uuid;
BEGIN
  IF TG_TABLE_NAME='citizens' THEN
    kind := 'citizen'; title := 'New citizen joined';
    body := coalesce(NEW.public_name,'A new citizen') || ' created a citizen profile.';
  ELSIF TG_TABLE_NAME='moneytree_contributions' THEN
    kind := 'submission'; title := 'New MoneyTree submission';
    SELECT c.public_name INTO citizen_name FROM public.citizens c WHERE c.id=NEW.citizen_id;
    SELECT d.title INTO discussion_title FROM public.moneytree_discussions d WHERE d.id=NEW.discussion_id;
    body := coalesce(citizen_name,'A citizen') || ' submitted a ' ||
      CASE NEW.contribution_type WHEN 'challenge' THEN 'challenge' WHEN 'reply' THEN 'reply'
        WHEN 'open_discussion' THEN 'post' ELSE 'response' END ||
      ' to “' || coalesce(discussion_title,'MoneyTree') || '”.';
  ELSE RETURN NEW;
  END IF;
  FOR recipient IN SELECT c.id,c.auth_user_id FROM public.creator_notification_recipients r
    JOIN public.citizens c ON c.id=r.citizen_id JOIN public.moneytree_owners o ON o.citizen_id=c.id
  LOOP
    INSERT INTO public.creator_notifications(recipient_id,kind,source_id,title,body)
      VALUES(recipient.id,kind,NEW.id,title,body) ON CONFLICT DO NOTHING RETURNING id INTO inserted_id;
    IF inserted_id IS NOT NULL AND recipient.auth_user_id IS NOT NULL THEN
      -- Reuse the recipient's existing private channel; no additional connection.
      PERFORM realtime.send('{}'::jsonb,'creator_notification','citizen-balance:'||recipient.auth_user_id::text,true);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_creator_notification() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER notify_creator_citizen AFTER INSERT ON public.citizens
  FOR EACH ROW EXECUTE FUNCTION public.capture_creator_notification();
CREATE TRIGGER notify_creator_submission AFTER INSERT ON public.moneytree_contributions
  FOR EACH ROW EXECUTE FUNCTION public.capture_creator_notification();
COMMIT;
