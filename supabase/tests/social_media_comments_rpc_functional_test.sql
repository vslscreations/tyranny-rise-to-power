/*
  Social Media Comments RPC Functional Test Script (review only)
  Accounts under test:
    Jam Man Jones
      citizen_uuid = 9654ac4f-1c26-4797-a3f5-d8b1dee5b442
      auth_uid    = fd45634c-c031-4697-8e46-81983ab5be3a

    Big Dog
      citizen_uuid = d204873a-8f13-4169-b997-43b39cb2bbaa
      auth_uid    = b3140793-337e-43e3-8fc6-eff96fcc35e9

  IMPORTANT:
    - This script is review-only and is not executed here.
    - All posts/comments are created inside one transaction and are rolled back.
    - The baseline temp table is created before BEGIN and preserved for the session.
    - The state temp table is created after BEGIN and dropped on ROLLBACK.
    - The temp state grants are session-local only.
    - PT999 is reserved for assertion failures and is never swallowed.
    - Expected database errors are only caught for the actual SQLSTATEs used by the deployed functions.
*/

-- --------------------------------------------------------------------
-- 0) Preserve baseline for final post-rollback comparison
-- --------------------------------------------------------------------
CREATE TEMP TABLE comment_test_baseline (
  total_comment_rows bigint,
  active_comment_rows bigint,
  total_post_rows bigint
) ON COMMIT PRESERVE ROWS;

INSERT INTO comment_test_baseline (
  total_comment_rows,
  active_comment_rows,
  total_post_rows
)
SELECT
  (SELECT count(*) FROM public.social_comments) AS total_comment_rows,
  (SELECT count(*) FROM public.social_comments WHERE deleted_at IS NULL) AS active_comment_rows,
  (SELECT count(*) FROM public.social_posts) AS total_post_rows;

-- --------------------------------------------------------------------
-- 1) Begin transaction and create isolated test-state table
-- --------------------------------------------------------------------
BEGIN;

CREATE TEMP TABLE comment_test_state (
  test_name text PRIMARY KEY,
  post_id uuid,
  comment_id uuid,
  original_content text,
  post_owner text
) ON COMMIT DROP;

-- Grants are only for the temp state table and are not persistent.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE pg_temp.comment_test_state TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE pg_temp.comment_test_state TO anon;

-- --------------------------------------------------------------------
-- 2) Create fresh test posts for Jam and Big Dog using create_social_post
-- --------------------------------------------------------------------
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'fd45634c-c031-4697-8e46-81983ab5be3a', true);

INSERT INTO comment_test_state (test_name, post_id, post_owner)
VALUES (
  'jam_post',
  public.create_social_post('Jam test post for comment RPC checks.'),
  'Jam Man Jones'
)
ON CONFLICT (test_name) DO NOTHING;

SELECT set_config('request.jwt.claim.sub', 'b3140793-337e-43e3-8fc6-eff96fcc35e9', true);

INSERT INTO comment_test_state (test_name, post_id, post_owner)
VALUES (
  'dog_post',
  public.create_social_post('Big Dog test post for comment RPC checks.'),
  'Big Dog'
)
ON CONFLICT (test_name) DO NOTHING;

-- --------------------------------------------------------------------
-- 3) Jam Man Jones: success path create + visible retrieval
-- --------------------------------------------------------------------
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'fd45634c-c031-4697-8e46-81983ab5be3a', true);

WITH created AS (
  SELECT public.create_social_comment(
    (SELECT post_id FROM comment_test_state WHERE test_name = 'jam_post'),
    'Jam comment 1'
  ) AS comment_id
)
UPDATE comment_test_state
SET comment_id = (SELECT comment_id FROM created),
    original_content = 'Jam comment 1'
WHERE test_name = 'jam_post';

DO $$
DECLARE
  v_post_id uuid;
  v_visible integer;
BEGIN
  v_post_id := (SELECT post_id FROM comment_test_state WHERE test_name = 'jam_post');

  SELECT count(*)
    INTO v_visible
  FROM public.get_post_comments(v_post_id, 25, 0) AS j
  WHERE (j->>'content') = 'Jam comment 1';

  IF v_visible <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Jam create/retrieve expected exactly one visible comment';
  END IF;
END $$;

-- --------------------------------------------------------------------
-- 4) Jam Man Jones: update own comment
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_comment_id uuid;
BEGIN
  v_comment_id := (SELECT comment_id FROM comment_test_state WHERE test_name = 'jam_post');

  PERFORM public.update_social_comment(v_comment_id, 'Jam comment 1 edited');

  IF NOT EXISTS (
    SELECT 1
    FROM public.get_post_comments(
      (SELECT post_id FROM comment_test_state WHERE test_name = 'jam_post'),
      25,
      0
    ) AS j
    WHERE (j->>'content') = 'Jam comment 1 edited'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Jam update did not become visible';
  END IF;
END $$;

-- --------------------------------------------------------------------
-- 5) Big Dog attempts to edit and delete Jam's active comment
--    Jam's original comment remains active and unchanged.
-- --------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'b3140793-337e-43e3-8fc6-eff96fcc35e9', true);

DO $$
DECLARE
  v_comment_id uuid;
  v_post_id uuid;
  v_visible_count integer;
  v_expected text := 'Jam comment 1 edited';
BEGIN
  v_comment_id := (SELECT comment_id FROM comment_test_state WHERE test_name = 'jam_post');
  v_post_id := (SELECT post_id FROM comment_test_state WHERE test_name = 'jam_post');

  BEGIN
    PERFORM public.update_social_comment(v_comment_id, 'Big Dog attempted edit of Jam comment');
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Big Dog unexpectedly edited Jam comment';
  EXCEPTION
    WHEN raise_exception THEN NULL;
    WHEN others THEN
      IF SQLSTATE = 'PT999' THEN
        RAISE;
      END IF;
      IF SQLSTATE <> 'P0001' THEN
        RAISE EXCEPTION USING ERRCODE = 'PT999',
          MESSAGE = 'ASSERTION FAILED: unexpected SQLSTATE during unauthorized Jam edit';
      END IF;
  END;

  BEGIN
    PERFORM public.delete_social_comment(v_comment_id);
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Big Dog unexpectedly deleted Jam comment';
  EXCEPTION
    WHEN raise_exception THEN NULL;
    WHEN others THEN
      IF SQLSTATE = 'PT999' THEN
        RAISE;
      END IF;
      IF SQLSTATE <> 'P0001' THEN
        RAISE EXCEPTION USING ERRCODE = 'PT999',
          MESSAGE = 'ASSERTION FAILED: unexpected SQLSTATE during unauthorized Jam delete';
      END IF;
  END;

  SELECT count(*)
    INTO v_visible_count
  FROM public.get_post_comments(v_post_id, 25, 0) AS j
  WHERE (j->>'id')::uuid = v_comment_id
    AND (j->>'content') = v_expected;

  IF v_visible_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Jam comment missing or changed after unauthorized cross-account mutation';
  END IF;
END $$;

-- Restore Jam identity
SELECT set_config('request.jwt.claim.sub', 'fd45634c-c031-4697-8e46-81983ab5be3a', true);

-- --------------------------------------------------------------------
-- 6) Big Dog: create comment and visible retrieval
-- --------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'b3140793-337e-43e3-8fc6-eff96fcc35e9', true);

WITH created AS (
  SELECT public.create_social_comment(
    (SELECT post_id FROM comment_test_state WHERE test_name = 'dog_post'),
    'Big Dog comment 1'
  ) AS comment_id
)
UPDATE comment_test_state
SET comment_id = (SELECT comment_id FROM created),
    original_content = 'Big Dog comment 1'
WHERE test_name = 'dog_post';

DO $$
DECLARE
  v_post_id uuid;
  v_visible integer;
BEGIN
  v_post_id := (SELECT post_id FROM comment_test_state WHERE test_name = 'dog_post');

  SELECT count(*)
    INTO v_visible
  FROM public.get_post_comments(v_post_id, 25, 0) AS j
  WHERE (j->>'content') = 'Big Dog comment 1';

  IF v_visible <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Big Dog create/retrieve expected exactly one visible comment';
  END IF;
END $$;

-- --------------------------------------------------------------------
-- 7) Big Dog: update own comment
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_comment_id uuid;
BEGIN
  v_comment_id := (SELECT comment_id FROM comment_test_state WHERE test_name = 'dog_post');

  PERFORM public.update_social_comment(v_comment_id, 'Big Dog comment 1 edited');

  IF NOT EXISTS (
    SELECT 1
    FROM public.get_post_comments(
      (SELECT post_id FROM comment_test_state WHERE test_name = 'dog_post'),
      25,
      0
    ) AS j
    WHERE (j->>'content') = 'Big Dog comment 1 edited'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Big Dog update did not become visible';
  END IF;
END $$;

-- --------------------------------------------------------------------
-- 8) Jam attempts to edit and delete Big Dog's active comment
--    Big Dog's original comment remains active and unchanged.
-- --------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'fd45634c-c031-4697-8e46-81983ab5be3a', true);

DO $$
DECLARE
  v_comment_id uuid;
  v_post_id uuid;
  v_visible_count integer;
  v_expected text := 'Big Dog comment 1 edited';
BEGIN
  v_comment_id := (SELECT comment_id FROM comment_test_state WHERE test_name = 'dog_post');
  v_post_id := (SELECT post_id FROM comment_test_state WHERE test_name = 'dog_post');

  BEGIN
    PERFORM public.update_social_comment(v_comment_id, 'Jam attempted edit of Big Dog comment');
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Jam unexpectedly edited Big Dog comment';
  EXCEPTION
    WHEN raise_exception THEN NULL;
    WHEN others THEN
      IF SQLSTATE = 'PT999' THEN
        RAISE;
      END IF;
      IF SQLSTATE <> 'P0001' THEN
        RAISE EXCEPTION USING ERRCODE = 'PT999',
          MESSAGE = 'ASSERTION FAILED: unexpected SQLSTATE during unauthorized Dog edit';
      END IF;
  END;

  BEGIN
    PERFORM public.delete_social_comment(v_comment_id);
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Jam unexpectedly deleted Big Dog comment';
  EXCEPTION
    WHEN raise_exception THEN NULL;
    WHEN others THEN
      IF SQLSTATE = 'PT999' THEN
        RAISE;
      END IF;
      IF SQLSTATE <> 'P0001' THEN
        RAISE EXCEPTION USING ERRCODE = 'PT999',
          MESSAGE = 'ASSERTION FAILED: unexpected SQLSTATE during unauthorized Dog delete';
      END IF;
  END;

  SELECT count(*)
    INTO v_visible_count
  FROM public.get_post_comments(v_post_id, 25, 0) AS j
  WHERE (j->>'id')::uuid = v_comment_id
    AND (j->>'content') = v_expected;

  IF v_visible_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: Big Dog comment missing or changed after unauthorized cross-account mutation';
  END IF;
END $$;

-- --------------------------------------------------------------------
-- 9) Validation failures: empty, whitespace-only, 501 chars
--    These are expected P0001 exceptions.
-- --------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'fd45634c-c031-4697-8e46-81983ab5be3a', true);

DO $$
DECLARE
  v_post_id uuid;
BEGIN
  v_post_id := (SELECT post_id FROM comment_test_state WHERE test_name = 'jam_post');

  BEGIN
    PERFORM public.create_social_comment(v_post_id, '');
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: empty comment unexpectedly accepted';
  EXCEPTION
    WHEN raise_exception THEN NULL;
    WHEN others THEN
      IF SQLSTATE = 'PT999' THEN
        RAISE;
      END IF;
      IF SQLSTATE <> 'P0001' THEN
        RAISE EXCEPTION USING ERRCODE = 'PT999',
          MESSAGE = 'ASSERTION FAILED: expected P0001 for empty comment';
      END IF;
  END;

  BEGIN
    PERFORM public.create_social_comment(v_post_id, '   ');
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: whitespace-only comment unexpectedly accepted';
  EXCEPTION
    WHEN raise_exception THEN NULL;
    WHEN others THEN
      IF SQLSTATE = 'PT999' THEN
        RAISE;
      END IF;
      IF SQLSTATE <> 'P0001' THEN
        RAISE EXCEPTION USING ERRCODE = 'PT999',
          MESSAGE = 'ASSERTION FAILED: expected P0001 for whitespace-only comment';
      END IF;
  END;

  BEGIN
    PERFORM public.create_social_comment(v_post_id, repeat('x', 501));
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: 501-char comment unexpectedly accepted';
  EXCEPTION
    WHEN raise_exception THEN NULL;
    WHEN others THEN
      IF SQLSTATE = 'PT999' THEN
        RAISE;
      END IF;
      IF SQLSTATE <> 'P0001' THEN
        RAISE EXCEPTION USING ERRCODE = 'PT999',
          MESSAGE = 'ASSERTION FAILED: expected P0001 for 501-char comment';
      END IF;
  END;
END $$;

-- --------------------------------------------------------------------
-- 10) Direct table restrictions, under authenticated role
--     This must prove the authenticated role cannot SELECT, INSERT, or UPDATE social_comments.
--     The UPDATE check uses a guaranteed-false predicate to avoid requiring SELECT permission.
-- --------------------------------------------------------------------
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'fd45634c-c031-4697-8e46-81983ab5be3a', true);

DO $$
DECLARE
  v_post_id uuid;
BEGIN
  v_post_id := (SELECT post_id FROM comment_test_state WHERE test_name = 'jam_post');

  BEGIN
    PERFORM *
    FROM public.social_comments
    LIMIT 1;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: authenticated SELECT on social_comments unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLSTATE = 'PT999' THEN
        RAISE;
      END IF;
      IF SQLSTATE <> '42501' THEN
        RAISE EXCEPTION USING ERRCODE = 'PT999',
          MESSAGE = 'ASSERTION FAILED: expected 42501 for authenticated direct SELECT';
      END IF;
  END;

  BEGIN
    INSERT INTO public.social_comments (post_id, content, citizen_id)
    VALUES (
      v_post_id,
      'direct insert should fail',
      '9654ac4f-1c26-4797-a3f5-d8b1dee5b442'
    );
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: authenticated INSERT on social_comments unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLSTATE = 'PT999' THEN
        RAISE;
      END IF;
      IF SQLSTATE <> '42501' THEN
        RAISE EXCEPTION USING ERRCODE = 'PT999',
          MESSAGE = 'ASSERTION FAILED: expected 42501 for authenticated direct INSERT';
      END IF;
  END;

  BEGIN
    UPDATE public.social_comments
       SET content = 'direct update should fail'
     WHERE false;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: authenticated UPDATE on social_comments unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLSTATE = 'PT999' THEN
        RAISE;
      END IF;
      IF SQLSTATE <> '42501' THEN
        RAISE EXCEPTION USING ERRCODE = 'PT999',
          MESSAGE = 'ASSERTION FAILED: expected 42501 for authenticated direct UPDATE';
      END IF;
  END;
END $$;

-- --------------------------------------------------------------------
-- 11) ANON tests: must fail with 42501 before entering function logic
-- --------------------------------------------------------------------
SELECT set_config('role', 'anon', true);
SELECT set_config('request.jwt.claim.sub', '', true);

DO $$
DECLARE
  v_post_id uuid;
BEGIN
  v_post_id := (SELECT post_id FROM comment_test_state WHERE test_name = 'jam_post');

  BEGIN
    PERFORM public.create_social_comment(v_post_id, 'anon should fail');
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: anon create_social_comment unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLSTATE = 'PT999' THEN
        RAISE;
      END IF;
      IF SQLSTATE <> '42501' THEN
        RAISE EXCEPTION USING ERRCODE = 'PT999',
          MESSAGE = 'ASSERTION FAILED: expected 42501 for anon create_social_comment';
      END IF;
  END;

  BEGIN
    PERFORM public.get_post_comments(v_post_id, 25, 0);
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: anon get_post_comments unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLSTATE = 'PT999' THEN
        RAISE;
      END IF;
      IF SQLSTATE <> '42501' THEN
        RAISE EXCEPTION USING ERRCODE = 'PT999',
          MESSAGE = 'ASSERTION FAILED: expected 42501 for anon get_post_comments';
      END IF;
  END;
END $$;

-- --------------------------------------------------------------------
-- 12) Pagination: separate fresh post with exactly 30 comments
--     Use a dedicated pagination post and do not reuse Jam's test post.
-- --------------------------------------------------------------------
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'fd45634c-c031-4697-8e46-81983ab5be3a', true);

INSERT INTO comment_test_state (test_name, post_id, post_owner)
VALUES (
  'pagination_post',
  public.create_social_post('Pagination test post for comments.'),
  'Jam Man Jones'
)
ON CONFLICT (test_name) DO UPDATE
SET post_id = EXCLUDED.post_id,
    post_owner = EXCLUDED.post_owner;

WITH numbers AS (
  SELECT generate_series(1, 30) AS n
)
SELECT public.create_social_comment(
  (SELECT post_id FROM comment_test_state WHERE test_name = 'pagination_post'),
  'pagination-' || n::text
)
FROM numbers;

DO $$
DECLARE
  v_page_1 integer;
  v_page_2 integer;
BEGIN
  SELECT count(*)
    INTO v_page_1
  FROM public.get_post_comments(
    (SELECT post_id FROM comment_test_state WHERE test_name = 'pagination_post'),
    25,
    0
  ) AS j;

  IF v_page_1 <> 25 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: pagination expected 25 rows at offset 0';
  END IF;

  SELECT count(*)
    INTO v_page_2
  FROM public.get_post_comments(
    (SELECT post_id FROM comment_test_state WHERE test_name = 'pagination_post'),
    25,
    25
  ) AS j;

  IF v_page_2 <> 5 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: pagination expected 5 rows at offset 25';
  END IF;
END $$;

DO $$
DECLARE
  v_post_id uuid;
BEGIN
  v_post_id := (SELECT post_id FROM comment_test_state WHERE test_name = 'pagination_post');

  BEGIN
    PERFORM public.get_post_comments(v_post_id, 0, 0);
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: invalid limit 0 unexpectedly accepted';
  EXCEPTION
    WHEN raise_exception THEN NULL;
    WHEN others THEN
      IF SQLSTATE = 'PT999' THEN
        RAISE;
      END IF;
      IF SQLSTATE <> 'P0001' THEN
        RAISE EXCEPTION USING ERRCODE = 'PT999',
          MESSAGE = 'ASSERTION FAILED: expected P0001 for invalid limit 0';
      END IF;
  END;

  BEGIN
    PERFORM public.get_post_comments(v_post_id, 26, 0);
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: invalid limit 26 unexpectedly accepted';
  EXCEPTION
    WHEN raise_exception THEN NULL;
    WHEN others THEN
      IF SQLSTATE = 'PT999' THEN
        RAISE;
      END IF;
      IF SQLSTATE <> 'P0001' THEN
        RAISE EXCEPTION USING ERRCODE = 'PT999',
          MESSAGE = 'ASSERTION FAILED: expected P0001 for invalid limit 26';
      END IF;
  END;
END $$;

-- --------------------------------------------------------------------
-- 13) Feed-count test: separate feed post and separate feed comment ID
--     Verify comment_count = 1 before deletion and 0 after deletion.
--     After soft delete:
--       - get_post_comments must not return the deleted comment ID
--       - the original author cannot update the deleted comment (P0001)
--       - feed comment_count remains 0
-- --------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'fd45634c-c031-4697-8e46-81983ab5be3a', true);

INSERT INTO comment_test_state (test_name, post_id, post_owner)
VALUES (
  'feed_count_post',
  public.create_social_post('Feed count test post for comments.'),
  'Jam Man Jones'
)
ON CONFLICT (test_name) DO UPDATE
SET post_id = EXCLUDED.post_id,
    post_owner = EXCLUDED.post_owner;

WITH created AS (
  SELECT public.create_social_comment(
    (SELECT post_id FROM comment_test_state WHERE test_name = 'feed_count_post'),
    'Feed count test comment'
  ) AS comment_id
)
UPDATE comment_test_state
SET comment_id = (SELECT comment_id FROM created),
    original_content = 'Feed count test comment'
WHERE test_name = 'feed_count_post';

DO $$
DECLARE
  v_post_id uuid;
  v_comment_count integer;
BEGIN
  v_post_id := (SELECT post_id FROM comment_test_state WHERE test_name = 'feed_count_post');

  SELECT (row_value->>'comment_count')::int
    INTO v_comment_count
  FROM public.get_latest_feed(25, 0) AS row_value
  WHERE (row_value->>'id')::uuid = v_post_id;

  IF v_comment_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: feed_count expected 1 before deletion';
  END IF;
END $$;

DO $$
DECLARE
  v_comment_id uuid;
BEGIN
  v_comment_id := (SELECT comment_id FROM comment_test_state WHERE test_name = 'feed_count_post');
  PERFORM public.delete_social_comment(v_comment_id);
END $$;

DO $$
DECLARE
  v_post_id uuid;
  v_deleted_comment_id uuid;
  v_visible integer;
BEGIN
  v_post_id := (SELECT post_id FROM comment_test_state WHERE test_name = 'feed_count_post');
  v_deleted_comment_id := (SELECT comment_id FROM comment_test_state WHERE test_name = 'feed_count_post');

  SELECT count(*)
    INTO v_visible
  FROM public.get_post_comments(v_post_id, 25, 0) AS j
  WHERE (j->>'id')::uuid = v_deleted_comment_id;

  IF v_visible <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: deleted feed-count comment still visible in get_post_comments';
  END IF;
END $$;

DO $$
DECLARE
  v_comment_id uuid;
BEGIN
  v_comment_id := (SELECT comment_id FROM comment_test_state WHERE test_name = 'feed_count_post');

  BEGIN
    PERFORM public.update_social_comment(v_comment_id, 'Attempt to update deleted feed-count comment');
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: original author unexpectedly updated a deleted feed-count comment';
  EXCEPTION
    WHEN raise_exception THEN NULL;
    WHEN others THEN
      IF SQLSTATE = 'PT999' THEN
        RAISE;
      END IF;
      IF SQLSTATE <> 'P0001' THEN
        RAISE EXCEPTION USING ERRCODE = 'PT999',
          MESSAGE = 'ASSERTION FAILED: expected P0001 when updating a deleted comment';
      END IF;
  END;
END $$;

DO $$
DECLARE
  v_post_id uuid;
  v_comment_count integer;
BEGIN
  v_post_id := (SELECT post_id FROM comment_test_state WHERE test_name = 'feed_count_post');

  SELECT (row_value->>'comment_count')::int
    INTO v_comment_count
  FROM public.get_latest_feed(25, 0) AS row_value
  WHERE (row_value->>'id')::uuid = v_post_id;

  IF v_comment_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: feed_count expected 0 after soft deletion and deleted-comment visibility check';
  END IF;
END $$;

ROLLBACK;

-- --------------------------------------------------------------------
-- 14) Post-rollback validation against the preserved baseline
--     The temp baseline remains available after ROLLBACK in the same session.
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_before_total_comments bigint;
  v_before_active_comments bigint;
  v_before_total_posts bigint;
  v_after_total_comments bigint;
  v_after_active_comments bigint;
  v_after_total_posts bigint;
BEGIN
  SELECT total_comment_rows, active_comment_rows, total_post_rows
    INTO v_before_total_comments, v_before_active_comments, v_before_total_posts
  FROM comment_test_baseline;

  SELECT count(*), count(*) FILTER (WHERE deleted_at IS NULL)
    INTO v_after_total_comments, v_after_active_comments
  FROM public.social_comments;

  SELECT count(*)
    INTO v_after_total_posts
  FROM public.social_posts;

  IF v_after_total_comments <> v_before_total_comments THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: persisted total comment count changed after rollback';
  END IF;

  IF v_after_active_comments <> v_before_active_comments THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: persisted active comment count changed after rollback';
  END IF;

  IF v_after_total_posts <> v_before_total_posts THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: persisted total post count changed after rollback';
  END IF;
END $$;
