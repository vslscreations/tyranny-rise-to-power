BEGIN;

CREATE TABLE IF NOT EXISTS public.news_articles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE,
    headline text NOT NULL CHECK (length(trim(headline)) > 0),
    excerpt text NOT NULL DEFAULT '',
    featured_image_url text NULL,
    content_html text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    author_citizen_id uuid NULL REFERENCES public.citizens(id) ON DELETE SET NULL,
    published_by_citizen_id uuid NULL REFERENCES public.citizens(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS news_articles_status_published_idx
    ON public.news_articles (status, published_at DESC NULLS LAST, created_at DESC);

CREATE INDEX IF NOT EXISTS news_articles_updated_idx
    ON public.news_articles (updated_at DESC);

ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.news_articles FROM PUBLIC;
REVOKE ALL ON TABLE public.news_articles FROM anon;
REVOKE ALL ON TABLE public.news_articles FROM authenticated;
REVOKE ALL ON TABLE public.news_articles FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.news_articles TO service_role;

CREATE OR REPLACE FUNCTION public.slugify_news_article(p_value text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT lower(
        regexp_replace(
            regexp_replace(
                regexp_replace(trim(coalesce(p_value, '')),
                    '[^a-zA-Z0-9\\s-]+', '', 'g'),
                '\\s+', '-', 'g'
            ),
            '-+', '-', 'g'
        )
    );
$$;

ALTER FUNCTION public.slugify_news_article(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.slugify_news_article(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.slugify_news_article(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.slugify_news_article(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_newsroom_moderator_for_authenticated_user()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
    v_citizen_id uuid;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL THEN
        RETURN false;
    END IF;

    SELECT c.id
      INTO v_citizen_id
      FROM public.citizens AS c
     WHERE c.auth_user_id = v_user
     LIMIT 1;

    IF v_citizen_id IS NULL THEN
        RETURN false;
    END IF;

    RETURN EXISTS (
        SELECT 1
          FROM public.moneytree_moderators AS mm
         WHERE mm.citizen_id = v_citizen_id
    );
END;
$$;

ALTER FUNCTION public.is_newsroom_moderator_for_authenticated_user() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_newsroom_moderator_for_authenticated_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_newsroom_moderator_for_authenticated_user() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_newsroom_moderator_for_authenticated_user() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_published_news_articles()
RETURNS TABLE (
    id uuid,
    slug text,
    headline text,
    excerpt text,
    featured_image_url text,
    content_html text,
    status text,
    author_citizen_id uuid,
    published_by_citizen_id uuid,
    created_at timestamptz,
    updated_at timestamptz,
    published_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id,
        a.slug,
        a.headline,
        a.excerpt,
        a.featured_image_url,
        a.content_html,
        a.status,
        a.author_citizen_id,
        a.published_by_citizen_id,
        a.created_at,
        a.updated_at,
        a.published_at
    FROM public.news_articles AS a
    WHERE a.status = 'published'
    ORDER BY a.published_at DESC NULLS LAST, a.created_at DESC;
END;
$$;

ALTER FUNCTION public.get_published_news_articles() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_published_news_articles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_published_news_articles() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_published_news_articles() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_newsroom_articles_for_moderator()
RETURNS TABLE (
    id uuid,
    slug text,
    headline text,
    excerpt text,
    featured_image_url text,
    content_html text,
    status text,
    author_citizen_id uuid,
    published_by_citizen_id uuid,
    created_at timestamptz,
    updated_at timestamptz,
    published_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
    v_citizen_id uuid;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
    END IF;

    SELECT c.id
      INTO v_citizen_id
      FROM public.citizens AS c
     WHERE c.auth_user_id = v_user
     LIMIT 1;

    IF v_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Citizen record not found.' USING ERRCODE = '23503';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.moneytree_moderators AS mm
         WHERE mm.citizen_id = v_citizen_id
    ) THEN
        RAISE EXCEPTION 'Moderator access required.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        a.id,
        a.slug,
        a.headline,
        a.excerpt,
        a.featured_image_url,
        a.content_html,
        a.status,
        a.author_citizen_id,
        a.published_by_citizen_id,
        a.created_at,
        a.updated_at,
        a.published_at
    FROM public.news_articles AS a
    ORDER BY
        CASE WHEN a.status = 'published' THEN 1 ELSE 0 END DESC,
        a.published_at DESC NULLS LAST,
        a.updated_at DESC;
END;
$$;

ALTER FUNCTION public.get_newsroom_articles_for_moderator() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_newsroom_articles_for_moderator() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_newsroom_articles_for_moderator() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_newsroom_articles_for_moderator() TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_news_article(
    p_id uuid DEFAULT NULL,
    p_headline text DEFAULT NULL,
    p_excerpt text DEFAULT NULL,
    p_featured_image_url text DEFAULT NULL,
    p_content_html text DEFAULT NULL,
    p_status text DEFAULT 'draft'
)
RETURNS TABLE (
    article_id uuid,
    status text,
    result text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
    v_citizen_id uuid;
    v_headline text;
    v_excerpt text;
    v_content text;
    v_status text;
    v_slug text;
    v_row public.news_articles%ROWTYPE;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
    END IF;

    SELECT c.id
      INTO v_citizen_id
      FROM public.citizens AS c
     WHERE c.auth_user_id = v_user
     LIMIT 1;

    IF v_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Citizen record not found.' USING ERRCODE = '23503';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.moneytree_moderators AS mm
         WHERE mm.citizen_id = v_citizen_id
    ) THEN
        RAISE EXCEPTION 'Moderator access required.' USING ERRCODE = '42501';
    END IF;

    v_headline := NULLIF(trim(coalesce(p_headline, '')), '');
    IF v_headline IS NULL THEN
        RAISE EXCEPTION 'Headline is required.' USING ERRCODE = '23514';
    END IF;

    v_content := coalesce(p_content_html, '');
    IF length(trim(v_content)) = 0 THEN
        RAISE EXCEPTION 'Content is required.' USING ERRCODE = '23514';
    END IF;

    v_status := lower(coalesce(p_status, 'draft'));
    IF v_status NOT IN ('draft', 'published', 'archived') THEN
        v_status := 'draft';
    END IF;

    v_excerpt := NULLIF(trim(coalesce(p_excerpt, '')), '');
    IF v_excerpt IS NULL THEN
        v_excerpt := left(regexp_replace(regexp_replace(trim(v_content), '<[^>]*>', ' ', 'g'), '\\s+', ' ', 'g'), 180);
    END IF;

    IF p_id IS NULL THEN
        v_slug := public.slugify_news_article(v_headline);
        IF v_slug IS NULL OR v_slug = '' THEN
            v_slug := 'news-article';
        END IF;

        INSERT INTO public.news_articles (
            slug,
            headline,
            excerpt,
            featured_image_url,
            content_html,
            status,
            author_citizen_id,
            published_by_citizen_id,
            published_at
        )
        VALUES (
            v_slug || '-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 6),
            v_headline,
            v_excerpt,
            NULLIF(trim(coalesce(p_featured_image_url, '')), ''),
            v_content,
            v_status,
            v_citizen_id,
            CASE WHEN v_status = 'published' THEN v_citizen_id ELSE NULL END,
            CASE WHEN v_status = 'published' THEN now() ELSE NULL END
        )
        RETURNING * INTO v_row;
    ELSE
        UPDATE public.news_articles AS a
           SET headline = v_headline,
               excerpt = v_excerpt,
               featured_image_url = NULLIF(trim(coalesce(p_featured_image_url, '')), ''),
               content_html = v_content,
               status = v_status,
               updated_at = now(),
               published_by_citizen_id = CASE WHEN v_status = 'published' THEN v_citizen_id ELSE a.published_by_citizen_id END,
               published_at = CASE
                   WHEN v_status = 'published' AND a.published_at IS NULL THEN now()
                   WHEN v_status = 'published' THEN a.published_at
                   ELSE NULL
               END
         WHERE a.id = p_id
         RETURNING * INTO v_row;

        IF v_row.id IS NULL THEN
            RAISE EXCEPTION 'Article not found.' USING ERRCODE = '23503';
        END IF;
    END IF;

    RETURN QUERY
    SELECT v_row.id, v_row.status, CASE WHEN v_row.status = 'published' THEN 'published' ELSE 'saved' END::text;
END;
$$;

ALTER FUNCTION public.upsert_news_article(uuid, text, text, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.upsert_news_article(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_news_article(uuid, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_news_article(uuid, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.newsroom_article_is_visible_to_authenticated_user()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN auth.role() = 'authenticated';
END;
$$;

ALTER FUNCTION public.newsroom_article_is_visible_to_authenticated_user() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.newsroom_article_is_visible_to_authenticated_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.newsroom_article_is_visible_to_authenticated_user() FROM anon;
GRANT EXECUTE ON FUNCTION public.newsroom_article_is_visible_to_authenticated_user() TO authenticated;

CREATE POLICY newsroom_articles_select_public
    ON public.news_articles
    FOR SELECT
    TO authenticated
    USING (status = 'published');

CREATE POLICY newsroom_articles_select_moderator
    ON public.news_articles
    FOR SELECT
    TO authenticated
    USING (public.is_newsroom_moderator_for_authenticated_user());

CREATE POLICY newsroom_articles_insert_moderator
    ON public.news_articles
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_newsroom_moderator_for_authenticated_user());

CREATE POLICY newsroom_articles_update_moderator
    ON public.news_articles
    FOR UPDATE
    TO authenticated
    USING (public.is_newsroom_moderator_for_authenticated_user())
    WITH CHECK (public.is_newsroom_moderator_for_authenticated_user());

CREATE POLICY newsroom_articles_delete_moderator
    ON public.news_articles
    FOR DELETE
    TO authenticated
    USING (public.is_newsroom_moderator_for_authenticated_user());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('local-news-media', 'local-news-media', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_signed_news_article_image_url(p_image_path text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
    v_image_path text;
    v_signed_url text;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
    END IF;

    v_image_path := NULLIF(trim(coalesce(p_image_path, '')), '');
    IF v_image_path IS NULL THEN
        RETURN NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.news_articles AS a
         WHERE a.status = 'published'
           AND (
                a.featured_image_url = v_image_path
                OR a.content_html ILIKE '%' || v_image_path || '%'
           )
    ) THEN
        RAISE EXCEPTION 'Published article image not found.' USING ERRCODE = '42501';
    END IF;

    SELECT storage.create_signed_url('local-news-media', v_image_path, 3600)
      INTO v_signed_url;

    RETURN v_signed_url;
END;
$$;

ALTER FUNCTION public.get_signed_news_article_image_url(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_signed_news_article_image_url(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_signed_news_article_image_url(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_signed_news_article_image_url(text) TO authenticated;

CREATE POLICY "local_news_media_insert_moderators_only"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'local-news-media'
        AND EXISTS (
            SELECT 1
            FROM public.citizens AS c
            JOIN public.moneytree_moderators AS mm ON mm.citizen_id = c.id
            WHERE c.auth_user_id = auth.uid()
        )
    );

CREATE POLICY "local_news_media_update_moderators_only"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'local-news-media'
        AND EXISTS (
            SELECT 1
            FROM public.citizens AS c
            JOIN public.moneytree_moderators AS mm ON mm.citizen_id = c.id
            WHERE c.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        bucket_id = 'local-news-media'
        AND EXISTS (
            SELECT 1
            FROM public.citizens AS c
            JOIN public.moneytree_moderators AS mm ON mm.citizen_id = c.id
            WHERE c.auth_user_id = auth.uid()
        )
    );

CREATE POLICY "local_news_media_delete_moderators_only"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'local-news-media'
        AND EXISTS (
            SELECT 1
            FROM public.citizens AS c
            JOIN public.moneytree_moderators AS mm ON mm.citizen_id = c.id
            WHERE c.auth_user_id = auth.uid()
        )
    );

COMMIT;
