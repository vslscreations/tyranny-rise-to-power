-- All test citizens, contributions, and notifications are rolled back.
BEGIN;
DO $$
DECLARE owner_id uuid; owner_user uuid; other_id uuid; other_user uuid;
  test_user uuid:=gen_random_uuid(); test_citizen uuid; discussion uuid; submission uuid;
  notice uuid; before_count bigint; feed jsonb; baseline_player_count bigint;
BEGIN
  SELECT c.id,c.auth_user_id INTO owner_id,owner_user FROM public.creator_notification_recipients r
    JOIN public.citizens c ON c.id=r.citizen_id;
  SELECT id,auth_user_id INTO other_id,other_user FROM public.citizens WHERE id<>owner_id LIMIT 1;
  IF owner_user IS NULL OR other_user IS NULL THEN RAISE EXCEPTION 'Owner and another citizen are required'; END IF;
  SELECT count(*) INTO baseline_player_count FROM public.game_notifications WHERE recipient_id=owner_id;
  SELECT count(*) INTO before_count FROM public.creator_notifications WHERE recipient_id=owner_id AND read_at IS NULL;
  INSERT INTO auth.users(id,email) VALUES(test_user,'creator-test-'||test_user||'@example.invalid');
  INSERT INTO public.citizens(auth_user_id,public_name) VALUES(test_user,'Creator Alert Test Citizen') RETURNING id INTO test_citizen;
  IF NOT EXISTS(SELECT 1 FROM public.creator_notifications WHERE recipient_id=owner_id AND kind='citizen'
    AND source_id=test_citizen AND body LIKE 'Creator Alert Test Citizen%') THEN RAISE EXCEPTION 'Citizen alert missing'; END IF;
  INSERT INTO public.moneytree_discussions(discussion_type,title,prompt,created_by_citizen_id)
    VALUES('question','Creator alert rollback test','Test prompt',owner_id) RETURNING id INTO discussion;
  INSERT INTO public.moneytree_contributions(discussion_id,citizen_id,contribution_type,content,word_count,submission_request_id)
    VALUES(discussion,other_id,'question_answer',repeat('answer ',30),30,gen_random_uuid()) RETURNING id INTO submission;
  SELECT id INTO notice FROM public.creator_notifications WHERE source_id=submission AND kind='submission' AND recipient_id=owner_id;
  IF notice IS NULL THEN RAISE EXCEPTION 'Submission alert missing'; END IF;
  IF (SELECT count(*) FROM public.game_notifications WHERE recipient_id=owner_id)<>baseline_player_count THEN
    RAISE EXCEPTION 'Creator alerts polluted player inbox'; END IF;
  UPDATE public.moneytree_contributions SET content=repeat('edited ',30) WHERE id=submission;
  IF (SELECT count(*) FROM public.creator_notifications WHERE source_id=submission)<>1 THEN RAISE EXCEPTION 'Duplicate submission alert'; END IF;
  IF NOT EXISTS(SELECT 1 FROM realtime.messages WHERE topic='citizen-balance:'||owner_user::text
    AND event='creator_notification' AND private=true AND inserted_at>=transaction_timestamp()) THEN RAISE EXCEPTION 'Live signal missing'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_user::text,true);
  IF (public.get_creator_notification_status()->>'enabled')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Owner disabled'; END IF;
  IF (public.get_creator_notification_status()->>'unread_count')::bigint<>before_count+2 THEN RAISE EXCEPTION 'Unread count incorrect'; END IF;
  feed:=public.get_creator_notifications();
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(feed->'items') n WHERE n->>'id'=notice::text) THEN RAISE EXCEPTION 'Inbox missing submission'; END IF;
  PERFORM public.read_creator_notifications(notice);
  IF (public.get_creator_notification_status()->>'unread_count')::bigint<>before_count+1 THEN RAISE EXCEPTION 'Read state not persisted'; END IF;
  PERFORM set_config('request.jwt.claim.sub',other_user::text,true);
  IF (public.get_creator_notification_status()->>'enabled')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'Other citizen enabled'; END IF;
  BEGIN
    PERFORM public.get_creator_notifications(); RAISE EXCEPTION 'Other citizen read creator inbox';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.read_creator_notifications(notice); RAISE EXCEPTION 'Other citizen changed read state';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF has_table_privilege('authenticated','public.creator_notifications','SELECT') OR
    has_table_privilege('authenticated','public.creator_notification_recipients','INSERT') OR
    has_function_privilege('anon','public.get_creator_notifications(integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected direct permissions'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_user::text,true);
  PERFORM public.read_creator_notifications(NULL,now()-interval '1 day');
  IF (public.get_creator_notification_status()->>'unread_count')::bigint<1 THEN RAISE EXCEPTION 'Old cutoff marked new alert read'; END IF;
  PERFORM public.read_creator_notifications();
  IF (public.get_creator_notification_status()->>'unread_count')::bigint<>0 THEN RAISE EXCEPTION 'Mark all read failed'; END IF;
  DELETE FROM public.moneytree_owners WHERE citizen_id=owner_id;
  IF (public.get_creator_notification_status()->>'enabled')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'Revoked owner still enabled'; END IF;
END;
$$;
SELECT 'Creator events, live signals, separate inbox, read state and access isolation passed' AS result;
ROLLBACK;
