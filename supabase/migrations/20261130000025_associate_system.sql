BEGIN;

CREATE TABLE IF NOT EXISTS public.citizen_relationships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_citizen_id uuid NOT NULL REFERENCES public.citizens(id) ON DELETE CASCADE,
    target_citizen_id uuid NOT NULL REFERENCES public.citizens(id) ON DELETE CASCADE,
    relationship_type text NOT NULL CHECK (relationship_type IN ('friend', 'enemy')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_citizen_id, target_citizen_id),
    CHECK (owner_citizen_id <> target_citizen_id)
);

ALTER TABLE public.citizen_relationships ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.citizen_relationships FROM PUBLIC;
REVOKE ALL ON TABLE public.citizen_relationships FROM anon;
REVOKE ALL ON TABLE public.citizen_relationships FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.citizen_relationships TO service_role;

CREATE OR REPLACE FUNCTION public.citizen_relationships_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.citizen_relationships_set_updated_at() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.citizen_relationships_set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.citizen_relationships_set_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.citizen_relationships_set_updated_at() FROM authenticated;

DROP TRIGGER IF EXISTS citizen_relationships_set_updated_at ON public.citizen_relationships;
CREATE TRIGGER citizen_relationships_set_updated_at
BEFORE UPDATE ON public.citizen_relationships
FOR EACH ROW
EXECUTE FUNCTION public.citizen_relationships_set_updated_at();

DROP POLICY IF EXISTS "citizen_relationships_select_own" ON public.citizen_relationships;
DROP POLICY IF EXISTS "citizen_relationships_insert_own" ON public.citizen_relationships;
DROP POLICY IF EXISTS "citizen_relationships_update_own" ON public.citizen_relationships;
DROP POLICY IF EXISTS "citizen_relationships_delete_own" ON public.citizen_relationships;

CREATE POLICY "citizen_relationships_select_own"
    ON public.citizen_relationships
    FOR SELECT
    TO authenticated
    USING (owner_citizen_id = public.social_current_citizen_id());

CREATE POLICY "citizen_relationships_insert_own"
    ON public.citizen_relationships
    FOR INSERT
    TO authenticated
    WITH CHECK (
        owner_citizen_id = public.social_current_citizen_id()
        AND target_citizen_id <> public.social_current_citizen_id()
    );

CREATE POLICY "citizen_relationships_update_own"
    ON public.citizen_relationships
    FOR UPDATE
    TO authenticated
    USING (owner_citizen_id = public.social_current_citizen_id())
    WITH CHECK (
        owner_citizen_id = public.social_current_citizen_id()
        AND target_citizen_id <> public.social_current_citizen_id()
    );

CREATE POLICY "citizen_relationships_delete_own"
    ON public.citizen_relationships
    FOR DELETE
    TO authenticated
    USING (owner_citizen_id = public.social_current_citizen_id());

CREATE OR REPLACE FUNCTION public.get_current_citizen_association_list(p_relationship_type text DEFAULT 'friend')
RETURNS TABLE (
    citizen_id uuid,
    public_name text,
    handle text,
    avatar_url text,
    profession text,
    social_class text,
    relationship_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_owner_citizen_id uuid;
    v_relationship_type text;
BEGIN
    v_owner_citizen_id := public.social_current_citizen_id();
    IF v_owner_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Authenticated citizen record not found for relationship queries.' USING ERRCODE = '28000';
    END IF;

    v_relationship_type := lower(trim(coalesce(p_relationship_type, '')));
    IF v_relationship_type NOT IN ('friend', 'enemy') THEN
        RAISE EXCEPTION 'Relationship type must be friend or enemy.' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
        target.id AS citizen_id,
        target.public_name,
        COALESCE(handle_row.handle, '@citizen') AS handle,
        target.avatar_url,
        COALESCE(cp.profession, 'Civilian') AS profession,
        COALESCE(cp.social_class, 'Unknown') AS social_class,
        rel.relationship_type
    FROM public.citizen_relationships AS rel
    JOIN public.citizens AS target
      ON target.id = rel.target_citizen_id
    LEFT JOIN public.citizen_social_handles AS handle_row
      ON handle_row.citizen_id = target.id
    LEFT JOIN public.citizen_private AS cp
      ON cp.citizen_id = target.id
    WHERE rel.owner_citizen_id = v_owner_citizen_id
      AND rel.relationship_type = v_relationship_type
    ORDER BY target.public_name ASC, target.id ASC;
END;
$$;

ALTER FUNCTION public.get_current_citizen_association_list(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_current_citizen_association_list(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_current_citizen_association_list(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_current_citizen_association_list(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_citizen_association_list(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_citizen_relationship_status(p_target_citizen_id uuid)
RETURNS TABLE (
    relationship_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_owner_citizen_id uuid;
BEGIN
    v_owner_citizen_id := public.social_current_citizen_id();
    IF v_owner_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Authenticated citizen record not found for relationship checks.' USING ERRCODE = '28000';
    END IF;

    IF p_target_citizen_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT rel.relationship_type
    FROM public.citizen_relationships AS rel
    WHERE rel.owner_citizen_id = v_owner_citizen_id
      AND rel.target_citizen_id = p_target_citizen_id
    LIMIT 1;
END;
$$;

ALTER FUNCTION public.get_citizen_relationship_status(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_citizen_relationship_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_citizen_relationship_status(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_citizen_relationship_status(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_citizen_relationship_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_citizen_relationship(p_target_citizen_id uuid, p_relationship_type text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_owner_citizen_id uuid;
    v_relationship_type text;
BEGIN
    v_owner_citizen_id := public.social_current_citizen_id();
    IF v_owner_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Authenticated citizen record not found for relationship updates.' USING ERRCODE = '28000';
    END IF;

    IF p_target_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Target citizen is required.' USING ERRCODE = '23502';
    END IF;

    IF p_target_citizen_id = v_owner_citizen_id THEN
        RAISE EXCEPTION 'You cannot create a relationship with yourself.' USING ERRCODE = '23514';
    END IF;

    v_relationship_type := lower(trim(coalesce(p_relationship_type, '')));
    IF v_relationship_type NOT IN ('friend', 'enemy') THEN
        RAISE EXCEPTION 'Relationship type must be friend or enemy.' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.citizens AS c WHERE c.id = p_target_citizen_id
    ) THEN
        RAISE EXCEPTION 'Target citizen does not exist.' USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.citizen_relationships (
        owner_citizen_id,
        target_citizen_id,
        relationship_type
    )
    VALUES (
        v_owner_citizen_id,
        p_target_citizen_id,
        v_relationship_type
    )
    ON CONFLICT (owner_citizen_id, target_citizen_id)
    DO UPDATE SET
        relationship_type = EXCLUDED.relationship_type,
        updated_at = now();

    RETURN TRUE;
END;
$$;

ALTER FUNCTION public.set_citizen_relationship(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_citizen_relationship(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_citizen_relationship(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.set_citizen_relationship(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_citizen_relationship(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_citizen_relationship(p_target_citizen_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_owner_citizen_id uuid;
BEGIN
    v_owner_citizen_id := public.social_current_citizen_id();
    IF v_owner_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Authenticated citizen record not found for relationship removal.' USING ERRCODE = '28000';
    END IF;

    IF p_target_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Target citizen is required.' USING ERRCODE = '23502';
    END IF;

    IF p_target_citizen_id = v_owner_citizen_id THEN
        RAISE EXCEPTION 'You cannot remove a relationship from yourself.' USING ERRCODE = '23514';
    END IF;

    DELETE FROM public.citizen_relationships AS rel
     WHERE rel.owner_citizen_id = v_owner_citizen_id
       AND rel.target_citizen_id = p_target_citizen_id;

    RETURN TRUE;
END;
$$;

ALTER FUNCTION public.remove_citizen_relationship(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.remove_citizen_relationship(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_citizen_relationship(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.remove_citizen_relationship(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.remove_citizen_relationship(uuid) TO authenticated;

COMMIT;
