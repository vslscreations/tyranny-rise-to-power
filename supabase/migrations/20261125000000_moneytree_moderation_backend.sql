BEGIN;

CREATE TABLE public.moneytree_moderators (
    citizen_id uuid PRIMARY KEY REFERENCES public.citizens(id) ON DELETE CASCADE,
    granted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.moneytree_moderators ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.moneytree_moderators FROM PUBLIC;
REVOKE ALL ON TABLE public.moneytree_moderators FROM anon;
REVOKE ALL ON TABLE public.moneytree_moderators FROM authenticated;
REVOKE ALL ON TABLE public.moneytree_moderators FROM service_role;

GRANT SELECT ON TABLE public.moneytree_moderators TO service_role;

CREATE POLICY moneytree_moderators_no_browser_insert
    ON public.moneytree_moderators
    FOR INSERT
    TO authenticated
    WITH CHECK (false);

CREATE POLICY moneytree_moderators_no_browser_update
    ON public.moneytree_moderators
    FOR UPDATE
    TO authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY moneytree_moderators_no_browser_delete
    ON public.moneytree_moderators
    FOR DELETE
    TO authenticated
    USING (false);

ALTER TABLE public.moneytree_contributions
    ADD COLUMN IF NOT EXISTS moderated_by_citizen_id uuid NULL REFERENCES public.citizens(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS moderated_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS moderation_reason text NULL CHECK (moderation_reason IS NULL OR length(trim(moderation_reason)) > 0);

CREATE OR REPLACE FUNCTION public.moderate_moneytree_contribution(
    p_contribution_id uuid,
    p_decision text,
    p_reason text DEFAULT NULL
)
RETURNS TABLE (
    contribution_id uuid,
    moderation_state text,
    result text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
    v_caller_citizen_id uuid;
    v_contribution record;
    v_clean_reason text;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
    END IF;

    IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Decision must be approved or rejected.' USING ERRCODE = '23514';
    END IF;

    SELECT c.id
      INTO v_caller_citizen_id
      FROM public.citizens AS c
     WHERE c.auth_user_id = v_user;

    IF v_caller_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Authenticated citizen record not found.' USING ERRCODE = '23503';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.moneytree_moderators AS mm
         WHERE mm.citizen_id = v_caller_citizen_id
    ) THEN
        RAISE EXCEPTION 'Moderator access required.' USING ERRCODE = '42501';
    END IF;

    SELECT mc.*
      INTO v_contribution
      FROM public.moneytree_contributions AS mc
     WHERE mc.id = p_contribution_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contribution not found.' USING ERRCODE = '23503';
    END IF;

    IF v_contribution.moderation_state <> 'pending' THEN
        RAISE EXCEPTION 'Only pending contributions can be moderated.' USING ERRCODE = '23514';
    END IF;

    v_clean_reason := NULLIF(trim(p_reason), '');

    UPDATE public.moneytree_contributions AS mc
       SET moderation_state = p_decision,
           moderated_by_citizen_id = v_caller_citizen_id,
           moderated_at = now(),
           moderation_reason = v_clean_reason
     WHERE mc.id = p_contribution_id;

    RETURN QUERY
    SELECT p_contribution_id,
           p_decision,
           'moderated'::text;
END;
$$;

ALTER FUNCTION public.moderate_moneytree_contribution(uuid, text, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.moderate_moneytree_contribution(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moderate_moneytree_contribution(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.moderate_moneytree_contribution(uuid, text, text) TO authenticated;

COMMIT;
