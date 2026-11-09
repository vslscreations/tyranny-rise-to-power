-- Shorten Citizen IDs to CIT- + 16 uppercase hex chars for all newly created citizens.
-- Existing citizen IDs remain unchanged.

-- pgcrypto is already installed in the extensions schema. Do not relocate or reinstall it.

create or replace function public.generate_citizen_id()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.generate_citizen_id() from public;
revoke all on function public.generate_citizen_id() from anon;
revoke all on function public.generate_citizen_id() from authenticated;

grant execute on function public.generate_citizen_id() to service_role;

alter table public.citizens
    alter column citizen_id set default public.generate_citizen_id();

-- Ensure future RPC-created citizens also rely on the database default instead of an explicit legacy value.
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
        public_name,
        avatar_type,
        avatar_url,
        political_party
    )
    values (
        p_auth_user_id,
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

-- Sample validation (run after applying the migration):
-- select public.generate_citizen_id();
-- select citizen_id from public.citizens order by created_at desc limit 5;
-- select citizen_id, regexp_count(citizen_id, '^CIT-[0-9A-F]{16}$') = 1 as valid_format
-- from public.citizens
-- order by created_at desc
-- limit 20;
