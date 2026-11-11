/*
  Review-only functional checks for public.get_citizen_social_profile(UUID)

  Accounts under test:
    Jam Man Jones citizen UUID = 9654ac4f-1c26-4797-a3f5-d8b1dee5b442
    Big Dog citizen UUID      = d204873a-8f13-4169-b997-43b39cb2bbaa

  Important:
    - This script is review-only and is not executed here.
    - All assertions are SELECT-only checks against the live database state.
    - No inserts, updates, deletes, or test-record creation are performed.
    - Follow relationships and counts are derived from the actual database state.
*/

-- --------------------------------------------------------------------
-- 1) Jam viewing Jam's own profile.
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_target uuid := '9654ac4f-1c26-4797-a3f5-d8b1dee5b442';
  v_target_auth_user_id uuid;
BEGIN
  RESET ROLE;
  PERFORM set_config('role', 'postgres', true);

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
  PERFORM set_config('role', 'postgres', true);

  SELECT c.auth_user_id INTO v_jam_auth
  FROM public.citizens AS c
  WHERE c.id = v_jam_citizen;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_jam_auth::text, true);

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
  PERFORM set_config('role', 'postgres', true);

  SELECT c.auth_user_id INTO v_dog_auth
  FROM public.citizens AS c
  WHERE c.id = v_dog_citizen;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_dog_auth::text, true);

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
  PERFORM set_config('role', 'postgres', true);

  SELECT c.auth_user_id INTO v_jam_auth
  FROM public.citizens AS c
  WHERE c.id = v_jam_citizen;

  SELECT c.auth_user_id INTO v_dog_auth
  FROM public.citizens AS c
  WHERE c.id = v_dog_citizen;

  PERFORM set_config('role', 'authenticated', true);

  PERFORM set_config('request.jwt.claim.sub', v_jam_auth::text, true);
  SELECT * INTO v_profile
  FROM public.get_citizen_social_profile(v_jam_citizen) AS p;

  IF v_profile.is_own_profile <> true THEN
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Jam self-view did not set is_own_profile = true.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_dog_auth::text, true);
  SELECT * INTO v_profile
  FROM public.get_citizen_social_profile(v_jam_citizen) AS p;

  IF v_profile.is_own_profile <> false THEN
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Dog viewing Jam profile did not set is_own_profile = false.';
  END IF;

  RESET ROLE;
END $$;

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
  PERFORM set_config('role', 'postgres', true);

  SELECT c.auth_user_id INTO v_jam_auth
  FROM public.citizens AS c
  WHERE c.id = v_jam_citizen;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_jam_auth::text, true);

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
  PERFORM set_config('role', 'postgres', true);

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

-- --------------------------------------------------------------------
-- 7) Posts are ordered newest first; the id DESC tie-breaker is checked only within the newest 20 active posts.
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_target uuid := '9654ac4f-1c26-4797-a3f5-d8b1dee5b442';
  v_target_auth_user_id uuid;
  v_profile record;
  v_tie_count bigint;
  v_prev_ts timestamptz;
  v_current_ts timestamptz;
  v_prev_id text;
  v_current_id text;
  v_index integer := 0;
BEGIN
  RESET ROLE;
  PERFORM set_config('role', 'postgres', true);

  SELECT c.auth_user_id INTO v_target_auth_user_id
  FROM public.citizens AS c
  WHERE c.id = v_target;

  SELECT count(*)::bigint INTO v_tie_count
  FROM (
    SELECT q.created_at
    FROM (
      SELECT sp.created_at
      FROM public.social_posts AS sp
      WHERE sp.citizen_id = v_target
        AND sp.deleted_at IS NULL
      ORDER BY sp.created_at DESC, sp.id DESC
      LIMIT 20
    ) AS q
    GROUP BY q.created_at
    HAVING count(*) >= 2
  ) AS t;

  IF v_tie_count = 0 THEN
    RESET ROLE;
    RAISE NOTICE 'ASSERTION SKIPPED: id DESC tie-breaker-specific test not exercised because there are no duplicate created_at timestamps among the newest 20 active posts for this target.';
    RETURN;
  END IF;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_target_auth_user_id::text, true);

  SELECT * INTO v_profile
  FROM public.get_citizen_social_profile(v_target) AS p;

  IF jsonb_array_length(v_profile.posts) > 1 THEN
    FOR v_index IN 0 .. jsonb_array_length(v_profile.posts) - 2 LOOP
      v_prev_ts := (v_profile.posts -> v_index ->> 'created_at')::timestamptz;
      v_current_ts := (v_profile.posts -> (v_index + 1) ->> 'created_at')::timestamptz;
      v_prev_id := (v_profile.posts -> v_index ->> 'id');
      v_current_id := (v_profile.posts -> (v_index + 1) ->> 'id');

      IF v_prev_ts < v_current_ts
        OR (v_prev_ts = v_current_ts AND v_prev_id::text < v_current_id::text)
      THEN
        RESET ROLE;
        RAISE EXCEPTION USING ERRCODE = 'PT999',
          MESSAGE = 'ASSERTION FAILED: posts are not ordered newest-first and do not apply the id DESC tie-breaker.';
      END IF;
    END LOOP;
  END IF;

  RESET ROLE;
END $$;

-- --------------------------------------------------------------------
-- 8) Exactly 20 active posts are returned when the target exceeds that threshold.
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_target uuid := '9654ac4f-1c26-4797-a3f5-d8b1dee5b442';
  v_target_auth_user_id uuid;
  v_active_post_count bigint;
  v_profile record;
BEGIN
  RESET ROLE;
  PERFORM set_config('role', 'postgres', true);

  SELECT c.auth_user_id INTO v_target_auth_user_id
  FROM public.citizens AS c
  WHERE c.id = v_target;

  SELECT count(*)::bigint INTO v_active_post_count
  FROM public.social_posts AS sp
  WHERE sp.citizen_id = v_target
    AND sp.deleted_at IS NULL;

  IF v_active_post_count <= 20 THEN
    RESET ROLE;
    RAISE NOTICE 'ASSERTION SKIPPED: profile limit check not exercised because the target has % active posts (<= 20).', v_active_post_count;
    RETURN;
  END IF;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_target_auth_user_id::text, true);

  SELECT * INTO v_profile
  FROM public.get_citizen_social_profile(v_target) AS p;

  IF jsonb_array_length(v_profile.posts) <> 20 THEN
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: profile RPC did not return exactly 20 active posts for a target with more than 20 active posts.';
  END IF;

  RESET ROLE;
END $$;

-- --------------------------------------------------------------------
-- 9) Every returned post belongs to the requested citizen.
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_target uuid := '9654ac4f-1c26-4797-a3f5-d8b1dee5b442';
  v_target_auth_user_id uuid;
  v_profile record;
  v_index integer := 0;
BEGIN
  RESET ROLE;
  PERFORM set_config('role', 'postgres', true);

  SELECT c.auth_user_id INTO v_target_auth_user_id
  FROM public.citizens AS c
  WHERE c.id = v_target;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_target_auth_user_id::text, true);

  SELECT * INTO v_profile
  FROM public.get_citizen_social_profile(v_target) AS p;

  FOR v_index IN 0 .. jsonb_array_length(v_profile.posts) - 1 LOOP
    IF (v_profile.posts -> v_index -> 'author' ->> 'id')::uuid <> v_target THEN
      RESET ROLE;
      RAISE EXCEPTION USING ERRCODE = 'PT999',
        MESSAGE = 'ASSERTION FAILED: a returned post does not belong to the requested citizen.';
    END IF;
  END LOOP;

  RESET ROLE;
END $$;

-- --------------------------------------------------------------------
-- 10) Deleted posts are excluded when deleted entries exist for the target.
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_target uuid := '9654ac4f-1c26-4797-a3f5-d8b1dee5b442';
  v_target_auth_user_id uuid;
  v_profile record;
  v_deleted_post_ids uuid[];
  v_deleted_post_count bigint;
  v_index integer := 0;
BEGIN
  RESET ROLE;
  PERFORM set_config('role', 'postgres', true);

  SELECT c.auth_user_id INTO v_target_auth_user_id
  FROM public.citizens AS c
  WHERE c.id = v_target;

  SELECT array_agg(sp.id ORDER BY sp.id) INTO v_deleted_post_ids
  FROM public.social_posts AS sp
  WHERE sp.citizen_id = v_target
    AND sp.deleted_at IS NOT NULL;

  v_deleted_post_count := coalesce(array_length(v_deleted_post_ids, 1), 0);

  IF v_deleted_post_count = 0 THEN
    RESET ROLE;
    RAISE NOTICE 'ASSERTION SKIPPED: deleted-post exclusion test not exercised because the target has no deleted posts.';
    RETURN;
  END IF;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_target_auth_user_id::text, true);

  SELECT * INTO v_profile
  FROM public.get_citizen_social_profile(v_target) AS p;

  FOR v_index IN 0 .. jsonb_array_length(v_profile.posts) - 1 LOOP
    IF (v_profile.posts -> v_index ->> 'id')::uuid = ANY (v_deleted_post_ids) THEN
      RESET ROLE;
      RAISE EXCEPTION USING ERRCODE = 'PT999',
        MESSAGE = 'ASSERTION FAILED: deleted posts were returned in the profile posts array.';
    END IF;
  END LOOP;

  RESET ROLE;
END $$;

-- --------------------------------------------------------------------
-- 11) Deleted comments are excluded from comment counts when they exist on the newest 20 active posts returned by the RPC.
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_target uuid := '9654ac4f-1c26-4797-a3f5-d8b1dee5b442';
  v_target_auth_user_id uuid;
  v_profile record;
  v_expected_comment_counts jsonb;
  v_deleted_comment_count bigint;
  v_selected_post_ids uuid[];
  v_index integer := 0;
  v_post_id uuid;
  v_expected_comment_count bigint;
  v_actual_comment_count bigint;
BEGIN
  RESET ROLE;
  PERFORM set_config('role', 'postgres', true);

  SELECT c.auth_user_id INTO v_target_auth_user_id
  FROM public.citizens AS c
  WHERE c.id = v_target;

  SELECT array_agg(id ORDER BY created_at DESC, id DESC) INTO v_selected_post_ids
  FROM (
    SELECT sp.id, sp.created_at
    FROM public.social_posts AS sp
    WHERE sp.citizen_id = v_target
      AND sp.deleted_at IS NULL
    ORDER BY sp.created_at DESC, sp.id DESC
    LIMIT 20
  ) AS q;

  SELECT count(*)::bigint INTO v_deleted_comment_count
  FROM public.social_comments AS sc
  JOIN public.social_posts AS sp
    ON sp.id = sc.post_id
  WHERE sp.citizen_id = v_target
    AND sp.deleted_at IS NULL
    AND sc.deleted_at IS NOT NULL
    AND sp.id = ANY (v_selected_post_ids);

  SELECT jsonb_object_agg(post_id, comment_count ORDER BY post_id)
    INTO v_expected_comment_counts
  FROM (
    SELECT sp.id AS post_id,
           count(sc.id)::bigint AS comment_count
    FROM public.social_posts AS sp
    LEFT JOIN public.social_comments AS sc
      ON sc.post_id = sp.id
     AND sc.deleted_at IS NULL
    WHERE sp.citizen_id = v_target
      AND sp.deleted_at IS NULL
    GROUP BY sp.id
  ) AS q;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_target_auth_user_id::text, true);

  SELECT * INTO v_profile
  FROM public.get_citizen_social_profile(v_target) AS p;

  IF v_deleted_comment_count = 0 THEN
    RAISE NOTICE 'ASSERTION SKIPPED: deleted-comment-specific test not exercised because there are no deleted comments on the newest 20 active posts returned by the profile RPC.';
  END IF;

  FOR v_index IN 0 .. jsonb_array_length(v_profile.posts) - 1 LOOP
    v_post_id := (v_profile.posts -> v_index ->> 'id')::uuid;
    v_expected_comment_count := coalesce((v_expected_comment_counts ->> v_post_id::text)::bigint, 0::bigint);
    v_actual_comment_count := (v_profile.posts -> v_index ->> 'comment_count')::bigint;

    IF v_actual_comment_count <> v_expected_comment_count THEN
      RESET ROLE;
      RAISE EXCEPTION USING ERRCODE = 'PT999',
        MESSAGE = 'ASSERTION FAILED: comment_count includes deleted comments or misses active comments.';
    END IF;
  END LOOP;

  RESET ROLE;
END $$;

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
  PERFORM set_config('role', 'postgres', true);

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
  PERFORM set_config('role', 'postgres', true);

  SELECT c.auth_user_id INTO v_target_auth_user_id
  FROM public.citizens AS c
  WHERE c.id = v_target;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_target_auth_user_id::text, true);

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
  PERFORM set_config('role', 'postgres', true);

  SELECT c.auth_user_id INTO v_target_auth_user_id
  FROM public.citizens AS c
  WHERE c.id = v_target;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_target_auth_user_id::text, true);

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
  PERFORM set_config('role', 'postgres', true);

  SELECT c.auth_user_id INTO v_jam_auth_user_id
  FROM public.citizens AS c
  WHERE c.id = '9654ac4f-1c26-4797-a3f5-d8b1dee5b442';

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_jam_auth_user_id::text, true);

  SELECT * INTO v_row
  FROM public.get_citizen_social_profile(v_missing) AS p;

  IF v_row.citizen_id IS NOT NULL THEN
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: nonexistent citizen should return no profile row.';
  END IF;

  RESET ROLE;
END $$;

-- --------------------------------------------------------------------
-- 16) Anonymous execution is denied.
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_target uuid := '9654ac4f-1c26-4797-a3f5-d8b1dee5b442';
BEGIN
  RESET ROLE;
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  BEGIN
    PERFORM *
    FROM public.get_citizen_social_profile(v_target) AS p;

    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: anonymous execution unexpectedly succeeded.';
  EXCEPTION
    WHEN others THEN
      RESET ROLE;
      IF SQLSTATE <> '42501' THEN
        RAISE EXCEPTION USING ERRCODE = 'PT999',
          MESSAGE = 'ASSERTION FAILED: anonymous execution did not fail with the expected permission error (42501).';
      END IF;
  END;
END $$;
