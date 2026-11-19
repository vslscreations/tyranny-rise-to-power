BEGIN;

-- Harden the protected-citizen trigger guard by removing direct EXECUTE rights from
-- all non-owner roles. This does not alter the function definition, trigger definitions,
-- trigger attachment, or any table permissions.
--
-- PostgreSQL trigger functions execute automatically as part of the trigger firing and
-- do not require direct EXECUTE privileges for the invoking client role.

REVOKE ALL ON FUNCTION public.prevent_protected_citizen_changes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_protected_citizen_changes() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_protected_citizen_changes() FROM authenticated;
REVOKE ALL ON FUNCTION public.prevent_protected_citizen_changes() FROM service_role;

COMMIT;
