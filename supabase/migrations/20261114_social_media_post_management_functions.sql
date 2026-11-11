begin;

create or replace function public.update_social_post(p_post_id uuid, p_content text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_current_citizen_id uuid;
    v_trimmed text;
    v_post_id uuid;
begin
    if auth.uid() is null then
        raise exception 'Authentication required to update a post.';
    end if;

    v_current_citizen_id := public.social_current_citizen_id();
    if v_current_citizen_id is null then
        raise exception 'Authenticated citizen record not found for social posts.';
    end if;

    if p_post_id is null then
        raise exception 'Post ID is required.';
    end if;

    if p_content is null then
        raise exception 'Post content is required.';
    end if;

    v_trimmed := regexp_replace(p_content, '^[[:space:]]+|[[:space:]]+$', '', 'g');
    if length(v_trimmed) < 1 then
        raise exception 'Post content cannot be empty or whitespace only.';
    end if;

    if length(v_trimmed) > 280 then
        raise exception 'Post content exceeds 280 characters.';
    end if;

    update public.social_posts as sp
       set content = v_trimmed
     where sp.id = p_post_id
       and sp.deleted_at is null
       and sp.citizen_id = v_current_citizen_id
    returning sp.id into v_post_id;

    if v_post_id is null then
        raise exception 'Post not found, deleted, or not owned by the current citizen.';
    end if;

    return v_post_id;
end;
$$;

create or replace function public.delete_social_post(p_post_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_current_citizen_id uuid;
    v_post_id uuid;
begin
    if auth.uid() is null then
        raise exception 'Authentication required to delete a post.';
    end if;

    v_current_citizen_id := public.social_current_citizen_id();
    if v_current_citizen_id is null then
        raise exception 'Authenticated citizen record not found for social posts.';
    end if;

    if p_post_id is null then
        raise exception 'Post ID is required.';
    end if;

    update public.social_posts as sp
       set deleted_at = now()
     where sp.id = p_post_id
       and sp.deleted_at is null
       and sp.citizen_id = v_current_citizen_id
    returning sp.id into v_post_id;

    if v_post_id is null then
        raise exception 'Post not found, already deleted, or not owned by the current citizen.';
    end if;

    return v_post_id;
end;
$$;

revoke all on function public.update_social_post(uuid, text) from public;
revoke all on function public.update_social_post(uuid, text) from anon;
grant execute on function public.update_social_post(uuid, text) to authenticated;

revoke all on function public.delete_social_post(uuid) from public;
revoke all on function public.delete_social_post(uuid) from anon;
grant execute on function public.delete_social_post(uuid) to authenticated;

revoke update on table public.social_posts from authenticated;
revoke update (content, deleted_at) on table public.social_posts from authenticated;

alter function public.update_social_post(uuid, text) owner to postgres;
alter function public.delete_social_post(uuid) owner to postgres;

commit;
