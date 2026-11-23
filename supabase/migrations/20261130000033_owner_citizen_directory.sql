BEGIN;

CREATE OR REPLACE FUNCTION public.owner_list_citizens(p_query text DEFAULT '', p_offset integer DEFAULT 0)
RETURNS TABLE (
  citizen_id uuid, public_name text, handle text, registration_date timestamptz,
  account_status text, balance numeric, profession text, education text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_query text := trim(coalesce(p_query, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.citizens requester
    JOIN public.moneytree_owners owners ON owners.citizen_id = requester.id
    WHERE requester.auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Owner access required.' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_query) > 100 OR p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'Invalid search or offset.' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT c.id, c.public_name, h.handle, c.registration_date,
         cp.account_status::text, cp.balance::numeric, cp.profession::text, cp.education::text
  FROM public.citizens c
  LEFT JOIN public.citizen_social_handles h ON h.citizen_id = c.id
  LEFT JOIN public.citizen_private cp ON cp.citizen_id = c.id
  WHERE v_query = '' OR position(lower(v_query) IN lower(c.public_name)) > 0
    OR (length(ltrim(v_query, '@')) >= 2 AND position(lower(ltrim(v_query, '@')) IN lower(h.handle)) > 0)
    OR c.id::text = lower(v_query)
  ORDER BY c.public_name, c.id
  LIMIT 51 OFFSET p_offset;
END;
$$;
ALTER FUNCTION public.owner_list_citizens(text, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.owner_list_citizens(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_list_citizens(text, integer) TO authenticated;

COMMIT;
