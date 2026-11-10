begin;

create or replace function public.create_social_comment(p_post_id uuid, p_content text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_current_citizen_id uuid;
    v_trimmed text;
    v_comment_id uuid;
begin
    if auth.uid() is null then
        raise exception 'Authentication required to create a comment.';
    end if;

    v_current_citizen_id := public.social_current_citizen_id();
    if v_current_citizen_id is null then
        raise exception 'Authenticated citizen record not found for social comments.';
    end if;

    if p_post_id is null then
        raise exception 'Post ID is required.';
    end if;

    if p_content is null then
        raise exception 'Comment content is required.';
    end if;

    v_trimmed := regexp_replace(p_content, '^[[:space:]]+|[[:space:]]+$', '', 'g');
    if length(v_trimmed) < 1 then
        raise exception 'Comment content cannot be empty or whitespace only.';
    end if;

    if length(v_trimmed) > 500 then
        raise exception 'Comment content exceeds 500 characters.';
    end if;

    if not exists (
        select 1
        from public.social_posts as sp
        where sp.id = p_post_id
          and sp.deleted_at is null
    ) then
        raise exception 'Cannot comment on a deleted or missing post.';
    end if;

    insert into public.social_comments (
        post_id,
        citizen_id,
        content,
        parent_comment_id
    )
    values (
        p_post_id,
        v_current_citizen_id,
        v_trimmed,
        null
    )
    returning id into v_comment_id;

    return v_comment_id;
end;
$$;

create or replace function public.update_social_comment(p_comment_id uuid, p_content text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_current_citizen_id uuid;
    v_trimmed text;
    v_comment_id uuid;
begin
    if auth.uid() is null then
        raise exception 'Authentication required to update a comment.';
    end if;

    v_current_citizen_id := public.social_current_citizen_id();
    if v_current_citizen_id is null then
        raise exception 'Authenticated citizen record not found for social comments.';
    end if;

    if p_comment_id is null then
        raise exception 'Comment ID is required.';
    end if;

    if p_content is null then
        raise exception 'Comment content is required.';
    end if;

    v_trimmed := regexp_replace(p_content, '^[[:space:]]+|[[:space:]]+$', '', 'g');
    if length(v_trimmed) < 1 then
        raise exception 'Comment content cannot be empty or whitespace only.';
    end if;

    if length(v_trimmed) > 500 then
        raise exception 'Comment content exceeds 500 characters.';
    end if;

    update public.social_comments as sc
       set content = v_trimmed
     where sc.id = p_comment_id
       and sc.deleted_at is null
       and sc.parent_comment_id is null
       and sc.citizen_id = v_current_citizen_id
    returning sc.id into v_comment_id;

    if v_comment_id is null then
        raise exception 'Comment not found, deleted, or not owned by the current citizen.';
    end if;

    return v_comment_id;
end;
$$;

create or replace function public.delete_social_comment(p_comment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_current_citizen_id uuid;
    v_comment_id uuid;
begin
    if auth.uid() is null then
        raise exception 'Authentication required to delete a comment.';
    end if;

    v_current_citizen_id := public.social_current_citizen_id();
    if v_current_citizen_id is null then
        raise exception 'Authenticated citizen record not found for social comments.';
    end if;

    if p_comment_id is null then
        raise exception 'Comment ID is required.';
    end if;

    update public.social_comments as sc
       set deleted_at = now()
     where sc.id = p_comment_id
       and sc.deleted_at is null
       and sc.parent_comment_id is null
       and sc.citizen_id = v_current_citizen_id
    returning sc.id into v_comment_id;

    if v_comment_id is null then
        raise exception 'Comment not found, already deleted, or not owned by the current citizen.';
    end if;

    return v_comment_id;
end;
$$;

create or replace function public.get_post_comments(
    p_post_id uuid,
    p_limit integer default 25,
    p_offset integer default 0
)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_current_citizen_id uuid;
    v_limit integer := coalesce(p_limit, 25);
    v_offset integer := coalesce(p_offset, 0);
begin
    if auth.uid() is null then
        raise exception 'Authentication required to view comments.';
    end if;

    v_current_citizen_id := public.social_current_citizen_id();
    if v_current_citizen_id is null then
        raise exception 'Authenticated citizen record not found for social comments.';
    end if;

    if p_post_id is null then
        raise exception 'Post ID is required.';
    end if;

    if v_limit is null or v_limit < 1 or v_limit > 25 then
        raise exception 'p_limit must be between 1 and 25.';
    end if;

    if v_offset is null or v_offset < 0 then
        raise exception 'p_offset must be non-negative.';
    end if;

    if not exists (
        select 1
        from public.social_posts as sp
        where sp.id = p_post_id
          and sp.deleted_at is null
    ) then
        raise exception 'Cannot retrieve comments for a deleted or missing post.';
    end if;

    return query
    select jsonb_build_object(
        'id', sc.id,
        'post_id', sc.post_id,
        'content', sc.content,
        'created_at', sc.created_at,
        'updated_at', sc.updated_at,
        'author_citizen_id', sc.citizen_id,
        'author_public_name', author.public_name,
        'author_avatar_url', case
            when author.avatar_url = './assets/avatars/aurelia-voss.svg'
              or author.avatar_url = './assets/avatars/jasper-reed.svg'
              or author.avatar_url = './assets/avatars/mira-sloane.svg'
              or author.avatar_url = './assets/avatars/dorian-kestrel.svg'
              or author.avatar_url = './assets/avatars/leah-cortez.svg'
              or author.avatar_url = './assets/avatars/omar-tate.svg'
                then author.avatar_url
            else './assets/avatars/aurelia-voss.svg'
        end
    )
    from public.social_comments as sc
    join public.citizens as author
      on author.id = sc.citizen_id
    where sc.post_id = p_post_id
      and sc.deleted_at is null
      and sc.parent_comment_id is null
      and exists (
          select 1
          from public.social_posts as sp
          where sp.id = sc.post_id
            and sp.deleted_at is null
      )
    order by sc.created_at asc, sc.id asc
    limit v_limit offset v_offset;
end;
$$;

revoke all on function public.create_social_comment(uuid, text) from public;
revoke all on function public.create_social_comment(uuid, text) from anon;
grant execute on function public.create_social_comment(uuid, text) to authenticated;

revoke all on function public.update_social_comment(uuid, text) from public;
revoke all on function public.update_social_comment(uuid, text) from anon;
grant execute on function public.update_social_comment(uuid, text) to authenticated;

revoke all on function public.delete_social_comment(uuid) from public;
revoke all on function public.delete_social_comment(uuid) from anon;
grant execute on function public.delete_social_comment(uuid) to authenticated;

revoke all on function public.get_post_comments(uuid, integer, integer) from public;
revoke all on function public.get_post_comments(uuid, integer, integer) from anon;
grant execute on function public.get_post_comments(uuid, integer, integer) to authenticated;

revoke all on table public.social_comments from public;
revoke all on table public.social_comments from anon;
revoke all on table public.social_comments from authenticated;
revoke insert (post_id, content) on table public.social_comments from authenticated;
revoke update (content, deleted_at) on table public.social_comments from authenticated;

alter function public.create_social_comment(uuid, text) owner to postgres;
alter function public.update_social_comment(uuid, text) owner to postgres;
alter function public.delete_social_comment(uuid) owner to postgres;
alter function public.get_post_comments(uuid, integer, integer) owner to postgres;

commit;
