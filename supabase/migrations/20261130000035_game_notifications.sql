BEGIN;

CREATE TABLE public.game_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid REFERENCES public.citizens(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('moneytree','social','messages','account','world')),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  target text NOT NULL,
  target_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX game_notifications_recipient_time ON public.game_notifications(recipient_id, created_at DESC, id DESC);
CREATE TABLE public.game_notification_reads (
  citizen_id uuid NOT NULL REFERENCES public.citizens(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES public.game_notifications(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(citizen_id, notification_id)
);
ALTER TABLE public.game_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_notification_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.game_notifications, public.game_notification_reads FROM PUBLIC, anon, authenticated;

-- Used only by server triggers. NULL recipient represents one shared world event.
CREATE FUNCTION public.emit_game_notification(
  p_recipient uuid, p_category text, p_title text, p_body text,
  p_target text, p_target_id uuid, p_event text,
  p_actor uuid DEFAULT NULL, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF p_recipient IS NULL AND p_category <> 'world' THEN RETURN; END IF;
  IF p_recipient IS NOT NULL AND p_recipient = p_actor THEN RETURN; END IF;
  INSERT INTO public.game_notifications(recipient_id, category, title, body, target, target_id, payload, event_key)
  VALUES(p_recipient, p_category, p_title, p_body, p_target, p_target_id, p_payload,
         p_event || ':' || coalesce(p_recipient::text, 'world'))
  ON CONFLICT(event_key) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.emit_game_notification(uuid,text,text,text,text,uuid,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_game_notifications(p_offset integer DEFAULT 0, p_unread_only boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_citizen uuid; v_registered timestamptz; v_result jsonb;
BEGIN
  SELECT c.id, c.registration_date INTO v_citizen, v_registered
  FROM public.citizens c WHERE c.auth_user_id = auth.uid();
  IF v_citizen IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501'; END IF;
  IF p_offset IS NULL OR p_offset < 0 OR p_offset > 100000 THEN RAISE EXCEPTION 'Invalid offset.'; END IF;
  WITH visible AS (
    SELECT n.*, r.read_at
    FROM public.game_notifications n
    LEFT JOIN public.game_notification_reads r ON r.notification_id=n.id AND r.citizen_id=v_citizen
    WHERE n.recipient_id=v_citizen OR (n.recipient_id IS NULL AND n.created_at >= coalesce(v_registered, '-infinity'::timestamptz))
  ), page AS (
    SELECT * FROM visible WHERE NOT p_unread_only OR read_at IS NULL
    ORDER BY created_at DESC, id DESC LIMIT 41 OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'server_time', now(),
    'items', coalesce((SELECT jsonb_agg(to_jsonb(p) - 'recipient_id' - 'event_key' ORDER BY created_at DESC, id DESC)
      FROM (SELECT * FROM page ORDER BY created_at DESC, id DESC LIMIT 40) p),'[]'::jsonb),
    'has_more', (SELECT count(*) > 40 FROM page),
    'unread_count', (SELECT count(*) FROM visible WHERE read_at IS NULL)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.read_game_notifications(p_id uuid DEFAULT NULL, p_before timestamptz DEFAULT now())
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_citizen uuid; v_registered timestamptz;
BEGIN
  SELECT c.id, c.registration_date INTO v_citizen, v_registered
  FROM public.citizens c WHERE c.auth_user_id=auth.uid();
  IF v_citizen IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.game_notification_reads(citizen_id, notification_id)
  SELECT v_citizen,n.id FROM public.game_notifications n
  WHERE (n.recipient_id=v_citizen OR (n.recipient_id IS NULL AND n.created_at>=coalesce(v_registered,'-infinity'::timestamptz)))
    AND (p_id IS NULL OR n.id=p_id) AND n.created_at<=least(coalesce(p_before, now()),now())
  ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.get_game_notifications(integer,boolean), public.read_game_notifications(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_game_notifications(integer,boolean), public.read_game_notifications(uuid,timestamptz) TO authenticated;

CREATE FUNCTION public.capture_game_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_recipient uuid; v_actor uuid; v_name text; v_post uuid; v_person record; v_text text;
BEGIN
  -- One trigger family serves only the explicitly listed event tables below.
  IF TG_TABLE_NAME = 'moneytree_contributions' THEN
    IF TG_OP='INSERT' AND NEW.parent_contribution_id IS NOT NULL THEN
      SELECT c.citizen_id INTO v_recipient FROM public.moneytree_contributions c WHERE c.id=NEW.parent_contribution_id;
      SELECT c.public_name INTO v_name FROM public.citizens c WHERE c.id=NEW.citizen_id;
      PERFORM public.emit_game_notification(v_recipient,'moneytree',
        CASE WHEN NEW.contribution_type='challenge' THEN 'Your contribution was challenged' ELSE 'New MoneyTree reply' END,
        coalesce(v_name,'A citizen') || ' responded to your contribution.','moneytree',NEW.discussion_id,
        'moneytree-response:'||NEW.id,NEW.citizen_id,jsonb_build_object('contribution_id',NEW.id));
    ELSIF TG_OP='UPDATE' AND NEW.moderation_state IS DISTINCT FROM OLD.moderation_state AND NEW.moderation_state IN ('approved','rejected') THEN
      PERFORM public.emit_game_notification(NEW.citizen_id,'moneytree','Contribution '||NEW.moderation_state,
        CASE WHEN NEW.moderation_state='rejected' THEN coalesce(NEW.moderation_reason,'Your contribution was rejected.')
             ELSE 'Your MoneyTree contribution was approved.' END,
        'moneytree',NEW.discussion_id,'moneytree-review:'||NEW.id||':'||NEW.moderation_state,NULL,
        jsonb_build_object('contribution_id',NEW.id));
    END IF;
  ELSIF TG_TABLE_NAME='social_comments' THEN
    IF TG_OP='INSERT' THEN
      SELECT p.citizen_id INTO v_recipient FROM public.social_posts p WHERE p.id=NEW.post_id AND p.deleted_at IS NULL;
      SELECT c.public_name INTO v_name FROM public.citizens c WHERE c.id=NEW.citizen_id;
      IF v_recipient IS NOT NULL THEN
        PERFORM public.emit_game_notification(v_recipient,'social','New comment',coalesce(v_name,'A citizen')||' commented on your post.',
          'social',NEW.post_id,'social_comments:'||NEW.id,NEW.citizen_id);
      END IF;
      SELECT c.citizen_id INTO v_recipient FROM public.social_comments c WHERE c.id=NEW.parent_comment_id AND c.deleted_at IS NULL;
      IF v_recipient IS NOT NULL THEN
        PERFORM public.emit_game_notification(v_recipient,'social','New reply',coalesce(v_name,'A citizen')||' replied to your comment.',
          'social',NEW.post_id,'social_comments:'||NEW.id,NEW.citizen_id);
      END IF;
    ELSIF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      SELECT c.id INTO v_actor FROM public.citizens c WHERE c.auth_user_id=auth.uid();
      PERFORM public.emit_game_notification(NEW.citizen_id,'social','Comment removed','Your comment was removed.',
        'social',NEW.post_id,'comment-removed:'||NEW.id,v_actor);
    END IF;
  ELSIF TG_TABLE_NAME='social_post_reactions' THEN
    SELECT p.citizen_id INTO v_recipient FROM public.social_posts p WHERE p.id=NEW.post_id AND p.deleted_at IS NULL;
    SELECT c.public_name INTO v_name FROM public.citizens c WHERE c.id=NEW.citizen_id;
    IF v_recipient IS NOT NULL THEN
      PERFORM public.emit_game_notification(v_recipient,'social',
        CASE WHEN NEW.reaction_type='like' THEN 'New like' ELSE 'Your post was reposted' END,
        coalesce(v_name,'A citizen')||CASE WHEN NEW.reaction_type='like' THEN ' liked your post.' ELSE ' reposted your post.' END,
        'social',NEW.post_id,'reaction:'||NEW.id,NEW.citizen_id);
    END IF;
  ELSIF TG_TABLE_NAME='social_follows' THEN
    SELECT c.public_name INTO v_name FROM public.citizens c WHERE c.id=NEW.follower_citizen_id;
    PERFORM public.emit_game_notification(NEW.following_citizen_id,'social','New follower',coalesce(v_name,'A citizen')||' followed you.',
      'profile',NEW.follower_citizen_id,'follow:'||NEW.id,NEW.follower_citizen_id);
  ELSIF TG_TABLE_NAME='social_posts' THEN
    IF TG_OP='INSERT' THEN
      SELECT c.public_name INTO v_name FROM public.citizens c WHERE c.id=NEW.citizen_id;
      FOR v_person IN SELECT f.follower_citizen_id AS id FROM public.social_follows f WHERE f.following_citizen_id=NEW.citizen_id LOOP
        PERFORM public.emit_game_notification(v_person.id,'social','New post',coalesce(v_name,'A citizen')||' posted on FakeBook.',
          'social',NEW.id,'social_posts:'||NEW.id,NEW.citizen_id);
      END LOOP;
    ELSIF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      SELECT c.id INTO v_actor FROM public.citizens c WHERE c.auth_user_id=auth.uid();
      PERFORM public.emit_game_notification(NEW.citizen_id,'social','Post removed','Your post was removed.',
        'social',NEW.id,'post-removed:'||NEW.id,v_actor);
    END IF;
  ELSIF TG_TABLE_NAME='social_reports' THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status<>'pending' THEN
      PERFORM public.emit_game_notification(NEW.reporter_citizen_id,'social','Report updated',
        'Your report has been '||NEW.status||'.','social',NULL,'report:'||NEW.id||':'||NEW.status);
    END IF;
  ELSIF TG_TABLE_NAME='social_chat_messages' THEN
    IF TG_OP='UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      PERFORM public.emit_game_notification(NEW.citizen_id,'social','Chat message removed',
        coalesce(NEW.moderation_note,'Your chat message was removed.'),'chat',NULL,'chat-removed:'||NEW.id,NEW.deleted_by_citizen_id);
    END IF;
  ELSIF TG_TABLE_NAME='messages' THEN
    SELECT CASE WHEN t.participant_a_citizen_id=NEW.sender_citizen_id THEN t.participant_b_citizen_id ELSE t.participant_a_citizen_id END
      INTO v_recipient FROM public.message_threads t WHERE t.id=NEW.thread_id;
    SELECT c.public_name INTO v_name FROM public.citizens c WHERE c.id=NEW.sender_citizen_id;
    PERFORM public.emit_game_notification(v_recipient,'messages','New message',coalesce(v_name,'A citizen')||' sent you a private message.',
      'messages',NEW.thread_id,'message:'||NEW.id,NEW.sender_citizen_id,jsonb_build_object('partner_id',NEW.sender_citizen_id));
  ELSIF TG_TABLE_NAME='polls' THEN
    IF NEW.status='open' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
      PERFORM public.emit_game_notification(NULL,'world','New poll',NEW.question,'voting',NEW.id,'poll-open:'||NEW.id);
    ELSIF TG_OP='UPDATE' AND NEW.status='closed' AND OLD.status='open' THEN
      PERFORM public.emit_game_notification(NULL,'world','Poll closed',NEW.question,'voting',NEW.id,'poll-closed:'||NEW.id);
    END IF;
  ELSIF TG_TABLE_NAME='news_articles' THEN
    IF NEW.status='published' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
      PERFORM public.emit_game_notification(NULL,'world','New story',NEW.headline,'localnews',NEW.id,'news:'||NEW.id);
    END IF;
  ELSIF TG_TABLE_NAME='moneytree_reward_ledger' THEN
    PERFORM public.emit_game_notification(NEW.citizen_id,'account','MoneyTree reward',
      'You received $'||NEW.amount||' for a contribution.','moneytree',NULL,'reward:'||NEW.id);
  ELSIF TG_TABLE_NAME='moneytree_clock_in_claims' THEN
    PERFORM public.emit_game_notification(NEW.citizen_id,'account','Daily reward claimed','Your clock-in reward was credited.',
      'moneytree',NULL,'clock-in:'||NEW.id);
  ELSIF TG_TABLE_NAME='owner_balance_adjustments' THEN
    PERFORM public.emit_game_notification(NEW.target_citizen_id,'account','Balance adjusted',
      'An administrator adjusted your balance by $'||NEW.amount||'. Reason: '||NEW.reason,
      'mylife',NULL,'adjustment:'||NEW.id);
  ELSIF TG_TABLE_NAME='store_purchases' THEN
    IF TG_OP='INSERT' THEN
      PERFORM public.emit_game_notification(NEW.citizen_id,'account','Purchase complete',NEW.item_name||' was purchased.',
        'store',NEW.item_id,'purchase:'||NEW.id);
    ELSIF NEW.status='reversed' AND OLD.status IS DISTINCT FROM NEW.status THEN
      PERFORM public.emit_game_notification(NEW.citizen_id,'account','Purchase reversed',NEW.item_name||' was reversed.',
        'store',NEW.item_id,'purchase-reversed:'||NEW.id);
    END IF;
  ELSIF TG_TABLE_NAME='citizen_private' THEN
    IF NEW.account_status IS DISTINCT FROM OLD.account_status OR NEW.profession IS DISTINCT FROM OLD.profession
       OR NEW.education IS DISTINCT FROM OLD.education OR NEW.social_class IS DISTINCT FROM OLD.social_class
       OR NEW.privileges IS DISTINCT FROM OLD.privileges THEN
      PERFORM public.emit_game_notification(NEW.citizen_id,'account','Citizen profile updated',
        'Your account status, privileges, education, career, or social class changed. View MyLife for the current details.',
        'mylife',NULL,'profile:'||NEW.citizen_id||':'||gen_random_uuid());
    END IF;
  ELSIF TG_TABLE_NAME='lucky7_transaction_history' THEN
    PERFORM public.emit_game_notification(NEW.citizen_id,'account','LUCKY 7 result',
      'Your '||NEW.game_type||' round changed your balance by $'||NEW.net_change||'.',
      'lucky7',NEW.id,'casino:'||NEW.id);
  ELSIF TG_TABLE_NAME='citizens' THEN
    IF TG_OP='INSERT' THEN
      PERFORM public.emit_game_notification(NEW.id,'account','Welcome to Tyranny',
        'Your citizen account is ready. Open MyLife to view your profile.','mylife',NULL,'welcome:'||NEW.id);
    ELSIF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url OR NEW.political_party IS DISTINCT FROM OLD.political_party THEN
      PERFORM public.emit_game_notification(NEW.id,'account','Profile settings updated',
        'Your avatar or political affiliation was updated.','mylife',NULL,'settings:'||NEW.id||':'||gen_random_uuid());
    END IF;
  END IF;

  -- Mentions in posts, comments, and public chat. Handle names are public.
  IF TG_OP='INSERT' AND TG_TABLE_NAME IN ('social_posts','social_comments','social_chat_messages') THEN
    IF TG_TABLE_NAME='social_chat_messages' THEN v_text:=NEW.message; v_post:=NULL;
    ELSE v_text:=NEW.content;
      IF TG_TABLE_NAME='social_posts' THEN v_post:=NEW.id; ELSE v_post:=NEW.post_id; END IF;
    END IF;
    SELECT c.public_name INTO v_name FROM public.citizens c WHERE c.id=NEW.citizen_id;
    FOR v_person IN
      SELECT DISTINCT h.citizen_id AS id FROM regexp_matches(v_text,'@([A-Za-z0-9_]{3,20})','g') m
      JOIN public.citizen_social_handles h ON h.normalized_handle=lower(m[1])
    LOOP
      PERFORM public.emit_game_notification(v_person.id,'social','You were mentioned',
        coalesce(v_name,'A citizen')||' mentioned you.',
        CASE WHEN TG_TABLE_NAME='social_chat_messages' THEN 'chat' ELSE 'social' END,v_post,
        TG_TABLE_NAME||':'||NEW.id,NEW.citizen_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_game_notification() FROM PUBLIC,anon,authenticated;

CREATE TRIGGER notify_moneytree AFTER INSERT OR UPDATE ON public.moneytree_contributions FOR EACH ROW EXECUTE FUNCTION public.capture_game_notification();
CREATE TRIGGER notify_social_comments AFTER INSERT OR UPDATE ON public.social_comments FOR EACH ROW EXECUTE FUNCTION public.capture_game_notification();
CREATE TRIGGER notify_reactions AFTER INSERT ON public.social_post_reactions FOR EACH ROW EXECUTE FUNCTION public.capture_game_notification();
CREATE TRIGGER notify_follows AFTER INSERT ON public.social_follows FOR EACH ROW EXECUTE FUNCTION public.capture_game_notification();
CREATE TRIGGER notify_posts AFTER INSERT OR UPDATE ON public.social_posts FOR EACH ROW EXECUTE FUNCTION public.capture_game_notification();
CREATE TRIGGER notify_reports AFTER UPDATE ON public.social_reports FOR EACH ROW EXECUTE FUNCTION public.capture_game_notification();
CREATE TRIGGER notify_chat AFTER INSERT OR UPDATE ON public.social_chat_messages FOR EACH ROW EXECUTE FUNCTION public.capture_game_notification();
CREATE TRIGGER notify_messages AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.capture_game_notification();
CREATE TRIGGER notify_polls AFTER INSERT OR UPDATE ON public.polls FOR EACH ROW EXECUTE FUNCTION public.capture_game_notification();
CREATE TRIGGER notify_news AFTER INSERT OR UPDATE ON public.news_articles FOR EACH ROW EXECUTE FUNCTION public.capture_game_notification();
CREATE TRIGGER notify_rewards AFTER INSERT ON public.moneytree_reward_ledger FOR EACH ROW EXECUTE FUNCTION public.capture_game_notification();
CREATE TRIGGER notify_clock_in AFTER INSERT ON public.moneytree_clock_in_claims FOR EACH ROW EXECUTE FUNCTION public.capture_game_notification();
CREATE TRIGGER notify_adjustment AFTER INSERT ON public.owner_balance_adjustments FOR EACH ROW EXECUTE FUNCTION public.capture_game_notification();
CREATE TRIGGER notify_purchase AFTER INSERT OR UPDATE ON public.store_purchases FOR EACH ROW EXECUTE FUNCTION public.capture_game_notification();
CREATE TRIGGER notify_profile AFTER UPDATE ON public.citizen_private FOR EACH ROW EXECUTE FUNCTION public.capture_game_notification();
CREATE TRIGGER notify_citizen AFTER INSERT OR UPDATE ON public.citizens FOR EACH ROW EXECUTE FUNCTION public.capture_game_notification();
CREATE TRIGGER notify_casino AFTER INSERT ON public.lucky7_transaction_history FOR EACH ROW EXECUTE FUNCTION public.capture_game_notification();

CREATE FUNCTION public.get_notification_social_post(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_citizen uuid; v_result jsonb;
BEGIN
  SELECT c.id INTO v_citizen FROM public.citizens c WHERE c.auth_user_id=auth.uid();
  IF v_citizen IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'id', p.id, 'content', p.content, 'created_at', p.created_at,
    'author', jsonb_build_object('id', c.id, 'public_name', c.public_name, 'avatar_url', c.avatar_url, 'handle', h.handle),
    'like_count',(SELECT count(*) FROM public.social_post_reactions r WHERE r.post_id=p.id AND r.reaction_type='like'),
    'repost_count',(SELECT count(*) FROM public.social_post_reactions r WHERE r.post_id=p.id AND r.reaction_type='repost'),
    'comment_count',(SELECT count(*) FROM public.social_comments x WHERE x.post_id=p.id AND x.deleted_at IS NULL),
    'liked_by_current_user', EXISTS(SELECT 1 FROM public.social_post_reactions r WHERE r.post_id=p.id AND r.citizen_id=v_citizen AND r.reaction_type='like'),
    'reposted_by_current_user', EXISTS(SELECT 1 FROM public.social_post_reactions r WHERE r.post_id=p.id AND r.citizen_id=v_citizen AND r.reaction_type='repost'),
    'is_own_post',p.citizen_id=v_citizen
  ) INTO v_result FROM public.social_posts p
  JOIN public.citizens c ON c.id=p.citizen_id
  LEFT JOIN public.citizen_social_handles h ON h.citizen_id=c.id
  WHERE p.id=p_id AND p.deleted_at IS NULL;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_notification_social_post(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_notification_social_post(uuid) TO authenticated;
COMMIT;
