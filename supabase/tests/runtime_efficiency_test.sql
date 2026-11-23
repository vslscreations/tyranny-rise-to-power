-- Run against a database with migration 00040. All fixtures roll back.
BEGIN;
DO $$
DECLARE person record; expected bigint; before_count bigint; notice uuid;
BEGIN
  IF has_function_privilege('anon', 'public.get_game_notification_unread_count()', 'EXECUTE')
    OR has_function_privilege('anon', 'public.can_access_moderator_app()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous execution should not be allowed';
  END IF;
  FOR person IN SELECT id, auth_user_id FROM public.citizens WHERE auth_user_id IS NOT NULL LOOP
    PERFORM set_config('request.jwt.claim.sub', person.auth_user_id::text, true);
    expected := (public.get_game_notifications()->>'unread_count')::bigint;
    IF public.get_game_notification_unread_count() <> expected THEN RAISE EXCEPTION 'Count parity failed'; END IF;
    IF public.can_access_moderator_app() <> EXISTS (SELECT 1 FROM public.moneytree_moderators WHERE citizen_id=person.id) THEN
      RAISE EXCEPTION 'Moderator membership parity failed';
    END IF;
    before_count := expected;
    INSERT INTO public.game_notifications(recipient_id,category,title,target,event_key)
      VALUES(person.id,'account','Performance test','profile','performance-test:'||gen_random_uuid()) RETURNING id INTO notice;
    IF public.get_game_notification_unread_count() <> before_count + 1 THEN RAISE EXCEPTION 'New private notification not counted'; END IF;
    PERFORM public.read_game_notifications(notice);
    IF public.get_game_notification_unread_count() <> before_count THEN RAISE EXCEPTION 'Read notification still counted'; END IF;
    INSERT INTO public.game_notifications(recipient_id,category,title,target,event_key,created_at)
      VALUES(NULL,'world','Performance test','announcement','performance-test:'||gen_random_uuid(),'1900-01-01');
    IF public.get_game_notification_unread_count() <> before_count THEN RAISE EXCEPTION 'Pre-registration world event counted'; END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM public.get_game_notification_unread_count();
    RAISE EXCEPTION 'Unauthenticated count was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
SELECT 'runtime efficiency checks passed' AS result;
ROLLBACK;
