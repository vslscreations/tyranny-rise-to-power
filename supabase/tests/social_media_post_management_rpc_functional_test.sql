
BEGIN;

-- Ensure the setup occurs under a role that can create the session-local temp table.
SET ROLE postgres;

CREATE TEMP TABLE phase5b_context (
    jam_uid uuid,
    big_dog_uid uuid,
    jam_citizen_id uuid,
    big_dog_citizen_id uuid,
    active_post_id uuid,
    delete_target_post_id uuid,
    range_post_id uuid,
    deleted_visibility_post_id uuid,
    deleted_visibility_comment_id uuid
) ON COMMIT DROP;

INSERT INTO phase5b_context (
    jam_uid,
    big_dog_uid,
    jam_citizen_id,
    big_dog_citizen_id,
    active_post_id,
    delete_target_post_id,
    range_post_id,
    deleted_visibility_post_id,
    deleted_visibility_comment_id
)
VALUES (
    'fd45634c-c031-4697-8e46-81983ab5be3a'::uuid,
    'b3140793-337e-43e3-8fc6-eff96fcc35e9'::uuid,
    '9654ac4f-1c26-4797-a3f5-d8b1dee5b442'::uuid,
    'd204873a-8f13-4169-b997-43b39cb2bbaa'::uuid,
    NULL::uuid,
    NULL::uuid,
    NULL::uuid,
    NULL::uuid,
    NULL::uuid
);

-- Necessary because the temp table owner is postgres and the authenticated
-- role does not automatically inherit the temp table owner's privileges.
GRANT SELECT, UPDATE ON phase5b_context TO authenticated;

-- ============================================================
-- 1) Create Jam's active post for the edit/ownership tests.
-- Only insert content; citizen_id is supplied by the trigger.
-- ============================================================
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'fd45634c-c031-4697-8e46-81983ab5be3a', true);

WITH new_post AS (
    INSERT INTO public.social_posts (content)
    VALUES ('PHASE5B_ACTIVE_POST_' || replace(gen_random_uuid()::text, '-', ''))
    RETURNING id
)
UPDATE phase5b_context
SET active_post_id = (
    SELECT id FROM new_post
);

-- ============================================================
-- 2) Jam can edit Jam's own active post.
-- ============================================================
DO $$
DECLARE
    v_post_id uuid;
    v_updated uuid;
    v_count integer;
BEGIN
    SELECT active_post_id INTO v_post_id FROM phase5b_context;

    BEGIN
        SELECT public.update_social_post(v_post_id, 'PHASE5B_JAM_EDIT_' || replace(gen_random_uuid()::text, '-', ''))
          INTO v_updated;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Test failed: Jam edit of own active post should succeed.';
    END;

    SELECT count(*)
      INTO v_count
     FROM public.social_posts
    WHERE id = v_post_id
      AND content LIKE 'PHASE5B_JAM_EDIT_%';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Test failed: Jam edit did not persist.';
    END IF;
END
$$;

-- ============================================================
-- 3) Big Dog cannot edit Jam's active post.
--    Verify the post remains active after the unauthorized edit.
-- ============================================================
SELECT set_config('request.jwt.claim.sub', 'b3140793-337e-43e3-8fc6-eff96fcc35e9', true);

DO $$
DECLARE
    v_post_id uuid;
    v_rejected boolean := false;
    v_active_count integer;
BEGIN
    SELECT active_post_id INTO v_post_id FROM phase5b_context;

    BEGIN
        PERFORM public.update_social_post(v_post_id, 'PHASE5B_BIG_DOG_EDIT_ATTEMPT');
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN
            v_rejected := true;
    END;

    IF NOT v_rejected THEN
        RAISE EXCEPTION 'Test failed: Big Dog edit was unexpectedly allowed.';
    END IF;

    SELECT count(*)
      INTO v_active_count
     FROM public.social_posts
    WHERE id = v_post_id
      AND deleted_at IS NULL;

    IF v_active_count <> 1 THEN
        RAISE EXCEPTION 'Test failed: post was not still active after Big Dog edit attempt.';
    END IF;
END
$$;

-- ============================================================
-- 4) Big Dog cannot delete Jam's active post.
--    Verify the post remains active after the unauthorized delete.
-- ============================================================
DO $$
DECLARE
    v_post_id uuid;
    v_rejected boolean := false;
    v_active_count integer;
BEGIN
    SELECT active_post_id INTO v_post_id FROM phase5b_context;

    BEGIN
        PERFORM public.delete_social_post(v_post_id);
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN
            v_rejected := true;
    END;

    IF NOT v_rejected THEN
        RAISE EXCEPTION 'Test failed: Big Dog delete was unexpectedly allowed.';
    END IF;

    SELECT count(*)
      INTO v_active_count
     FROM public.social_posts
    WHERE id = v_post_id
      AND deleted_at IS NULL;

    IF v_active_count <> 1 THEN
        RAISE EXCEPTION 'Test failed: post was not still active after Big Dog delete attempt.';
    END IF;
END
$$;

-- Restore Jam identity for the deletion and validation steps.
SELECT set_config('request.jwt.claim.sub', 'fd45634c-c031-4697-8e46-81983ab5be3a', true);

-- ============================================================
-- 5) Jam can soft-delete Jam's own post.
-- This is intentionally split across role boundaries.
-- ============================================================
WITH new_delete_target AS (
    INSERT INTO public.social_posts (content)
    VALUES ('PHASE5B_DELETE_TARGET_' || replace(gen_random_uuid()::text, '-', ''))
    RETURNING id
)
UPDATE phase5b_context
SET delete_target_post_id = (
    SELECT id FROM new_delete_target
);

DO $$
DECLARE
    v_post_id uuid;
    v_deleted_id uuid;
BEGIN
    SELECT delete_target_post_id INTO v_post_id FROM phase5b_context;

    BEGIN
        SELECT public.delete_social_post(v_post_id)
          INTO v_deleted_id;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Test failed: Jam delete of own post should succeed.';
    END;

    IF v_deleted_id IS NULL OR v_deleted_id <> v_post_id THEN
        RAISE EXCEPTION 'Test failed: delete_social_post did not return the target post id.';
    END IF;
END
$$;

SET ROLE postgres;

DO $$
DECLARE
    v_post_id uuid;
    v_deleted_as_expected boolean := false;
BEGIN
    SELECT delete_target_post_id INTO v_post_id FROM phase5b_context;

    IF EXISTS (
        SELECT 1
          FROM public.social_posts
         WHERE id = v_post_id
           AND deleted_at IS NOT NULL
    ) THEN
        v_deleted_as_expected := true;
    END IF;

    IF NOT v_deleted_as_expected THEN
        RAISE EXCEPTION 'Test failed: deleted post verification did not find deleted_at IS NOT NULL.';
    END IF;
END
$$;

SET ROLE authenticated;

-- ============================================================
-- 6) Empty, whitespace-only, and 281-character edits are rejected.
-- ============================================================
WITH new_range_post AS (
    INSERT INTO public.social_posts (content)
    VALUES ('PHASE5B_RANGE_POST_' || replace(gen_random_uuid()::text, '-', ''))
    RETURNING id
)
UPDATE phase5b_context
SET range_post_id = (
    SELECT id FROM new_range_post
);

DO $$
DECLARE
    v_post_id uuid;
    v_rejected_empty boolean := false;
    v_rejected_whitespace boolean := false;
    v_rejected_281 boolean := false;
BEGIN
    SELECT range_post_id INTO v_post_id FROM phase5b_context;

    BEGIN
        PERFORM public.update_social_post(v_post_id, '');
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN
            v_rejected_empty := true;
    END;

    BEGIN
        PERFORM public.update_social_post(v_post_id, '   ');
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN
            v_rejected_whitespace := true;
    END;

    BEGIN
        PERFORM public.update_social_post(v_post_id, repeat('x', 281));
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN
            v_rejected_281 := true;
    END;

    IF NOT v_rejected_empty OR NOT v_rejected_whitespace OR NOT v_rejected_281 THEN
        RAISE EXCEPTION 'Test failed: invalid post edits should all be rejected.';
    END IF;
END
$$;

-- ============================================================
-- 7) Exactly 280 characters is accepted.
-- ============================================================
DO $$
DECLARE
    v_post_id uuid;
    v_updated uuid;
    v_count integer;
BEGIN
    SELECT range_post_id INTO v_post_id FROM phase5b_context;

    BEGIN
        SELECT public.update_social_post(v_post_id, repeat('x', 280))
          INTO v_updated;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Test failed: 280-character post update should succeed.';
    END;

    SELECT count(*)
      INTO v_count
     FROM public.social_posts
    WHERE id = v_post_id
      AND length(content) = 280;

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Test failed: 280-character update did not persist.';
    END IF;
END
$$;

-- ============================================================
-- 8) Deleted posts are absent from feed RPC results.
-- Use a dedicated post for the feed visibility check.
-- ============================================================
WITH new_feed_post AS (
    INSERT INTO public.social_posts (content)
    VALUES ('PHASE5B_FEED_VIS_POST_' || replace(gen_random_uuid()::text, '-', ''))
    RETURNING id
)
UPDATE phase5b_context
SET deleted_visibility_post_id = (
    SELECT id FROM new_feed_post
);

DO $$
DECLARE
    v_post_id uuid;
    v_visible_before integer;
    v_visible_after integer;
BEGIN
    SELECT deleted_visibility_post_id INTO v_post_id FROM phase5b_context;

    SELECT count(*)
      INTO v_visible_before
     FROM public.get_latest_feed(50, 0) AS feed(item)
    WHERE item->>'id' = v_post_id::text;

    IF v_visible_before <> 1 THEN
        RAISE EXCEPTION 'Test failed: active post should be present in get_latest_feed.';
    END IF;

    BEGIN
        PERFORM public.delete_social_post(v_post_id);
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Test failed: Jam should be able to delete own feed test post.';
    END;

    SELECT count(*)
      INTO v_visible_after
     FROM public.get_latest_feed(50, 0) AS feed(item)
    WHERE item->>'id' = v_post_id::text;

    IF v_visible_after <> 0 THEN
        RAISE EXCEPTION 'Test failed: deleted post should be absent from get_latest_feed.';
    END IF;
END
$$;

-- ============================================================
-- 9) Comments on deleted posts are inaccessible through get_post_comments.
-- Use a separate post and comment specifically for this check.
-- The comment is created through the existing RPC.
-- ============================================================
WITH new_comment_post AS (
    INSERT INTO public.social_posts (content)
    VALUES ('PHASE5B_COMMENT_POST_' || replace(gen_random_uuid()::text, '-', ''))
    RETURNING id
)
UPDATE phase5b_context
SET deleted_visibility_post_id = (
    SELECT id FROM new_comment_post
);

WITH new_comment AS (
    SELECT public.create_social_comment(
        (SELECT deleted_visibility_post_id FROM phase5b_context),
        'PHASE5B_COMMENT_' || replace(gen_random_uuid()::text, '-', '')
    ) AS comment_id
)
UPDATE phase5b_context
SET deleted_visibility_comment_id = (
    SELECT comment_id FROM new_comment
);

DO $$
DECLARE
    v_post_id uuid;
    v_comment_id uuid;
    v_comment_found boolean := false;
BEGIN
    SELECT deleted_visibility_post_id INTO v_post_id FROM phase5b_context;
    SELECT deleted_visibility_comment_id INTO v_comment_id FROM phase5b_context;

    IF v_comment_id IS NULL THEN
        RAISE EXCEPTION 'Test failed: create_social_comment did not return a valid comment id.';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.get_post_comments(v_post_id, 25, 0) AS comments(item)
         WHERE (item->>'id')::uuid = v_comment_id
    ) THEN
        v_comment_found := true;
    END IF;

    IF NOT v_comment_found THEN
        RAISE EXCEPTION 'Test failed: created comment was not returned by get_post_comments before post deletion.';
    END IF;
END
$$;

DO $$
DECLARE
    v_post_id uuid;
    v_rejected boolean := false;
BEGIN
    SELECT deleted_visibility_post_id INTO v_post_id FROM phase5b_context;

    BEGIN
        PERFORM public.delete_social_post(v_post_id);
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Test failed: Jam should be able to delete own comment-visibility test post.';
    END;

    BEGIN
        PERFORM * FROM public.get_post_comments(v_post_id, 25, 0) AS comments(item);
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN
            v_rejected := true;
    END;

    IF NOT v_rejected THEN
        RAISE EXCEPTION 'Test failed: comments on deleted post should be inaccessible via get_post_comments.';
    END IF;
END
$$;

-- Final cleanup is handled by the transaction rollback.
ROLLBACK;