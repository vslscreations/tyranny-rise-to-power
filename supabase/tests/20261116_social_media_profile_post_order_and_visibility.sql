BEGIN READ ONLY;

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

  IF session_user <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: expected both session_user and current_user to be postgres.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);

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
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_target_auth_user_id::text)::text, true);

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

  IF session_user <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: expected both session_user and current_user to be postgres.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);

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
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_target_auth_user_id::text)::text, true);

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

  IF session_user <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: expected both session_user and current_user to be postgres.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);

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
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_target_auth_user_id::text)::text, true);

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

  IF session_user <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: expected both session_user and current_user to be postgres.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);

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
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_target_auth_user_id::text)::text, true);

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

COMMIT;
