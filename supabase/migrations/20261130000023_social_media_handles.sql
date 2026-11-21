BEGIN;

CREATE TABLE IF NOT EXISTS public.citizen_social_handles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_id uuid NOT NULL UNIQUE REFERENCES public.citizens(id) ON DELETE CASCADE,
    handle text NOT NULL,
    normalized_handle text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (length(trim(handle)) BETWEEN 3 AND 20),
    CHECK (trim(handle) ~ '^[a-z0-9_]{3,20}$'),
    CHECK (normalized_handle = lower(trim(handle))),
    CHECK (normalized_handle ~ '^[a-z0-9_]{3,20}$')
);

ALTER TABLE public.citizen_social_handles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.citizen_social_handles FROM PUBLIC;
REVOKE ALL ON TABLE public.citizen_social_handles FROM anon;
REVOKE ALL ON TABLE public.citizen_social_handles FROM authenticated;

GRANT SELECT ON TABLE public.citizen_social_handles TO service_role;
GRANT INSERT (citizen_id, handle, normalized_handle) ON TABLE public.citizen_social_handles TO service_role;

CREATE TABLE IF NOT EXISTS public.social_handle_blocklist (
    word text PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public.social_handle_reserved_names (
    name text PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public.social_handle_prohibited_terms (
    term text PRIMARY KEY,
    match_mode text NOT NULL DEFAULT 'exact' CHECK (match_mode IN ('exact', 'contains')),
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.social_handle_blocklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_handle_reserved_names ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_handle_prohibited_terms ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.social_handle_blocklist FROM PUBLIC;
REVOKE ALL ON TABLE public.social_handle_blocklist FROM anon;
REVOKE ALL ON TABLE public.social_handle_blocklist FROM authenticated;
REVOKE ALL ON TABLE public.social_handle_reserved_names FROM PUBLIC;
REVOKE ALL ON TABLE public.social_handle_reserved_names FROM anon;
REVOKE ALL ON TABLE public.social_handle_reserved_names FROM authenticated;
REVOKE ALL ON TABLE public.social_handle_prohibited_terms FROM PUBLIC;
REVOKE ALL ON TABLE public.social_handle_prohibited_terms FROM anon;
REVOKE ALL ON TABLE public.social_handle_prohibited_terms FROM authenticated;

GRANT SELECT ON TABLE public.social_handle_blocklist TO service_role;
GRANT SELECT ON TABLE public.social_handle_reserved_names TO service_role;
GRANT SELECT ON TABLE public.social_handle_prohibited_terms TO service_role;

INSERT INTO public.social_handle_blocklist (word)
VALUES
    ('admin'),
    ('administrator'),
    ('moderator'),
    ('staff'),
    ('owner'),
    ('support'),
    ('system'),
    ('bot'),
    ('tyranny'),
    ('tyrannydaily'),
    ('news'),
    ('official'),
    ('city'),
    ('gov'),
    ('government'),
    ('police'),
    ('auth'),
    ('login'),
    ('register'),
    ('service'),
    ('help')
ON CONFLICT (word) DO NOTHING;

INSERT INTO public.social_handle_reserved_names (name)
VALUES
    ('admin'),
    ('administrator'),
    ('moderator'),
    ('staff'),
    ('owner'),
    ('support'),
    ('system'),
    ('official'),
    ('tyranny'),
    ('tyrannydaily'),
    ('news'),
    ('city'),
    ('gov'),
    ('government'),
    ('police'),
    ('service'),
    ('help')
ON CONFLICT (name) DO NOTHING;

-- Prohibited-term matching is intentionally conservative and explicit:
--  - exact matches block handles that are themselves banned terms
--  - contains matches block curated embedded terms used for explicit or impersonation-related abuse
--  - reserved identity names are handled separately by exact blocklist and reserved-name tables
--  - this list is a maintainable safety net, not an exhaustive content filter
INSERT INTO public.social_handle_prohibited_terms (term, match_mode)
VALUES
    ('nude', 'exact'),
    ('sex', 'exact'),
    ('sexual', 'exact'),
    ('explicit', 'contains'),
    ('porn', 'contains'),
    ('xxx', 'contains'),
    ('rape', 'exact'),
    ('fetish', 'contains'),
    ('scam', 'contains'),
    ('spam', 'contains'),
    ('fraud', 'contains'),
    ('impersonate', 'contains')
ON CONFLICT (term) DO NOTHING;

CREATE OR REPLACE FUNCTION public.social_normalize_handle(p_handle text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    v_value text;
BEGIN
    IF p_handle IS NULL THEN
        RETURN NULL;
    END IF;

    v_value := lower(trim(p_handle));
    IF v_value LIKE '@%' THEN
        v_value := substr(v_value, 2);
    END IF;

    IF v_value !~ '^[a-z0-9_]{3,20}$' THEN
        RETURN NULL;
    END IF;

    RETURN v_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.social_handle_is_allowed(p_handle text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_normalized text;
BEGIN
    v_normalized := public.social_normalize_handle(p_handle);
    IF v_normalized IS NULL THEN
        RETURN false;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.social_handle_blocklist AS block
         WHERE lower(block.word) = v_normalized
    ) THEN
        RETURN false;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.social_handle_reserved_names AS reserved
         WHERE lower(reserved.name) = v_normalized
    ) THEN
        RETURN false;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.social_handle_prohibited_terms AS prohibited
         WHERE char_length(trim(prohibited.term)) >= 3
           AND lower(trim(prohibited.term)) = lower(v_normalized)
           AND COALESCE(prohibited.match_mode, 'exact') = 'exact'
    ) THEN
        RETURN false;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.social_handle_prohibited_terms AS prohibited
         WHERE char_length(trim(prohibited.term)) >= 4
           AND lower(trim(prohibited.term)) <> ''
           AND COALESCE(prohibited.match_mode, 'exact') = 'contains'
           AND lower(v_normalized) LIKE '%' || lower(trim(prohibited.term)) || '%'
    ) THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$;

ALTER FUNCTION public.social_handle_is_allowed(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.social_handle_is_allowed(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.social_handle_is_allowed(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.social_handle_is_allowed(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_citizen_social_handle(p_handle text)
RETURNS TABLE (
    is_available boolean,
    normalized_handle text,
    message text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_normalized text;
BEGIN
    v_normalized := public.social_normalize_handle(p_handle);

    IF v_normalized IS NULL THEN
        RETURN QUERY
        SELECT false, NULL::text, 'Use 3-20 letters, numbers, or underscores only; no spaces or symbols.'::text;
        RETURN;
    END IF;

    IF NOT public.social_handle_is_allowed(v_normalized) THEN
        RETURN QUERY
        SELECT false, v_normalized, 'This handle is reserved or not allowed.'::text;
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.citizen_social_handles AS ch
         WHERE ch.normalized_handle = v_normalized
    ) THEN
        RETURN QUERY
        SELECT false, v_normalized, 'This handle is already claimed.'::text;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT true, v_normalized, 'Handle is available.'::text;
END;
$$;

ALTER FUNCTION public.check_citizen_social_handle(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.check_citizen_social_handle(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_citizen_social_handle(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_citizen_social_handle(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_current_citizen_social_handle()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT ch.handle
      FROM public.citizen_social_handles AS ch
      JOIN public.citizens AS c
        ON c.id = ch.citizen_id
     WHERE c.auth_user_id = auth.uid()
     LIMIT 1;
$$;

ALTER FUNCTION public.get_current_citizen_social_handle() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_current_citizen_social_handle() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_current_citizen_social_handle() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_current_citizen_social_handle() TO authenticated;

REVOKE ALL ON TABLE public.citizen_social_handles FROM PUBLIC;
REVOKE ALL ON TABLE public.citizen_social_handles FROM anon;
REVOKE ALL ON TABLE public.citizen_social_handles FROM authenticated;
GRANT SELECT ON TABLE public.citizen_social_handles TO service_role;
GRANT INSERT (citizen_id, handle, normalized_handle) ON TABLE public.citizen_social_handles TO service_role;

CREATE OR REPLACE FUNCTION public.register_citizen_social_handle(p_handle text)
RETURNS TABLE (
    success boolean,
    handle text,
    message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user uuid := auth.uid();
    v_citizen_id uuid;
    v_normalized text;
    v_existing_handle text;
BEGIN
    IF v_user IS NULL THEN
        RETURN QUERY
        SELECT false, NULL::text, 'Authentication is required to claim a handle.'::text;
        RETURN;
    END IF;

    SELECT c.id
      INTO v_citizen_id
      FROM public.citizens AS c
     WHERE c.auth_user_id = v_user
     LIMIT 1;

    IF v_citizen_id IS NULL THEN
        RETURN QUERY
        SELECT false, NULL::text, 'Citizen profile not found for this account.'::text;
        RETURN;
    END IF;

    v_normalized := public.social_normalize_handle(p_handle);
    IF v_normalized IS NULL THEN
        RETURN QUERY
        SELECT false, NULL::text, 'Choose a handle with 3-20 letters, numbers, or underscores only.'::text;
        RETURN;
    END IF;

    IF NOT public.social_handle_is_allowed(v_normalized) THEN
        RETURN QUERY
        SELECT false, v_normalized, 'This handle is reserved or not allowed.'::text;
        RETURN;
    END IF;

    SELECT ch.handle
      INTO v_existing_handle
      FROM public.citizen_social_handles AS ch
     WHERE ch.normalized_handle = v_normalized
     LIMIT 1;

    IF v_existing_handle IS NOT NULL THEN
        IF EXISTS (
            SELECT 1
              FROM public.citizen_social_handles AS ch
             WHERE ch.normalized_handle = v_normalized
               AND ch.citizen_id = v_citizen_id
        ) THEN
            RETURN QUERY
            SELECT true, v_existing_handle, 'You already have this handle.'::text;
            RETURN;
        END IF;

        RETURN QUERY
        SELECT false, v_normalized, 'This handle is already claimed.'::text;
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.citizen_social_handles AS ch
         WHERE ch.citizen_id = v_citizen_id
    ) THEN
        RETURN QUERY
        SELECT true, (SELECT ch.handle FROM public.citizen_social_handles AS ch WHERE ch.citizen_id = v_citizen_id LIMIT 1), 'Your handle is already registered and cannot be changed.'::text;
        RETURN;
    END IF;

    BEGIN
        INSERT INTO public.citizen_social_handles (
            citizen_id,
            handle,
            normalized_handle
        )
        VALUES (
            v_citizen_id,
            v_normalized,
            v_normalized
        );

        RETURN QUERY
        SELECT true, v_normalized, 'Handle registered.'::text;
    EXCEPTION
        WHEN unique_violation THEN
            IF EXISTS (
                SELECT 1
                  FROM public.citizen_social_handles AS ch
                 WHERE ch.citizen_id = v_citizen_id
            ) THEN
                RETURN QUERY
                SELECT true, (SELECT ch.handle FROM public.citizen_social_handles AS ch WHERE ch.citizen_id = v_citizen_id LIMIT 1), 'Your handle is already registered and cannot be changed.'::text;
                RETURN;
            END IF;

            RETURN QUERY
            SELECT false, v_normalized, 'This handle is already claimed.'::text;
    END;
END;
$$;

ALTER FUNCTION public.register_citizen_social_handle(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.register_citizen_social_handle(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_citizen_social_handle(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_citizen_social_handle(text) TO authenticated;

REVOKE ALL ON FUNCTION public.check_citizen_social_handle(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_citizen_social_handle(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_citizen_social_handle(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_citizen_social_handle_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Citizen handles are permanent and cannot be changed after registration.';
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF EXISTS (
            SELECT 1
              FROM public.citizens AS c
             WHERE c.id = OLD.citizen_id
        ) THEN
            RAISE EXCEPTION 'Citizen handles are permanent and cannot be changed after registration.';
        END IF;
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS citizen_social_handles_prevent_mutation ON public.citizen_social_handles;
CREATE TRIGGER citizen_social_handles_prevent_mutation
BEFORE UPDATE OR DELETE ON public.citizen_social_handles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_citizen_social_handle_mutation();

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
            COALESCE((SELECT count(*) FROM public.social_post_reactions AS spr WHERE spr.post_id = sp.id AND spr.reaction_type = 'like'), 0) AS like_count,
            COALESCE((SELECT count(*) FROM public.social_comments AS sc WHERE sc.post_id = sp.id AND sc.deleted_at IS NULL), 0) AS comment_count,
            COALESCE((SELECT count(*) FROM public.social_post_reactions AS spr WHERE spr.post_id = sp.id AND spr.reaction_type = 'repost'), 0) AS repost_count,
            EXISTS (SELECT 1 FROM public.social_post_reactions AS spr WHERE spr.post_id = sp.id AND spr.citizen_id = v_current_citizen_id AND spr.reaction_type = 'like') AS liked_by_current_user,
            EXISTS (SELECT 1 FROM public.social_post_reactions AS spr WHERE spr.post_id = sp.id AND spr.citizen_id = v_current_citizen_id AND spr.reaction_type = 'repost') AS reposted_by_current_user,
            EXISTS (SELECT 1 FROM public.social_follows AS sf WHERE sf.follower_citizen_id = v_current_citizen_id AND sf.following_citizen_id = sp.citizen_id) AS current_user_following_author,
            (sp.citizen_id = v_current_citizen_id) AS is_own_post
        FROM public.social_posts AS sp
        JOIN public.citizens AS author
          ON author.id = sp.citizen_id
        LEFT JOIN public.citizen_social_handles AS ch
          ON ch.citizen_id = sp.citizen_id
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
            'avatar_url', vp.author_avatar_url,
            'handle', vp.author_handle
        ),
        'author_handle', vp.author_handle,
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

ALTER FUNCTION public.get_latest_feed(integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_latest_feed(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_latest_feed(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_latest_feed(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_feed(integer, integer) TO authenticated;

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
            COALESCE((SELECT count(*) FROM public.social_post_reactions AS spr WHERE spr.post_id = sp.id AND spr.reaction_type = 'like'), 0) AS like_count,
            COALESCE((SELECT count(*) FROM public.social_comments AS sc WHERE sc.post_id = sp.id AND sc.deleted_at IS NULL), 0) AS comment_count,
            COALESCE((SELECT count(*) FROM public.social_post_reactions AS spr WHERE spr.post_id = sp.id AND spr.reaction_type = 'repost'), 0) AS repost_count,
            EXISTS (SELECT 1 FROM public.social_post_reactions AS spr WHERE spr.post_id = sp.id AND spr.citizen_id = v_current_citizen_id AND spr.reaction_type = 'like') AS liked_by_current_user,
            EXISTS (SELECT 1 FROM public.social_post_reactions AS spr WHERE spr.post_id = sp.id AND spr.citizen_id = v_current_citizen_id AND spr.reaction_type = 'repost') AS reposted_by_current_user,
            EXISTS (SELECT 1 FROM public.social_follows AS sf WHERE sf.follower_citizen_id = v_current_citizen_id AND sf.following_citizen_id = sp.citizen_id) AS current_user_following_author,
            (sp.citizen_id = v_current_citizen_id) AS is_own_post
        FROM public.social_posts AS sp
        JOIN public.citizens AS author
          ON author.id = sp.citizen_id
        LEFT JOIN public.citizen_social_handles AS ch
          ON ch.citizen_id = sp.citizen_id
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
            'avatar_url', vp.author_avatar_url,
            'handle', vp.author_handle
        ),
        'author_handle', vp.author_handle,
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

ALTER FUNCTION public.get_following_feed(integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_following_feed(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_following_feed(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_following_feed(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_following_feed(integer, integer) TO authenticated;

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
            COALESCE((SELECT count(*) FROM public.social_post_reactions AS spr WHERE spr.post_id = sp.id AND spr.reaction_type = 'like'), 0) AS like_count,
            COALESCE((SELECT count(*) FROM public.social_comments AS sc WHERE sc.post_id = sp.id AND sc.deleted_at IS NULL), 0) AS comment_count,
            COALESCE((SELECT count(*) FROM public.social_post_reactions AS spr WHERE spr.post_id = sp.id AND spr.reaction_type = 'repost'), 0) AS repost_count,
            EXISTS (SELECT 1 FROM public.social_post_reactions AS spr WHERE spr.post_id = sp.id AND spr.citizen_id = v_current_citizen_id AND spr.reaction_type = 'like') AS liked_by_current_user,
            EXISTS (SELECT 1 FROM public.social_post_reactions AS spr WHERE spr.post_id = sp.id AND spr.citizen_id = v_current_citizen_id AND spr.reaction_type = 'repost') AS reposted_by_current_user,
            EXISTS (SELECT 1 FROM public.social_follows AS sf WHERE sf.follower_citizen_id = v_current_citizen_id AND sf.following_citizen_id = sp.citizen_id) AS current_user_following_author,
            (sp.citizen_id = v_current_citizen_id) AS is_own_post,
            EXTRACT(EPOCH FROM (now() - sp.created_at)) / 3600.0 AS age_hours
        FROM public.social_posts AS sp
        JOIN public.citizens AS author
          ON author.id = sp.citizen_id
        LEFT JOIN public.citizen_social_handles AS ch
          ON ch.citizen_id = sp.citizen_id
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
            'avatar_url', vp.author_avatar_url,
            'handle', vp.author_handle
        ),
        'author_handle', vp.author_handle,
        'like_count', vp.like_count,
        'comment_count', vp.comment_count,
        'repost_count', vp.repost_count,
        'liked_by_current_user', vp.liked_by_current_user,
        'reposted_by_current_user', vp.reposted_by_current_user,
        'current_user_following_author', vp.current_user_following_author,
        'is_own_post', vp.is_own_post
    )
    FROM visible_posts AS vp
    ORDER BY (((vp.like_count * 1.25) + (vp.comment_count * 2.3) + (vp.repost_count * 3.5)) * LEAST(1.0, GREATEST(0.0, 1.0 - (vp.age_hours / 24.0)))) DESC,
         vp.created_at DESC,
         vp.id ASC
    LIMIT v_limit
    OFFSET v_offset;
END;
$$;

ALTER FUNCTION public.get_trending_feed(integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_trending_feed(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_trending_feed(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_trending_feed(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_trending_feed(integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_post_comments(
    p_post_id uuid,
    p_limit integer default 25,
    p_offset integer default 0
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_citizen_id uuid;
    v_limit integer := coalesce(p_limit, 25);
    v_offset integer := coalesce(p_offset, 0);
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required to view comments.';
    END IF;

    v_current_citizen_id := public.social_current_citizen_id();
    IF v_current_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Authenticated citizen record not found for social comments.';
    END IF;

    IF p_post_id IS NULL THEN
        RAISE EXCEPTION 'Post ID is required.';
    END IF;

    IF v_limit IS NULL OR v_limit < 1 OR v_limit > 25 THEN
        RAISE EXCEPTION 'p_limit must be between 1 and 25.';
    END IF;

    IF v_offset IS NULL OR v_offset < 0 THEN
        RAISE EXCEPTION 'p_offset must be non-negative.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.social_posts AS sp
         WHERE sp.id = p_post_id
           AND sp.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Cannot retrieve comments for a deleted or missing post.';
    END IF;

    RETURN QUERY
    SELECT jsonb_build_object(
        'id', sc.id,
        'post_id', sc.post_id,
        'content', sc.content,
        'created_at', sc.created_at,
        'updated_at', sc.updated_at,
        'author_citizen_id', sc.citizen_id,
        'author_public_name', author.public_name,
        'author_handle', ch.handle,
        'author_avatar_url', CASE
            WHEN author.avatar_url = './assets/avatars/aurelia-voss.svg'
              OR author.avatar_url = './assets/avatars/jasper-reed.svg'
              OR author.avatar_url = './assets/avatars/mira-sloane.svg'
              OR author.avatar_url = './assets/avatars/dorian-kestrel.svg'
              OR author.avatar_url = './assets/avatars/leah-cortez.svg'
              OR author.avatar_url = './assets/avatars/omar-tate.svg'
                THEN author.avatar_url
            ELSE './assets/avatars/aurelia-voss.svg'
        END
    )
    FROM public.social_comments AS sc
    JOIN public.citizens AS author
      ON author.id = sc.citizen_id
    LEFT JOIN public.citizen_social_handles AS ch
      ON ch.citizen_id = sc.citizen_id
    WHERE sc.post_id = p_post_id
      AND sc.deleted_at IS NULL
      AND sc.parent_comment_id IS NULL
      AND EXISTS (
          SELECT 1
            FROM public.social_posts AS sp
           WHERE sp.id = sc.post_id
             AND sp.deleted_at IS NULL
      )
    ORDER BY sc.created_at ASC, sc.id ASC
    LIMIT v_limit OFFSET v_offset;
END;
$$;

ALTER FUNCTION public.get_post_comments(uuid, integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_post_comments(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_post_comments(uuid, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_post_comments(uuid, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_post_comments(uuid, integer, integer) TO authenticated;

DROP FUNCTION IF EXISTS public.get_citizen_social_profile(uuid);

CREATE OR REPLACE FUNCTION public.get_citizen_social_profile(p_citizen_id uuid)
RETURNS TABLE (
    citizen_id uuid,
    public_name text,
    handle text,
    avatar_url text,
    political_party text,
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
            c.registration_date,
            (SELECT count(*)::bigint FROM public.social_follows AS sf WHERE sf.following_citizen_id = c.id) AS follower_count,
            (SELECT count(*)::bigint FROM public.social_follows AS sf WHERE sf.follower_citizen_id = c.id) AS following_count,
            EXISTS (SELECT 1 FROM public.social_follows AS sf WHERE sf.follower_citizen_id = v_current_citizen_id AND sf.following_citizen_id = c.id) AS current_user_following,
            (c.id = v_current_citizen_id) AS is_own_profile
        FROM public.citizens AS c
        LEFT JOIN public.citizen_social_handles AS ch
          ON ch.citizen_id = c.id
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
