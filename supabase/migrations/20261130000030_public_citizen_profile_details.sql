-- Expose the target citizen's current employment, social class, and education
-- through the existing authenticated public-profile lookup. No balance or other
-- citizen_private fields are returned, and table grants/RLS remain unchanged.
BEGIN;

DROP FUNCTION IF EXISTS public.get_citizen_social_profile(uuid);

CREATE OR REPLACE FUNCTION public.get_citizen_social_profile(p_citizen_id uuid)
RETURNS TABLE (
    citizen_id uuid,
    public_name text,
    handle text,
    avatar_url text,
    political_party text,
    profession text,
    social_class text,
    education text,
    registration_date timestamptz,
    follower_count bigint,
    following_count bigint,
    current_user_following boolean,
    is_own_profile boolean,
    posts jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_citizen_id uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
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
    WITH target_profile AS (
        SELECT
            c.id AS citizen_id,
            c.public_name,
            ch.handle,
            CASE
                WHEN c.avatar_url = './assets/avatars/aurelia-voss.svg'
                  OR c.avatar_url = './assets/avatars/jasper-reed.svg'
                  OR c.avatar_url = './assets/avatars/mira-sloane.svg'
                  OR c.avatar_url = './assets/avatars/dorian-kestrel.svg'
                  OR c.avatar_url = './assets/avatars/leah-cortez.svg'
                  OR c.avatar_url = './assets/avatars/omar-tate.svg'
                    THEN c.avatar_url
                ELSE './assets/avatars/aurelia-voss.svg'
            END AS avatar_url,
            c.political_party,
            cp.profession,
            cp.social_class,
            cp.education,
            c.registration_date,
            (SELECT count(*)::bigint FROM public.social_follows AS sf WHERE sf.following_citizen_id = c.id) AS follower_count,
            (SELECT count(*)::bigint FROM public.social_follows AS sf WHERE sf.follower_citizen_id = c.id) AS following_count,
            EXISTS (SELECT 1 FROM public.social_follows AS sf WHERE sf.follower_citizen_id = v_current_citizen_id AND sf.following_citizen_id = c.id) AS current_user_following,
            (c.id = v_current_citizen_id) AS is_own_profile
        FROM public.citizens AS c
        LEFT JOIN public.citizen_social_handles AS ch
          ON ch.citizen_id = c.id
        LEFT JOIN public.citizen_private AS cp
          ON cp.citizen_id = c.id
        WHERE c.id = p_citizen_id
    ),
    selected_posts AS (
        SELECT
            sp.id,
            sp.content,
            sp.created_at,
            sp.updated_at,
            sp.citizen_id AS author_citizen_id,
            author.public_name AS author_public_name,
            ch.handle AS author_handle,
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
            (SELECT count(*) FROM public.social_post_reactions AS spr WHERE spr.post_id = sp.id AND spr.reaction_type = 'like') AS like_count,
            (SELECT count(*) FROM public.social_comments AS sc WHERE sc.post_id = sp.id AND sc.deleted_at IS NULL) AS comment_count,
            (SELECT count(*) FROM public.social_post_reactions AS spr WHERE spr.post_id = sp.id AND spr.reaction_type = 'repost') AS repost_count,
            EXISTS (SELECT 1 FROM public.social_post_reactions AS spr WHERE spr.post_id = sp.id AND spr.citizen_id = v_current_citizen_id AND spr.reaction_type = 'like') AS liked_by_current_user,
            EXISTS (SELECT 1 FROM public.social_post_reactions AS spr WHERE spr.post_id = sp.id AND spr.citizen_id = v_current_citizen_id AND spr.reaction_type = 'repost') AS reposted_by_current_user,
            EXISTS (SELECT 1 FROM public.social_follows AS sf WHERE sf.follower_citizen_id = v_current_citizen_id AND sf.following_citizen_id = sp.citizen_id) AS current_user_following_author,
            (sp.citizen_id = v_current_citizen_id) AS is_own_post
        FROM public.social_posts AS sp
        JOIN public.citizens AS author
          ON author.id = sp.citizen_id
        LEFT JOIN public.citizen_social_handles AS ch
          ON ch.citizen_id = sp.citizen_id
        WHERE sp.citizen_id = p_citizen_id
          AND sp.deleted_at IS NULL
        ORDER BY sp.created_at DESC, sp.id DESC
        LIMIT 20
    ),
    posts_json AS (
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', sp.id,
                    'content', sp.content,
                    'created_at', sp.created_at,
                    'updated_at', sp.updated_at,
                    'author', jsonb_build_object(
                        'id', sp.author_citizen_id,
                        'public_name', sp.author_public_name,
                        'avatar_url', sp.author_avatar_url,
                        'handle', sp.author_handle
                    ),
                    'author_handle', sp.author_handle,
                    'like_count', sp.like_count,
                    'comment_count', sp.comment_count,
                    'repost_count', sp.repost_count,
                    'liked_by_current_user', sp.liked_by_current_user,
                    'reposted_by_current_user', sp.reposted_by_current_user,
                    'current_user_following_author', sp.current_user_following_author,
                    'is_own_post', sp.is_own_post
                )
                ORDER BY sp.created_at DESC, sp.id DESC
            ),
            '[]'::jsonb
        ) AS posts
        FROM selected_posts AS sp
    )
    SELECT
        tp.citizen_id,
        tp.public_name,
        tp.handle,
        tp.avatar_url,
        tp.political_party,
        tp.profession,
        tp.social_class,
        tp.education,
        tp.registration_date,
        tp.follower_count,
        tp.following_count,
        tp.current_user_following,
        tp.is_own_profile,
        pj.posts
    FROM target_profile AS tp
    CROSS JOIN posts_json AS pj
    WHERE tp.citizen_id = p_citizen_id;
END;
$$;

ALTER FUNCTION public.get_citizen_social_profile(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_citizen_social_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_citizen_social_profile(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_citizen_social_profile(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_citizen_social_profile(uuid) TO authenticated;


COMMIT;
