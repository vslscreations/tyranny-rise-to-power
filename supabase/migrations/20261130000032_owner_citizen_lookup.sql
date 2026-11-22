BEGIN;

-- Search exposes only the public identifiers needed to select a balance target.
CREATE OR REPLACE FUNCTION public.owner_search_citizens(p_query text)
RETURNS TABLE (citizen_id uuid, public_name text, handle text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_query text := trim(coalesce(p_query, ''));
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.citizens AS requester
        JOIN public.moneytree_owners AS owners ON owners.citizen_id = requester.id
        WHERE requester.auth_user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Owner access required.' USING ERRCODE = '42501';
    END IF;

    IF char_length(v_query) < 2 OR char_length(v_query) > 100 THEN
        RAISE EXCEPTION 'Search must contain between 2 and 100 characters.' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT c.id, c.public_name, h.handle
    FROM public.citizens AS c
    LEFT JOIN public.citizen_social_handles AS h ON h.citizen_id = c.id
    WHERE position(lower(v_query) IN lower(c.public_name)) > 0
       OR position(lower(ltrim(v_query, '@')) IN lower(h.handle)) > 0
          AND length(ltrim(v_query, '@')) >= 2
       OR c.id::text = lower(v_query)
    ORDER BY c.public_name, c.id
    LIMIT 20;
END;
$$;

ALTER FUNCTION public.owner_search_citizens(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.owner_search_citizens(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_search_citizens(text) TO authenticated;

COMMIT;
