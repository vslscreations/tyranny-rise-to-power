BEGIN;

ALTER TABLE public.citizens
  ADD COLUMN IF NOT EXISTS avatar_background text NOT NULL DEFAULT 'midnight';

ALTER TABLE public.citizens
  DROP CONSTRAINT IF EXISTS citizens_avatar_background_check;

ALTER TABLE public.citizens
  ADD CONSTRAINT citizens_avatar_background_check
  CHECK (avatar_background IN ('midnight', 'royal', 'crimson', 'emerald', 'imperial', 'violet'));

GRANT UPDATE (avatar_background) ON public.citizens TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_avatar_style(p_citizen_id uuid)
RETURNS TABLE (
  avatar_url text,
  avatar_background text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE
      WHEN c.avatar_url IN (
        './assets/avatars/aurelia-voss.svg',
        './assets/avatars/jasper-reed.svg',
        './assets/avatars/mira-sloane.svg',
        './assets/avatars/dorian-kestrel.svg',
        './assets/avatars/leah-cortez.svg',
        './assets/avatars/omar-tate.svg'
      ) THEN c.avatar_url
      ELSE './assets/avatars/aurelia-voss.svg'
    END,
    c.avatar_background
  FROM public.citizens AS c
  WHERE c.id = p_citizen_id
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.citizens AS viewer
      WHERE viewer.auth_user_id = auth.uid()
    )
  LIMIT 1;
$$;

ALTER FUNCTION public.get_public_avatar_style(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_public_avatar_style(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_avatar_style(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.create_citizen_and_private(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.create_citizen_and_private(
  p_auth_user_id uuid,
  p_public_name text,
  p_avatar_type text DEFAULT 'builtin',
  p_avatar_url text DEFAULT NULL,
  p_political_party text DEFAULT 'Independent',
  p_avatar_background text DEFAULT 'midnight'
)
RETURNS public.citizens
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_citizen public.citizens;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication user id is required.';
  END IF;

  IF p_avatar_background NOT IN ('midnight', 'royal', 'crimson', 'emerald', 'imperial', 'violet') THEN
    RAISE EXCEPTION 'The selected avatar background is not permitted.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.citizens WHERE auth_user_id = p_auth_user_id) THEN
    RAISE EXCEPTION 'Citizen already exists for this authenticated user.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.citizens (
    auth_user_id,
    citizen_id,
    public_name,
    avatar_type,
    avatar_url,
    avatar_background,
    political_party
  )
  VALUES (
    p_auth_user_id,
    'CIT-' || upper(replace(gen_random_uuid()::text, '-', '')),
    p_public_name,
    p_avatar_type,
    p_avatar_url,
    p_avatar_background,
    p_political_party
  )
  RETURNING * INTO v_citizen;

  INSERT INTO public.citizen_private (
    citizen_id,
    balance,
    profession,
    social_class,
    education,
    account_status,
    privileges
  )
  VALUES (
    v_citizen.id,
    0,
    'Civilian',
    'Homeless',
    'No Diploma',
    'active',
    '[]'::jsonb
  );

  RETURN v_citizen;
END;
$$;

REVOKE ALL ON FUNCTION public.create_citizen_and_private(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_citizen_and_private(uuid, text, text, text, text, text) TO service_role;

COMMIT;
