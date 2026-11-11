BEGIN READ ONLY;

-- --------------------------------------------------------------------
-- 12) Empty posts return an empty JSON array when a target has no active posts.
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_empty_citizen uuid;
  v_empty_citizen_auth_user_id uuid;
  v_profile record;
BEGIN
  RESET ROLE;

  IF session_user <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: expected both session_user and current_user to be postgres.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);

  SELECT c.id INTO v_empty_citizen
  FROM public.citizens AS c
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.social_posts AS sp
    WHERE sp.citizen_id = c.id
      AND sp.deleted_at IS NULL
  )
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF v_empty_citizen IS NULL THEN
    RESET ROLE;
    RAISE NOTICE 'ASSERTION SKIPPED: empty-post test not exercised because no citizen without active posts exists in the current dataset.';
    RETURN;
  END IF;

  SELECT c.auth_user_id INTO v_empty_citizen_auth_user_id
  FROM public.citizens AS c
  WHERE c.id = v_empty_citizen;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_empty_citizen_auth_user_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_empty_citizen_auth_user_id::text)::text, true);

  SELECT * INTO v_profile
  FROM public.get_citizen_social_profile(v_empty_citizen) AS p;

  IF jsonb_typeof(v_profile.posts) <> 'array' THEN
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: empty profile posts should return a JSON array.';
  END IF;

  IF jsonb_array_length(v_profile.posts) <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: empty profile posts should return [] not a populated array.';
  END IF;

  RESET ROLE;
END $$;

-- --------------------------------------------------------------------
-- 13) Profile and post author avatar URLs stay within the approved asset allowlist.
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_target uuid := '9654ac4f-1c26-4797-a3f5-d8b1dee5b442';
  v_target_auth_user_id uuid;
  v_profile record;
  v_index integer := 0;
  v_avatar text;
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

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_target_auth_user_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_target_auth_user_id::text)::text, true);

  SELECT * INTO v_profile
  FROM public.get_citizen_social_profile(v_target) AS p;

  IF v_profile.avatar_url IS NULL OR v_profile.avatar_url NOT IN (
    './assets/avatars/aurelia-voss.svg',
    './assets/avatars/jasper-reed.svg',
    './assets/avatars/mira-sloane.svg',
    './assets/avatars/dorian-kestrel.svg',
    './assets/avatars/leah-cortez.svg',
    './assets/avatars/omar-tate.svg'
  ) THEN
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: profile avatar_url is NULL or not in the approved six-asset allowlist.';
  END IF;

  FOR v_index IN 0 .. jsonb_array_length(v_profile.posts) - 1 LOOP
    v_avatar := v_profile.posts -> v_index -> 'author' ->> 'avatar_url';

    IF v_avatar IS NULL OR v_avatar NOT IN (
      './assets/avatars/aurelia-voss.svg',
      './assets/avatars/jasper-reed.svg',
      './assets/avatars/mira-sloane.svg',
      './assets/avatars/dorian-kestrel.svg',
      './assets/avatars/leah-cortez.svg',
      './assets/avatars/omar-tate.svg'
    ) THEN
      RESET ROLE;
      RAISE EXCEPTION USING ERRCODE = 'PT999',
        MESSAGE = 'ASSERTION FAILED: author avatar_url is NULL or not in the approved six-asset allowlist.';
    END IF;
  END LOOP;

  RESET ROLE;
END $$;

-- --------------------------------------------------------------------
-- 14) Returned post objects contain all required feed-compatible fields.
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_target uuid := '9654ac4f-1c26-4797-a3f5-d8b1dee5b442';
  v_target_auth_user_id uuid;
  v_profile record;
  v_index integer := 0;
  v_keys text[] := ARRAY[
    'id',
    'content',
    'created_at',
    'updated_at',
    'author',
    'like_count',
    'comment_count',
    'repost_count',
    'liked_by_current_user',
    'reposted_by_current_user',
    'current_user_following_author',
    'is_own_post'
  ];
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

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_target_auth_user_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_target_auth_user_id::text)::text, true);

  SELECT * INTO v_profile
  FROM public.get_citizen_social_profile(v_target) AS p;

  IF jsonb_array_length(v_profile.posts) = 0 THEN
    RESET ROLE;
    RETURN;
  END IF;

  FOR v_index IN 0 .. jsonb_array_length(v_profile.posts) - 1 LOOP
    IF NOT (
      (v_profile.posts -> v_index) ?& v_keys
    ) THEN
      RESET ROLE;
      RAISE EXCEPTION USING ERRCODE = 'PT999',
        MESSAGE = 'ASSERTION FAILED: a returned post object is missing a required feed-compatible field.';
    END IF;

    IF jsonb_typeof(v_profile.posts -> v_index -> 'author') <> 'object' THEN
      RESET ROLE;
      RAISE EXCEPTION USING ERRCODE = 'PT999',
        MESSAGE = 'ASSERTION FAILED: the author object is missing in a returned post.';
    END IF;
  END LOOP;

  RESET ROLE;
END $$;

-- --------------------------------------------------------------------
-- 15) Nonexistent target citizen returns no profile row.
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_missing uuid := '00000000-0000-0000-0000-000000000000';
  v_jam_auth_user_id uuid;
  v_row record;
BEGIN
  RESET ROLE;

  IF session_user <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: expected both session_user and current_user to be postgres.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);

  SELECT c.auth_user_id INTO v_jam_auth_user_id
  FROM public.citizens AS c
  WHERE c.id = '9654ac4f-1c26-4797-a3f5-d8b1dee5b442';

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_jam_auth_user_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_jam_auth_user_id::text)::text, true);

  SELECT * INTO v_row
  FROM public.get_citizen_social_profile(v_missing) AS p;

  IF v_row.citizen_id IS NOT NULL THEN
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: nonexistent citizen should return no profile row.';
  END IF;

  RESET ROLE;
END $$;

COMMIT;
