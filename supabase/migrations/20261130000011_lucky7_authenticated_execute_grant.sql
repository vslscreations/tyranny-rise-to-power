BEGIN;

-- Grant the exact Lucky 7 settlement function to authenticated users while keeping it
-- unavailable to PUBLIC and anon. The function remains SECURITY DEFINER and keeps its
-- existing validation and protected-balance logic intact.
REVOKE ALL ON FUNCTION public.process_lucky7_game(text, numeric(12,2), text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_lucky7_game(text, numeric(12,2), text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.process_lucky7_game(text, numeric(12,2), text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_lucky7_game(text, numeric(12,2), text, jsonb) TO authenticated;

COMMIT;
