-- Phase C citizen setup template.
-- This migration is intentionally defensive and must be reviewed against the exact live schema before execution.
-- The browser is expected to submit public_name, avatar_type, avatar_url and political_party only.

create or replace function public.create_citizen_and_private(
  p_auth_user_id uuid,
  p_public_name text,
  p_avatar_type text default 'builtin',
  p_avatar_url text default null,
  p_political_party text default 'Independent'
)
returns public.citizens
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_citizen public.citizens;
begin
    if p_auth_user_id is null then
        raise exception 'Authentication user id is required.';
    end if;

    if exists (
        select 1
        from public.citizens
        where auth_user_id = p_auth_user_id
    ) then
        raise exception 'Citizen already exists for this authenticated user.' using errcode = '23505';
    end if;

    insert into public.citizens (
        auth_user_id,
        citizen_id,
        public_name,
        avatar_type,
        avatar_url,
        political_party
    )
    values (
        p_auth_user_id,
        'CIT-' || upper(replace(gen_random_uuid()::text, '-', '')),
        p_public_name,
        p_avatar_type,
        p_avatar_url,
        p_political_party
    )
    returning *
    into v_citizen;

    insert into public.citizen_private (
        citizen_id,
        balance,
        profession,
        social_class,
        education,
        account_status,
        privileges
    )
    values (
        v_citizen.id,
        0,
        'Civilian',
        'Homeless',
        'No Diploma',
        'active',
        '[]'::jsonb
    );

    return v_citizen;
end;
$$;

revoke all on function public.create_citizen_and_private(uuid, text, text, text, text) from public;
revoke all on function public.create_citizen_and_private(uuid, text, text, text, text) from anon;
revoke all on function public.create_citizen_and_private(uuid, text, text, text, text) from authenticated;

grant execute on function public.create_citizen_and_private(uuid, text, text, text, text) to service_role;

-- The function is intentionally SECURITY INVOKER so that the existing public.prevent_protected_citizen_changes()
-- trigger sees the execution context used by the calling role. The Edge Function will call the RPC through the
-- service-role client, so current_user will resolve to service_role at runtime when the function is invoked.
-- This function assumes the live citizen_private.privileges column is jsonb. If the live schema uses a different
-- type, the migration must be adjusted to match that exact table definition without changing the protected-field
-- trigger logic.
-- The browser must never pass auth_user_id, citizen_id, balance, profession, social_class, education,
-- account_status, privileges, or any service-role secret values.
-- Keep the existing trigger unchanged. It must continue to inspect current_user and allow only service_role
-- to write protected fields.
