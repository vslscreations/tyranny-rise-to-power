-- Social Media feed function draft for review only.
-- This migration is not applied and is intentionally scoped to the approved
-- postgres-owned SECURITY DEFINER model. No new roles, no BYPASSRLS grants,
-- no ownership changes on existing tables, and no RLS policy modifications.

BEGIN;

DO $$
BEGIN
    IF current_user <> 'postgres' THEN
        RAISE EXCEPTION
            'This migration must be executed as postgres. Refusing to proceed under role %.',
            current_user;
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.get_latest_feed(p_limit integer, p_offset integer)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_citizen_id uuid;
    v_limit integer := p_limit;
    v_offset integer := p_offset;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required for feed access.';
    END IF;

    IF v_limit IS NULL OR v_limit < 1 OR v_limit > 50 THEN
        RAISE EXCEPTION 'p_limit must be between 1 and 50.';
    END IF;

    IF v_offset IS NULL OR v_offset < 0 THEN
        RAISE EXCEPTION 'p_offset must be non-negative.';
    END IF;

    SELECT c.id
      INTO v_current_citizen_id
      FROM public.citizens AS c
     WHERE c.auth_user_id = auth.uid()
     LIMIT 1;

    IF v_current_citizen_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH visible_posts AS (
        SELECT
            sp.id,
            sp.citizen_id AS author_citizen_id,
            sp.content,
            sp.created_at,
            sp.updated_at,
            author.public_name,
            CASE
                WHEN author.avatar_url = './assets/avatars/aurelia-voss.svg'
                  OR author.avatar_url = './assets/avatars/jasper-reed.svg'
                  OR author.avatar_url = './assets/avatars/mira-sloane.svg'
                  OR author.avatar_url = './assets/avatars/dorian-kestrel.svg'
                  OR author.avatar_url = './assets/avatars/leah-cortez.svg'
                  OR author.avatar_url = './assets/avatars/omar-tate.svg'
                    THEN author.avatar_url
                ELSE './assets/avatars/aurelia-voss.svg'
            END AS author_avatar_url,
            COALESCE((
                SELECT count(*)
                  FROM public.social_post_reactions AS spr
                 WHERE spr.post_id = sp.id
                   AND spr.reaction_type = 'like'
            ), 0) AS like_count,
            COALESCE((
                SELECT count(*)
                  FROM public.social_comments AS sc
                 WHERE sc.post_id = sp.id
                   AND sc.deleted_at IS NULL
            ), 0) AS comment_count,
            COALESCE((
                SELECT count(*)
                  FROM public.social_post_reactions AS spr
                 WHERE spr.post_id = sp.id
                   AND spr.reaction_type = 'repost'
            ), 0) AS repost_count,
            EXISTS (
                SELECT 1
                  FROM public.social_post_reactions AS spr
                 WHERE spr.post_id = sp.id
                   AND spr.citizen_id = v_current_citizen_id
                   AND spr.reaction_type = 'like'
            ) AS liked_by_current_user,
            EXISTS (
                SELECT 1
                  FROM public.social_post_reactions AS spr
                 WHERE spr.post_id = sp.id
                   AND spr.citizen_id = v_current_citizen_id
                   AND spr.reaction_type = 'repost'
            ) AS reposted_by_current_user,
            EXISTS (
                SELECT 1
                  FROM public.social_follows AS sf
                 WHERE sf.follower_citizen_id = v_current_citizen_id
                   AND sf.following_citizen_id = sp.citizen_id
            ) AS current_user_following_author,
            (sp.citizen_id = v_current_citizen_id) AS is_own_post
        FROM public.social_posts AS sp
        JOIN public.citizens AS author
          ON author.id = sp.citizen_id
        WHERE sp.deleted_at IS NULL
    )
    SELECT jsonb_build_object(
        'id', vp.id,
        'content', vp.content,
        'created_at', vp.created_at,
        'updated_at', vp.updated_at,
        'author', jsonb_build_object(
            'id', vp.author_citizen_id,
            'public_name', vp.public_name,
            'avatar_url', vp.author_avatar_url
        ),
        'like_count', vp.like_count,
        'comment_count', vp.comment_count,
        'repost_count', vp.repost_count,
        'liked_by_current_user', vp.liked_by_current_user,
        'reposted_by_current_user', vp.reposted_by_current_user,
        'current_user_following_author', vp.current_user_following_author,
        'is_own_post', vp.is_own_post
    )
      FROM visible_posts AS vp
     ORDER BY vp.created_at DESC, vp.id ASC
     LIMIT v_limit
    OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_following_feed(p_limit integer, p_offset integer)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_citizen_id uuid;
    v_limit integer := p_limit;
    v_offset integer := p_offset;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required for feed access.';
    END IF;

    IF v_limit IS NULL OR v_limit < 1 OR v_limit > 50 THEN
        RAISE EXCEPTION 'p_limit must be between 1 and 50.';
    END IF;

    IF v_offset IS NULL OR v_offset < 0 THEN
        RAISE EXCEPTION 'p_offset must be non-negative.';
    END IF;

    SELECT c.id
      INTO v_current_citizen_id
      FROM public.citizens AS c
     WHERE c.auth_user_id = auth.uid()
     LIMIT 1;

    IF v_current_citizen_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH visible_posts AS (
        SELECT
            sp.id,
            sp.citizen_id AS author_citizen_id,
            sp.content,
            sp.created_at,
            sp.updated_at,
            author.public_name,
            CASE
                WHEN author.avatar_url = './assets/avatars/aurelia-voss.svg'
                  OR author.avatar_url = './assets/avatars/jasper-reed.svg'
                  OR author.avatar_url = './assets/avatars/mira-sloane.svg'
                  OR author.avatar_url = './assets/avatars/dorian-kestrel.svg'
                  OR author.avatar_url = './assets/avatars/leah-cortez.svg'
                  OR author.avatar_url = './assets/avatars/omar-tate.svg'
                    THEN author.avatar_url
                ELSE './assets/avatars/aurelia-voss.svg'
            END AS author_avatar_url,
            COALESCE((
                SELECT count(*)
                  FROM public.social_post_reactions AS spr
                 WHERE spr.post_id = sp.id
                   AND spr.reaction_type = 'like'
            ), 0) AS like_count,
            COALESCE((
                SELECT count(*)
                  FROM public.social_comments AS sc
                 WHERE sc.post_id = sp.id
                   AND sc.deleted_at IS NULL
            ), 0) AS comment_count,
            COALESCE((
                SELECT count(*)
                  FROM public.social_post_reactions AS spr
                 WHERE spr.post_id = sp.id
                   AND spr.reaction_type = 'repost'
            ), 0) AS repost_count,
            EXISTS (
                SELECT 1
                  FROM public.social_post_reactions AS spr
                 WHERE spr.post_id = sp.id
                   AND spr.citizen_id = v_current_citizen_id
                   AND spr.reaction_type = 'like'
            ) AS liked_by_current_user,
            EXISTS (
                SELECT 1
                  FROM public.social_post_reactions AS spr
                 WHERE spr.post_id = sp.id
                   AND spr.citizen_id = v_current_citizen_id
                   AND spr.reaction_type = 'repost'
            ) AS reposted_by_current_user,
            EXISTS (
                SELECT 1
                  FROM public.social_follows AS sf
                 WHERE sf.follower_citizen_id = v_current_citizen_id
                   AND sf.following_citizen_id = sp.citizen_id
            ) AS current_user_following_author,
            (sp.citizen_id = v_current_citizen_id) AS is_own_post
        FROM public.social_posts AS sp
        JOIN public.citizens AS author
          ON author.id = sp.citizen_id
        WHERE sp.deleted_at IS NULL
          AND (
              sp.citizen_id = v_current_citizen_id
              OR EXISTS (
                  SELECT 1
                    FROM public.social_follows AS sf
                   WHERE sf.follower_citizen_id = v_current_citizen_id
                     AND sf.following_citizen_id = sp.citizen_id
              )
          )
    )
    SELECT jsonb_build_object(
        'id', vp.id,
        'content', vp.content,
        'created_at', vp.created_at,
        'updated_at', vp.updated_at,
        'author', jsonb_build_object(
            'id', vp.author_citizen_id,
            'public_name', vp.public_name,
            'avatar_url', vp.author_avatar_url
        ),
        'like_count', vp.like_count,
        'comment_count', vp.comment_count,
        'repost_count', vp.repost_count,
        'liked_by_current_user', vp.liked_by_current_user,
        'reposted_by_current_user', vp.reposted_by_current_user,
        'current_user_following_author', vp.current_user_following_author,
        'is_own_post', vp.is_own_post
    )
      FROM visible_posts AS vp
     ORDER BY vp.created_at DESC, vp.id ASC
     LIMIT v_limit
    OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_trending_feed(p_limit integer, p_offset integer)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_citizen_id uuid;
    v_limit integer := p_limit;
    v_offset integer := p_offset;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required for feed access.';
    END IF;

    IF v_limit IS NULL OR v_limit < 1 OR v_limit > 50 THEN
        RAISE EXCEPTION 'p_limit must be between 1 and 50.';
    END IF;

    IF v_offset IS NULL OR v_offset < 0 THEN
        RAISE EXCEPTION 'p_offset must be non-negative.';
    END IF;

    SELECT c.id
      INTO v_current_citizen_id
      FROM public.citizens AS c
     WHERE c.auth_user_id = auth.uid()
     LIMIT 1;

    IF v_current_citizen_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH visible_posts AS (
        SELECT
            sp.id,
            sp.citizen_id AS author_citizen_id,
            sp.content,
            sp.created_at,
            sp.updated_at,
            author.public_name,
            CASE
                WHEN author.avatar_url = './assets/avatars/aurelia-voss.svg'
                  OR author.avatar_url = './assets/avatars/jasper-reed.svg'
                  OR author.avatar_url = './assets/avatars/mira-sloane.svg'
                  OR author.avatar_url = './assets/avatars/dorian-kestrel.svg'
                  OR author.avatar_url = './assets/avatars/leah-cortez.svg'
                  OR author.avatar_url = './assets/avatars/omar-tate.svg'
                    THEN author.avatar_url
                ELSE './assets/avatars/aurelia-voss.svg'
            END AS author_avatar_url,
            COALESCE((
                SELECT count(*)
                  FROM public.social_post_reactions AS spr
                 WHERE spr.post_id = sp.id
                   AND spr.reaction_type = 'like'
            ), 0) AS like_count,
            COALESCE((
                SELECT count(*)
                  FROM public.social_comments AS sc
                 WHERE sc.post_id = sp.id
                   AND sc.deleted_at IS NULL
            ), 0) AS comment_count,
            COALESCE((
                SELECT count(*)
                  FROM public.social_post_reactions AS spr
                 WHERE spr.post_id = sp.id
                   AND spr.reaction_type = 'repost'
            ), 0) AS repost_count,
            EXISTS (
                SELECT 1
                  FROM public.social_post_reactions AS spr
                 WHERE spr.post_id = sp.id
                   AND spr.citizen_id = v_current_citizen_id
                   AND spr.reaction_type = 'like'
            ) AS liked_by_current_user,
            EXISTS (
                SELECT 1
                  FROM public.social_post_reactions AS spr
                 WHERE spr.post_id = sp.id
                   AND spr.citizen_id = v_current_citizen_id
                   AND spr.reaction_type = 'repost'
            ) AS reposted_by_current_user,
            EXISTS (
                SELECT 1
                  FROM public.social_follows AS sf
                 WHERE sf.follower_citizen_id = v_current_citizen_id
                   AND sf.following_citizen_id = sp.citizen_id
            ) AS current_user_following_author,
            (sp.citizen_id = v_current_citizen_id) AS is_own_post,
            EXTRACT(EPOCH FROM (now() - sp.created_at)) / 3600.0 AS age_hours
        FROM public.social_posts AS sp
        JOIN public.citizens AS author
          ON author.id = sp.citizen_id
        WHERE sp.deleted_at IS NULL
          AND sp.created_at >= (now() - interval '24 hours')
    )
    SELECT jsonb_build_object(
        'id', vp.id,
        'content', vp.content,
        'created_at', vp.created_at,
        'updated_at', vp.updated_at,
        'author', jsonb_build_object(
            'id', vp.author_citizen_id,
            'public_name', vp.public_name,
            'avatar_url', vp.author_avatar_url
        ),
        'like_count', vp.like_count,
        'comment_count', vp.comment_count,
        'repost_count', vp.repost_count,
        'liked_by_current_user', vp.liked_by_current_user,
        'reposted_by_current_user', vp.reposted_by_current_user,
        'current_user_following_author', vp.current_user_following_author,
        'is_own_post', vp.is_own_post
    )
      FROM visible_posts AS vp
     ORDER BY (
          ((vp.like_count * 1.25) + (vp.comment_count * 2.3) + (vp.repost_count * 3.5))
          * LEAST(1.0, GREATEST(0.0, 1.0 - (vp.age_hours / 24.0)))
      ) DESC,
      vp.created_at DESC,
      vp.id ASC
     LIMIT v_limit
    OFFSET v_offset;
END;
$$;

ALTER FUNCTION public.get_latest_feed(integer, integer) OWNER TO postgres;
ALTER FUNCTION public.get_following_feed(integer, integer) OWNER TO postgres;
ALTER FUNCTION public.get_trending_feed(integer, integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_latest_feed(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_latest_feed(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_latest_feed(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_feed(integer, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.get_following_feed(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_following_feed(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_following_feed(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_following_feed(integer, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.get_trending_feed(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_trending_feed(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_trending_feed(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_trending_feed(integer, integer) TO authenticated;

COMMIT;
