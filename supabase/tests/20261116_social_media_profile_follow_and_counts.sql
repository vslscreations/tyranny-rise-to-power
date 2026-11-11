BEGIN READ ONLY;

-- --------------------------------------------------------------------
-- 5) current_user_following correctness against actual social_follows data.
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_jam_citizen uuid := '9654ac4f-1c26-4797-a3f5-d8b1dee5b442';
  v_dog_citizen uuid := 'd204873a-8f13-4169-b997-43b39cb2bbaa';
  v_jam_auth uuid;
  v_actual bool;
  v_row record;
BEGIN
  RESET ROLE;

  IF session_user <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: expected both session_user and current_user to be postgres.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);

  SELECT c.auth_user_id INTO v_jam_auth
  FROM public.citizens AS c
  WHERE c.id = v_jam_citizen;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_jam_auth::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_jam_auth::text)::text, true);

  SELECT EXISTS (
    SELECT 1
    FROM public.social_follows AS sf
    WHERE sf.follower_citizen_id = v_jam_citizen
      AND sf.following_citizen_id = v_dog_citizen
  ) INTO v_actual;

  SELECT p.current_user_following INTO v_row
  FROM public.get_citizen_social_profile(v_dog_citizen) AS p;

  IF v_row.current_user_following IS DISTINCT FROM v_actual THEN
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: current_user_following does not match actual social_follows state.';
  END IF;

  RESET ROLE;
END $$;

-- --------------------------------------------------------------------
-- 6) Follower and following counts against actual database counts.
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_jam_citizen uuid := '9654ac4f-1c26-4797-a3f5-d8b1dee5b442';
  v_dog_citizen uuid := 'd204873a-8f13-4169-b997-43b39cb2bbaa';
  v_jam_auth uuid;
  v_profile record;
  v_expected_followers bigint;
  v_expected_following bigint;
BEGIN
  RESET ROLE;

  IF session_user <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: expected both session_user and current_user to be postgres.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);

  SELECT c.auth_user_id INTO v_jam_auth
  FROM public.citizens AS c
  WHERE c.id = v_jam_citizen;

  SELECT count(*)::bigint INTO v_expected_followers
  FROM public.social_follows AS sf
  WHERE sf.following_citizen_id = v_dog_citizen;

  SELECT count(*)::bigint INTO v_expected_following
  FROM public.social_follows AS sf
  WHERE sf.follower_citizen_id = v_dog_citizen;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_jam_auth::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_jam_auth::text)::text, true);

  SELECT * INTO v_profile
  FROM public.get_citizen_social_profile(v_dog_citizen) AS p;

  IF v_profile.follower_count <> v_expected_followers THEN
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: follower_count does not match actual social_follows count.';
  END IF;

  IF v_profile.following_count <> v_expected_following THEN
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: following_count does not match actual social_follows count.';
  END IF;

  RESET ROLE;
END $$;

COMMIT;
