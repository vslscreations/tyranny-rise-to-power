-- Run against a migrated database. Every fixture, credit and event is rolled back.
BEGIN;
DO $$
DECLARE owner_id uuid; owner_user uuid; other_id uuid; other_user uuid;
  test_user uuid:=gen_random_uuid(); test_citizen uuid; post uuid; discussion uuid; submission uuid;
  thread uuid; message uuid; poll uuid; choice uuid; ballot uuid; adjustment uuid;
  page jsonb; next_page jsonb; baseline bigint; cutoff bigint; balance_before numeric;
BEGIN
  SELECT c.id,c.auth_user_id INTO owner_id,owner_user FROM public.moneytree_owners o
    JOIN public.citizens c ON c.id=o.citizen_id LIMIT 1;
  SELECT c.id,c.auth_user_id INTO other_id,other_user FROM public.citizens c
    JOIN public.citizen_private p ON p.citizen_id=c.id WHERE c.id<>owner_id LIMIT 1;
  IF owner_user IS NULL OR other_user IS NULL THEN RAISE EXCEPTION 'Owner and another citizen required'; END IF;
  SELECT coalesce(max(id),0) INTO cutoff FROM public.world_activity;
  PERFORM set_config('request.jwt.claim.sub',owner_user::text,true);
  INSERT INTO auth.users(id,email) VALUES(test_user,'activity-test-'||test_user||'@example.invalid');
  INSERT INTO public.citizens(auth_user_id,public_name) VALUES(test_user,'Activity Test Citizen') RETURNING id INTO test_citizen;
  IF NOT EXISTS(SELECT 1 FROM public.world_activity WHERE entity_type='citizens' AND entity_id=test_citizen::text AND actor_id=owner_id) THEN
    RAISE EXCEPTION 'Citizen event missing'; END IF;
  PERFORM set_config('request.jwt.claim.sub',test_user::text,true);
  INSERT INTO public.social_posts(citizen_id,content) VALUES(test_citizen,'PRIVATE_CONTENT_SENTINEL') RETURNING id INTO post;
  SELECT count(*) INTO baseline FROM public.world_activity WHERE entity_type='social_posts' AND entity_id=post::text;
  IF baseline<>1 THEN RAISE EXCEPTION 'Missing or duplicate insert'; END IF;
  UPDATE public.social_posts SET content=content WHERE id=post;
  IF (SELECT count(*) FROM public.world_activity WHERE entity_type='social_posts' AND entity_id=post::text)<>baseline THEN
    RAISE EXCEPTION 'No-op generated noise'; END IF;
  UPDATE public.social_posts SET content='PRIVATE_CONTENT_SENTINEL edited' WHERE id=post;
  DELETE FROM public.social_posts WHERE id=post;
  IF (SELECT count(*) FROM public.world_activity WHERE entity_type='social_posts' AND entity_id=post::text)<>3 THEN
    RAISE EXCEPTION 'Update/delete history missing'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.world_activity WHERE entity_id=post::text AND action='updated' AND details->'changed_fields' ? 'content') THEN
    RAISE EXCEPTION 'Changed field missing'; END IF;
  INSERT INTO public.message_threads(participant_a_citizen_id,participant_b_citizen_id) VALUES(test_citizen,owner_id) RETURNING id INTO thread;
  INSERT INTO public.messages(thread_id,sender_citizen_id,content) VALUES(thread,test_citizen,'PRIVATE_CONTENT_SENTINEL') RETURNING id INTO message;
  PERFORM set_config('request.jwt.claim.sub',owner_user::text,true);
  UPDATE public.messages SET read_at=now() WHERE id=message;
  IF NOT EXISTS(SELECT 1 FROM public.world_activity WHERE entity_type='messages' AND entity_id=message::text AND action='read' AND actor_id=owner_id) THEN
    RAISE EXCEPTION 'Message read missing'; END IF;
  INSERT INTO public.moneytree_discussions(discussion_type,title,prompt,created_by_citizen_id)
    VALUES('question','Activityuniquefixture','Test prompt',owner_id) RETURNING id INTO discussion;
  PERFORM set_config('request.jwt.claim.sub',other_user::text,true);
  INSERT INTO public.moneytree_contributions(discussion_id,citizen_id,contribution_type,content,word_count,submission_request_id)
    VALUES(discussion,other_id,'question_answer',repeat('answer ',30),30,gen_random_uuid()) RETURNING id INTO submission;
  PERFORM set_config('request.jwt.claim.sub',owner_user::text,true);
  UPDATE public.moneytree_contributions SET moderation_state='rejected',moderation_reason='Rollback test' WHERE id=submission;
  IF NOT EXISTS(SELECT 1 FROM public.world_activity WHERE entity_id=submission::text AND action='rejected' AND actor_id=owner_id AND subject_id=other_id) THEN
    RAISE EXCEPTION 'Moderation attribution failed'; END IF;
  SELECT balance INTO balance_before FROM public.citizen_private WHERE citizen_id=other_id;
  SELECT adjustment_id INTO adjustment FROM public.owner_adjust_citizen_balance(other_id,1,'Rollback activity test','activity-test:'||gen_random_uuid());
  IF NOT EXISTS(SELECT 1 FROM public.world_activity WHERE entity_type='owner_balance_adjustments' AND entity_id=adjustment::text AND actor_id=owner_id AND subject_id=other_id AND details->'after'->>'amount' IN ('1','1.00')) THEN
    RAISE EXCEPTION 'Balance adjustment missing'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.world_activity WHERE entity_type='citizen_private' AND subject_id=other_id AND (details->'before'->>'balance')::numeric=balance_before AND (details->'after'->>'balance')::numeric=balance_before+1) THEN
    RAISE EXCEPTION 'Balance before/after missing'; END IF;
  INSERT INTO public.polls(question,status,created_by_citizen_id) VALUES('Activity test poll','open',owner_id) RETURNING id INTO poll;
  INSERT INTO public.poll_options(poll_id,option_text,sort_order) VALUES(poll,'Test choice',0) RETURNING id INTO choice;
  INSERT INTO public.poll_votes(poll_id,citizen_id,option_id) VALUES(poll,other_id,choice) RETURNING id INTO ballot;
  IF NOT EXISTS(SELECT 1 FROM public.world_activity WHERE entity_type='poll_votes' AND entity_id=ballot::text AND details->'after'->>'poll_id'=poll::text AND NOT details->'after' ? 'option_id') THEN
    RAISE EXCEPTION 'Ballot action missing or choice exposed'; END IF;
  IF EXISTS(SELECT 1 FROM public.world_activity WHERE id>cutoff AND (details::text LIKE '%PRIVATE_CONTENT_SENTINEL%' OR details::text LIKE '%@example.invalid%' OR details::text LIKE '%auth_user_id%')) THEN
    RAISE EXCEPTION 'Private content leaked'; END IF;
  page:=public.get_world_activity(p_limit=>2);
  IF jsonb_array_length(page->'items')<>2 OR NOT (page->>'has_more')::boolean OR jsonb_typeof(page->'items'->0->'id')<>'string' THEN
    RAISE EXCEPTION 'Bounded page or safe ID failed'; END IF;
  next_page:=public.get_world_activity(p_before_id=>(page->>'next_cursor')::bigint,p_limit=>2);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(page->'items') a CROSS JOIN jsonb_array_elements(next_page->'items') b WHERE a->>'id'=b->>'id') THEN
    RAISE EXCEPTION 'Pagination overlaps'; END IF;
  page:=public.get_world_activity(p_category=>'moneytree',p_query=>'Activityuniquefixture',p_since=>transaction_timestamp());
  IF jsonb_array_length(page->'items')<>1 THEN RAISE EXCEPTION 'Category/search/time filtering failed'; END IF;
  BEGIN PERFORM public.get_world_activity(p_limit=>101); RAISE EXCEPTION 'Unbounded page accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub',other_user::text,true);
  BEGIN PERFORM public.get_world_activity(); RAISE EXCEPTION 'Non-owner read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub','',true);
  BEGIN PERFORM public.get_world_activity(); RAISE EXCEPTION 'Anonymous read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF has_table_privilege('authenticated','public.world_activity','SELECT,INSERT,UPDATE,DELETE') OR
    has_function_privilege('anon','public.get_world_activity(bigint,text,text,timestamptz,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Direct journal access exposed'; END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgname='audit_world_activity')<>38 THEN RAISE EXCEPTION 'Incomplete coverage'; END IF;
END;
$$;
SELECT 'PASS: triggers, attribution, credits, no-op suppression, privacy, paging, search and owner isolation' AS result;
ROLLBACK;
