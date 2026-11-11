BEGIN READ ONLY;

-- --------------------------------------------------------------------
-- 1) Jam viewing Jam's own profile.
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_target uuid := '9654ac4f-1c26-4797-a3f5-d8b1dee5b442';
  v_target_auth_user_id uuid;
BEGIN
  RESET ROLE;

  IF session_user <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: expected both session_user and current_user to be postgres.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);

  SELECT c.auth_user_id INTO v_target_auth_user_id
  FROM public.citizens AS c
  WHERE c.id = v_target;

  IF v_target_auth_user_id IS NULL THEN
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Jam citizen row missing for own-profile test.';
  END IF;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_target_auth_user_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_target_auth_user_id::text)::text, true);

  IF NOT EXISTS (
    SELECT 1
    FROM public.get_citizen_social_profile(v_target) AS p
    WHERE p.citizen_id = v_target
      AND p.is_own_profile = true
  ) THEN
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Jam own-profile lookup did not mark is_own_profile = true.';
  END IF;

  RESET ROLE;
END $$;

-- --------------------------------------------------------------------
-- 2) Jam viewing Big Dog's profile.
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_jam_citizen uuid := '9654ac4f-1c26-4797-a3f5-d8b1dee5b442';
  v_dog_citizen uuid := 'd204873a-8f13-4169-b997-43b39cb2bbaa';
  v_jam_auth uuid;
  v_profile record;
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

  SELECT * INTO v_profile
  FROM public.get_citizen_social_profile(v_dog_citizen) AS p;

  IF v_profile.citizen_id IS NULL THEN
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Jam could not read Big Dog profile.';
  END IF;

  IF v_profile.citizen_id <> v_dog_citizen THEN
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Jam profile lookup returned the wrong citizen.';
  END IF;

  IF v_profile.is_own_profile <> false THEN
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Jam viewing Big Dog profile did not set is_own_profile = false.';
  END IF;

  RESET ROLE;
END $$;

-- --------------------------------------------------------------------
-- 3) Big Dog viewing Jam's profile.
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_jam_citizen uuid := '9654ac4f-1c26-4797-a3f5-d8b1dee5b442';
  v_dog_citizen uuid := 'd204873a-8f13-4169-b997-43b39cb2bbaa';
  v_dog_auth uuid;
  v_profile record;
BEGIN
  RESET ROLE;

  IF session_user <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: expected both session_user and current_user to be postgres.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);

  SELECT c.auth_user_id INTO v_dog_auth
  FROM public.citizens AS c
  WHERE c.id = v_dog_citizen;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_dog_auth::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_dog_auth::text)::text, true);

  SELECT * INTO v_profile
  FROM public.get_citizen_social_profile(v_jam_citizen) AS p;

  IF v_profile.citizen_id IS NULL THEN
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Big Dog could not read Jam profile.';
  END IF;

  IF v_profile.citizen_id <> v_jam_citizen THEN
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Big Dog profile lookup returned the wrong citizen.';
  END IF;

  IF v_profile.is_own_profile <> false THEN
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Big Dog viewing Jam profile did not set is_own_profile = false.';
  END IF;

  RESET ROLE;
END $$;

-- --------------------------------------------------------------------
-- 4) is_own_profile correctness against the current authenticated citizen.
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_jam_citizen uuid := '9654ac4f-1c26-4797-a3f5-d8b1dee5b442';
  v_dog_citizen uuid := 'd204873a-8f13-4169-b997-43b39cb2bbaa';
  v_jam_auth uuid;
  v_dog_auth uuid;
  v_profile record;
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

  SELECT c.auth_user_id INTO v_dog_auth
  FROM public.citizens AS c
  WHERE c.id = v_dog_citizen;

  PERFORM set_config('role', 'authenticated', true);

  PERFORM set_config('request.jwt.claim.sub', v_jam_auth::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_jam_auth::text)::text, true);
  SELECT * INTO v_profile
  FROM public.get_citizen_social_profile(v_jam_citizen) AS p;

  IF v_profile.is_own_profile <> true THEN
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Jam self-view did not set is_own_profile = true.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_dog_auth::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_dog_auth::text)::text, true);
  SELECT * INTO v_profile
  FROM public.get_citizen_social_profile(v_jam_citizen) AS p;

  IF v_profile.is_own_profile <> false THEN
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Dog viewing Jam profile did not set is_own_profile = false.';
  END IF;

  RESET ROLE;
END $$;

COMMIT;
