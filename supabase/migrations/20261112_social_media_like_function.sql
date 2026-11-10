BEGIN;

CREATE OR REPLACE FUNCTION public.set_post_like(p_post_id uuid, p_liked boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_citizen_id uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required to update a post like.';
    END IF;

    IF p_post_id IS NULL THEN
        RAISE EXCEPTION 'Post ID is required.';
    END IF;

    IF p_liked IS NULL THEN
        RAISE EXCEPTION 'Like state is required.';
    END IF;

    SELECT c.id
      INTO v_citizen_id
      FROM public.citizens AS c
     WHERE c.auth_user_id = auth.uid();

    IF v_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Authenticated citizen record not found for social media reactions.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.social_posts AS sp
         WHERE sp.id = p_post_id
           AND sp.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Post does not exist or is not available.';
    END IF;

    IF p_liked = true THEN
        INSERT INTO public.social_post_reactions (post_id, reaction_type)
        VALUES (p_post_id, 'like')
        ON CONFLICT (post_id, citizen_id, reaction_type)
        DO NOTHING;
        RETURN;
    END IF;

    DELETE FROM public.social_post_reactions AS spr
     WHERE spr.post_id = p_post_id
       AND spr.citizen_id = v_citizen_id
       AND spr.reaction_type = 'like';
END;
$$;

ALTER FUNCTION public.set_post_like(uuid, boolean) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.set_post_like(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_post_like(uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.set_post_like(uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_post_like(uuid, boolean) TO authenticated;

COMMIT;
