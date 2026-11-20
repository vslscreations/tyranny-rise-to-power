BEGIN;

-- Ensure the user-scoped RPC remains callable by authenticated users only.
-- The caller is the authenticated JWT role via userClient.rpc(...), while the
-- function body remains SECURITY DEFINER for wallet/auth/idempotency enforcement.
REVOKE ALL ON FUNCTION public.process_lucky7_game(text, numeric(12,2), text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_lucky7_game(text, numeric(12,2), text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.process_lucky7_game(text, numeric(12,2), text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_lucky7_game(text, numeric(12,2), text, jsonb) TO authenticated;

COMMIT;
