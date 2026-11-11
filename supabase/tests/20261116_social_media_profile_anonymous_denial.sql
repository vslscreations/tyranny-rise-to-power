BEGIN READ ONLY;

-- --------------------------------------------------------------------
-- 16) Anonymous execution is denied.
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_target uuid := '9654ac4f-1c26-4797-a3f5-d8b1dee5b442';
BEGIN
  RESET ROLE;

  IF session_user <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: expected both session_user and current_user to be postgres.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);

  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);

  BEGIN
    PERFORM *
    FROM public.get_citizen_social_profile(v_target) AS p;

    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = 'PT999',
      MESSAGE = 'ASSERTION FAILED: anonymous execution unexpectedly succeeded.';
  EXCEPTION
    WHEN others THEN
      RESET ROLE;
      IF SQLSTATE <> '42501' THEN
        RAISE EXCEPTION USING ERRCODE = 'PT999',
          MESSAGE = 'ASSERTION FAILED: anonymous execution did not fail with the expected permission error (42501).';
      END IF;
  END;
END $$;

COMMIT;
