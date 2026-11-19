-- TEST-ONLY BOOTSTRAP FOR A SEPARATE DISPOSABLE SUPABASE PROJECT
-- --------------------------------------------------------------------
-- This file is intentionally not placed under supabase/migrations.
-- It recreates only the foundation required to test MoneyTree in isolation.
-- DO NOT RUN AGAINST PRODUCTION.
-- DO NOT COPY PRODUCTION USER RECORDS, CREDENTIALS, BALANCES, OR PRIVATE DATA.
-- Source of truth: production read-only schema inspection performed against the live project.
-- --------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS extensions;

-- pgcrypto is required because production citizen ID generation relies on the
-- random byte generator used by the real schema. This bootstrap keeps the same
-- underlying dependency semantics without using production data.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pgcrypto'
  ) THEN
    CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
  END IF;
END $$;

DO $$
DECLARE
  v_ext_oid oid;
  v_has_required_function boolean;
BEGIN
  v_has_required_function := to_regprocedure('extensions.gen_random_bytes(integer)') IS NOT NULL;

  IF NOT v_has_required_function THEN
    -- If pgcrypto is already installed in another schema and is relocatable,
    -- move it into the expected schema for this bootstrap. Otherwise fail.
    IF EXISTS (
      SELECT 1
      FROM pg_extension e
      WHERE e.extname = 'pgcrypto'
    ) THEN
      SELECT e.oid INTO v_ext_oid
      FROM pg_extension e
      WHERE e.extname = 'pgcrypto';

      BEGIN
        ALTER EXTENSION pgcrypto SET SCHEMA extensions;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION
          'pgcrypto is installed but not available as extensions.gen_random_bytes(integer). This bootstrap requires the extension in schema extensions. Relocation to extensions failed; either move the extension to the extensions schema or install pgcrypto in that schema before applying this bootstrap.';
      END;
    END IF;

    IF to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL THEN
      RAISE EXCEPTION
        'Required pgcrypto dependency is missing in schema extensions: extensions.gen_random_bytes(integer) is required for public.generate_citizen_id(). Ensure pgcrypto is installed and available in the extensions schema before applying this bootstrap.';
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_protected_citizen_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
begin
  if current_user = 'service_role' then
    return new;
  end if;

  if tg_table_name = 'citizens' then
    if new.citizen_id is distinct from old.citizen_id then
      raise exception 'Citizen ID cannot be changed.';
    end if;

    if new.auth_user_id is distinct from old.auth_user_id then
      raise exception 'Auth user link cannot be changed.';
    end if;

    if new.registration_date is distinct from old.registration_date then
      raise exception 'Registration date cannot be changed.';
    end if;
  end if;

  if tg_table_name = 'citizen_private' then
    if new.balance is distinct from old.balance then
      raise exception 'Balance cannot be changed by browser clients.';
    end if;

    if new.profession is distinct from old.profession then
      raise exception 'Profession cannot be changed by browser clients.';
    end if;

    if new.social_class is distinct from old.social_class then
      raise exception 'Social class cannot be changed by browser clients.';
    end if;

    if new.education is distinct from old.education then
      raise exception 'Education cannot be changed by browser clients.';
    end if;

    if new.account_status is distinct from old.account_status then
      raise exception 'Account status cannot be changed by browser clients.';
    end if;

    if new.privileges is distinct from old.privileges then
      raise exception 'Privileges cannot be changed by browser clients.';
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.generate_citizen_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_candidate text;
begin
    loop
        v_candidate := 'CIT-' || upper(encode(extensions.gen_random_bytes(8), 'hex'));

        if not exists (
            select 1
            from public.citizens
            where citizen_id = v_candidate
        ) then
            return v_candidate;
        end if;
    end loop;
end;
$function$;

CREATE TABLE public.citizens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_id text NOT NULL UNIQUE DEFAULT generate_citizen_id(),
    auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    public_name text NOT NULL,
    avatar_type text NOT NULL DEFAULT 'builtin' CHECK (avatar_type IN ('builtin', 'upload')),
    avatar_url text,
    political_party text NOT NULL DEFAULT 'Independent',
    registration_date timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.citizen_private (
    citizen_id uuid PRIMARY KEY REFERENCES public.citizens(id) ON DELETE CASCADE,
    balance numeric NOT NULL DEFAULT 0 CHECK (balance >= 0),
    profession text NOT NULL DEFAULT 'Civilian',
    social_class text NOT NULL DEFAULT 'Homeless',
    education text NOT NULL DEFAULT 'No Diploma',
    account_status text NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended')),
    privileges jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER citizens_set_updated_at
BEFORE UPDATE ON public.citizens
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER citizen_private_set_updated_at
BEFORE UPDATE ON public.citizen_private
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER citizens_block_protected_changes
BEFORE UPDATE ON public.citizens
FOR EACH ROW
EXECUTE FUNCTION public.prevent_protected_citizen_changes();

CREATE TRIGGER citizen_private_block_protected_changes
BEFORE UPDATE ON public.citizen_private
FOR EACH ROW
EXECUTE FUNCTION public.prevent_protected_citizen_changes();

ALTER TABLE public.citizens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citizen_private ENABLE ROW LEVEL SECURITY;

CREATE POLICY "citizens_no_anon_access"
ON public.citizens
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "citizens_no_delete_for_browser"
ON public.citizens
FOR DELETE
TO authenticated
USING (false);

CREATE POLICY "citizens_no_insert_for_browser"
ON public.citizens
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "citizens_read_own_row"
ON public.citizens
FOR SELECT
TO authenticated
USING (auth.uid() = auth_user_id);

CREATE POLICY "citizens_select_own"
ON public.citizens
FOR SELECT
TO authenticated
USING (auth.uid() = auth_user_id);

CREATE POLICY "citizens_update_public_fields_only"
ON public.citizens
FOR UPDATE
TO authenticated
USING (auth.uid() = auth_user_id)
WITH CHECK (
    (auth.uid() = auth_user_id)
    AND (public_name IS NOT NULL)
    AND (avatar_type = ANY (ARRAY['builtin'::text, 'upload'::text]))
    AND (political_party IS NOT NULL)
);

CREATE POLICY "citizen_private_no_anon_access"
ON public.citizen_private
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "citizen_private_no_browser_access"
ON public.citizen_private
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

REVOKE ALL ON TABLE public.citizens FROM anon;
REVOKE ALL ON TABLE public.citizen_private FROM anon;
REVOKE ALL ON TABLE public.citizens FROM PUBLIC;
REVOKE ALL ON TABLE public.citizen_private FROM PUBLIC;
REVOKE ALL ON TABLE public.citizens FROM authenticated;
REVOKE ALL ON TABLE public.citizen_private FROM authenticated;

GRANT SELECT ON TABLE public.citizens TO authenticated;
GRANT ALL ON TABLE public.citizens TO service_role;
GRANT ALL ON TABLE public.citizen_private TO service_role;
