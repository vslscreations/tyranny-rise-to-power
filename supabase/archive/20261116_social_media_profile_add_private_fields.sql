-- Extend the citizen social profile RPC with social class and profession while preserving
-- the existing profile contract, security settings, and feed payload ordering.

BEGIN;

DROP FUNCTION IF EXISTS public.get_citizen_social_profile(uuid);

CREATE FUNCTION public.get_citizen_social_profile(p_citizen_id uuid)
RETURNS TABLE (
    citizen_id uuid,
    public_name text,
    avatar_url text,
    political_party text,
    social_class text,
    profession text,
    registration_date timestamptz,
    follower_count bigint,
    following_count bigint,
    current_user_following boolean,
    is_own_profile boolean,
    posts jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
    v_current_citizen_id uuid;
begin
    if auth.uid() is null then
        raise exception 'Authentication required.';
    end if;

    select c.id
      into v_current_citizen_id
      from public.citizens as c
     where c.auth_user_id = auth.uid()
     limit 1;

    if v_current_citizen_id is null then
        return;
    end if;

    return query
    with target_profile as (
        select
            c.id as citizen_id,
            c.public_name,
            case
                when c.avatar_url = './assets/avatars/aurelia-voss.svg'
                  or c.avatar_url = './assets/avatars/jasper-reed.svg'
                  or c.avatar_url = './assets/avatars/mira-sloane.svg'
                  or c.avatar_url = './assets/avatars/dorian-kestrel.svg'
                  or c.avatar_url = './assets/avatars/leah-cortez.svg'
                  or c.avatar_url = './assets/avatars/omar-tate.svg'
                    then c.avatar_url
                else './assets/avatars/aurelia-voss.svg'
            end as avatar_url,
            c.political_party,
            coalesce(cp.social_class, 'Unknown') as social_class,
            coalesce(cp.profession, 'Unknown') as profession,
            c.registration_date,
            (
                select count(*)::bigint
                from public.social_follows as sf
                where sf.following_citizen_id = c.id
            ) as follower_count,
            (
                select count(*)::bigint
                from public.social_follows as sf
                where sf.follower_citizen_id = c.id
            ) as following_count,
            exists (
                select 1
                from public.social_follows as sf
                where sf.follower_citizen_id = v_current_citizen_id
                  and sf.following_citizen_id = c.id
            ) as current_user_following,
            (c.id = v_current_citizen_id) as is_own_profile
        from public.citizens as c
        left join public.citizen_private as cp
          on cp.citizen_id = c.id
        where c.id = p_citizen_id
    ),
    selected_posts as (
        select
            sp.id,
            sp.content,
            sp.created_at,
            sp.updated_at,
            sp.citizen_id as author_citizen_id,
            author.public_name as author_public_name,
            case
                when author.avatar_url = './assets/avatars/aurelia-voss.svg'
                  or author.avatar_url = './assets/avatars/jasper-reed.svg'
                  or author.avatar_url = './assets/avatars/mira-sloane.svg'
                  or author.avatar_url = './assets/avatars/dorian-kestrel.svg'
                  or author.avatar_url = './assets/avatars/leah-cortez.svg'
                  or author.avatar_url = './assets/avatars/omar-tate.svg'
                    then author.avatar_url
                else './assets/avatars/aurelia-voss.svg'
            end as author_avatar_url,
            (
                select count(*)
                from public.social_post_reactions as spr
                where spr.post_id = sp.id
                  and spr.reaction_type = 'like'
            ) as like_count,
            (
                select count(*)
                from public.social_comments as sc
                where sc.post_id = sp.id
                  and sc.deleted_at is null
            ) as comment_count,
            (
                select count(*)
                from public.social_post_reactions as spr
                where spr.post_id = sp.id
                  and spr.reaction_type = 'repost'
            ) as repost_count,
            exists (
                select 1
                from public.social_post_reactions as spr
                where spr.post_id = sp.id
                  and spr.citizen_id = v_current_citizen_id
                  and spr.reaction_type = 'like'
            ) as liked_by_current_user,
            exists (
                select 1
                from public.social_post_reactions as spr
                where spr.post_id = sp.id
                  and spr.citizen_id = v_current_citizen_id
                  and spr.reaction_type = 'repost'
            ) as reposted_by_current_user,
            exists (
                select 1
                from public.social_follows as sf
                where sf.follower_citizen_id = v_current_citizen_id
                  and sf.following_citizen_id = sp.citizen_id
            ) as current_user_following_author,
            (sp.citizen_id = v_current_citizen_id) as is_own_post
        from public.social_posts as sp
        join public.citizens as author
          on author.id = sp.citizen_id
        where sp.citizen_id = p_citizen_id
          and sp.deleted_at is null
        order by sp.created_at desc, sp.id desc
        limit 20
    ),
    posts_json as (
        select coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'id', sp.id,
                    'content', sp.content,
                    'created_at', sp.created_at,
                    'updated_at', sp.updated_at,
                    'author', jsonb_build_object(
                        'id', sp.author_citizen_id,
                        'public_name', sp.author_public_name,
                        'avatar_url', sp.author_avatar_url
                    ),
                    'like_count', sp.like_count,
                    'comment_count', sp.comment_count,
                    'repost_count', sp.repost_count,
                    'liked_by_current_user', sp.liked_by_current_user,
                    'reposted_by_current_user', sp.reposted_by_current_user,
                    'current_user_following_author', sp.current_user_following_author,
                    'is_own_post', sp.is_own_post
                )
                order by sp.created_at desc, sp.id desc
            ),
            '[]'::jsonb
        ) as posts
        from selected_posts as sp
    )
    select
        tp.citizen_id,
        tp.public_name,
        tp.avatar_url,
        tp.political_party,
        tp.social_class,
        tp.profession,
        tp.registration_date,
        tp.follower_count,
        tp.following_count,
        tp.current_user_following,
        tp.is_own_profile,
        pj.posts
    from target_profile as tp
    cross join posts_json as pj
    where tp.citizen_id = p_citizen_id;
end;
$$;

ALTER FUNCTION public.get_citizen_social_profile(uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_citizen_social_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_citizen_social_profile(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_citizen_social_profile(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_citizen_social_profile(uuid) TO authenticated;

COMMIT;
