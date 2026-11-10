BEGIN;

CREATE OR REPLACE FUNCTION public.create_social_post(p_content text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_citizen_id uuid;
    v_trimmed text;
    v_post_id uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create a post.';
    END IF;

    IF p_content IS NULL THEN
        RAISE EXCEPTION 'Post content is required.';
    END IF;

    v_trimmed := regexp_replace(p_content, '^[[:space:]]+|[[:space:]]+$', '', 'g');

    IF length(v_trimmed) < 1 THEN
        RAISE EXCEPTION 'Post content cannot be empty or whitespace only.';
    END IF;

    IF length(v_trimmed) > 280 THEN
        RAISE EXCEPTION 'Post content exceeds 280 characters.';
    END IF;

    SELECT c.id
      INTO v_citizen_id
      FROM public.citizens AS c
     WHERE c.auth_user_id = auth.uid();

    IF v_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Authenticated citizen record not found for social media posting.';
    END IF;

    INSERT INTO public.social_posts (
        content
    )
    VALUES (
        v_trimmed
    )
    RETURNING id INTO v_post_id;

    RETURN v_post_id;
END;
$$;

ALTER FUNCTION public.create_social_post(text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.create_social_post(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_social_post(text) FROM anon;
REVOKE ALL ON FUNCTION public.create_social_post(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_social_post(text) TO authenticated;

COMMIT;
