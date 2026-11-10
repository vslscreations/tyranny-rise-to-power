-- Social Media Phase 1: core database tables and RLS
-- This migration is intentionally scoped to the social-media foundation only.
-- It does not modify the existing citizen tables, triggers, grants, or authentication model.
-- It does not apply any public grants to public.citizens.
-- The project continues to resolve citizen identity from auth.uid() -> public.citizens.auth_user_id -> public.citizens.id.

create extension if not exists pgcrypto;

create or replace function public.social_set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create or replace function public.social_validate_report_target()
returns trigger
language plpgsql
as $$
begin
    if new.target_type = 'post' and not exists (
        select 1
        from public.social_posts sp
        where sp.id = new.target_id
    ) then
        raise exception 'Report target post does not exist.';
    end if;

    if new.target_type = 'comment' and not exists (
        select 1
        from public.social_comments sc
        where sc.id = new.target_id
    ) then
        raise exception 'Report target comment does not exist.';
    end if;

    return new;
end;
$$;

create or replace function public.social_restrict_deleted_parent_content()
returns trigger
language plpgsql
as $$
begin
    if exists (
        select 1
        from public.social_posts sp
        where sp.id = new.post_id
          and sp.deleted_at is not null
    ) then
        raise exception 'Cannot create content for a deleted post.';
    end if;

    return new;
end;
$$;

create or replace function public.social_current_citizen_id()
returns uuid
language sql
security definer
set search_path = pg_catalog, public
as $$
    select c.id
    from public.citizens c
    where c.auth_user_id = auth.uid()
    limit 1;
$$;

revoke all on function public.social_current_citizen_id() from public;
revoke all on function public.social_current_citizen_id() from anon;
grant execute on function public.social_current_citizen_id() to authenticated;

create or replace function public.social_apply_auth_citizen_ownership()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_citizen_id uuid;
begin
    v_citizen_id := public.social_current_citizen_id();

    if v_citizen_id is null then
        raise exception 'Authenticated citizen record not found for social media insert.';
    end if;

    if tg_table_name = 'social_posts' then
        new.citizen_id := v_citizen_id;
    elsif tg_table_name = 'social_comments' then
        new.citizen_id := v_citizen_id;
    elsif tg_table_name = 'social_post_reactions' then
        new.citizen_id := v_citizen_id;
    elsif tg_table_name = 'social_follows' then
        new.follower_citizen_id := v_citizen_id;
    elsif tg_table_name = 'social_reports' then
        new.reporter_citizen_id := v_citizen_id;
    end if;

    return new;
end;
$$;

revoke all on function public.social_apply_auth_citizen_ownership() from public;
revoke all on function public.social_apply_auth_citizen_ownership() from anon;

create table if not exists public.social_posts (
    id uuid primary key default gen_random_uuid(),
    citizen_id uuid not null references public.citizens(id) on delete cascade,
    content text not null check (
        length(btrim(content)) > 0
        and length(content) <= 280
    ),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz null
);

create table if not exists public.social_comments (
    id uuid primary key default gen_random_uuid(),
    post_id uuid not null references public.social_posts(id) on delete cascade,
    citizen_id uuid not null references public.citizens(id) on delete cascade,
    content text not null check (
        length(btrim(content)) > 0
        and length(content) <= 500
    ),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz null,
    parent_comment_id uuid null references public.social_comments(id) on delete cascade
);

create table if not exists public.social_post_reactions (
    id uuid primary key default gen_random_uuid(),
    post_id uuid not null references public.social_posts(id) on delete cascade,
    citizen_id uuid not null references public.citizens(id) on delete cascade,
    reaction_type text not null check (reaction_type in ('like', 'repost')),
    created_at timestamptz not null default now(),
    constraint social_post_reactions_unique_per_user_per_post_type unique (post_id, citizen_id, reaction_type)
);

create table if not exists public.social_follows (
    id uuid primary key default gen_random_uuid(),
    follower_citizen_id uuid not null references public.citizens(id) on delete cascade,
    following_citizen_id uuid not null references public.citizens(id) on delete cascade,
    created_at timestamptz not null default now(),
    constraint social_follows_unique_pair unique (follower_citizen_id, following_citizen_id),
    constraint social_follows_no_self_follow check (follower_citizen_id <> following_citizen_id)
);

create table if not exists public.social_reports (
    id uuid primary key default gen_random_uuid(),
    target_type text not null check (target_type in ('post', 'comment')),
    target_id uuid not null,
    reporter_citizen_id uuid not null references public.citizens(id) on delete cascade,
    reason text not null check (
        length(btrim(reason)) > 0
        and length(reason) <= 1000
    ),
    status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed', 'actioned')),
    created_at timestamptz not null default now(),
    reviewed_by_citizen_id uuid null references public.citizens(id) on delete set null,
    reviewed_at timestamptz null,
    moderator_notes text null check (moderator_notes is null or length(btrim(moderator_notes)) > 0)
);

create index if not exists idx_social_posts_citizen_created_at
    on public.social_posts (citizen_id, created_at desc);

create index if not exists idx_social_posts_public_feed
    on public.social_posts (deleted_at, created_at desc);

create index if not exists idx_social_comments_post_created_at
    on public.social_comments (post_id, created_at desc);

create index if not exists idx_social_comments_citizen_created_at
    on public.social_comments (citizen_id, created_at desc);

create index if not exists idx_social_comments_visible_post_index
    on public.social_comments (post_id, deleted_at, created_at desc);

create index if not exists idx_social_post_reactions_post_type_created_at
    on public.social_post_reactions (post_id, reaction_type, created_at desc);

create index if not exists idx_social_post_reactions_citizen_type
    on public.social_post_reactions (citizen_id, reaction_type);

create index if not exists idx_social_follows_follower_created_at
    on public.social_follows (follower_citizen_id, created_at desc);

create index if not exists idx_social_follows_following_created_at
    on public.social_follows (following_citizen_id, created_at desc);

create index if not exists idx_social_reports_status_created_at
    on public.social_reports (status, created_at desc);

create index if not exists idx_social_reports_reporter_created_at
    on public.social_reports (reporter_citizen_id, created_at desc);

create trigger social_posts_set_citizen_id
before insert on public.social_posts
for each row
execute function public.social_apply_auth_citizen_ownership();

create trigger social_posts_set_updated_at
before update on public.social_posts
for each row
execute function public.social_set_updated_at();

create trigger social_comments_set_citizen_id
before insert on public.social_comments
for each row
execute function public.social_apply_auth_citizen_ownership();

create trigger social_comments_set_updated_at
before update on public.social_comments
for each row
execute function public.social_set_updated_at();

create trigger social_post_reactions_set_citizen_id
before insert on public.social_post_reactions
for each row
execute function public.social_apply_auth_citizen_ownership();

create trigger social_follows_set_citizen_id
before insert on public.social_follows
for each row
execute function public.social_apply_auth_citizen_ownership();

create trigger social_reports_set_citizen_id
before insert on public.social_reports
for each row
execute function public.social_apply_auth_citizen_ownership();

create trigger social_comments_block_deleted_posts
before insert or update on public.social_comments
for each row
execute function public.social_restrict_deleted_parent_content();

create trigger social_post_reactions_block_deleted_posts
before insert or update on public.social_post_reactions
for each row
execute function public.social_restrict_deleted_parent_content();

create trigger social_reports_validate_target
before insert or update on public.social_reports
for each row
execute function public.social_validate_report_target();

alter table public.social_posts enable row level security;
alter table public.social_comments enable row level security;
alter table public.social_post_reactions enable row level security;
alter table public.social_follows enable row level security;
alter table public.social_reports enable row level security;

revoke all on table public.social_posts from public;
revoke all on table public.social_posts from anon;
revoke all on table public.social_posts from authenticated;
revoke all on table public.social_comments from public;
revoke all on table public.social_comments from anon;
revoke all on table public.social_comments from authenticated;
revoke all on table public.social_post_reactions from public;
revoke all on table public.social_post_reactions from anon;
revoke all on table public.social_post_reactions from authenticated;
revoke all on table public.social_follows from public;
revoke all on table public.social_follows from anon;
revoke all on table public.social_follows from authenticated;
revoke all on table public.social_reports from public;
revoke all on table public.social_reports from anon;
revoke all on table public.social_reports from authenticated;

grant select on table public.social_posts to authenticated;
grant insert (content) on table public.social_posts to authenticated;
grant update (content, deleted_at) on table public.social_posts to authenticated;
grant select on table public.social_comments to authenticated;
grant insert (post_id, content) on table public.social_comments to authenticated;
grant update (content, deleted_at) on table public.social_comments to authenticated;
grant select on table public.social_post_reactions to authenticated;
grant insert (post_id, reaction_type) on table public.social_post_reactions to authenticated;
grant delete on table public.social_post_reactions to authenticated;
grant select on table public.social_follows to authenticated;
grant insert (following_citizen_id) on table public.social_follows to authenticated;
grant delete on table public.social_follows to authenticated;
grant select on table public.social_reports to authenticated;
grant insert (target_type, target_id, reason) on table public.social_reports to authenticated;
grant all on table public.social_posts to service_role;
grant all on table public.social_comments to service_role;
grant all on table public.social_post_reactions to service_role;
grant all on table public.social_follows to service_role;
grant all on table public.social_reports to service_role;

create policy "social_posts_select_authenticated"
on public.social_posts
for select
to authenticated
using (deleted_at is null);

create policy "social_posts_insert_own"
on public.social_posts
for insert
to authenticated
with check (
    citizen_id = public.social_current_citizen_id()
    and content is not null
    and length(btrim(content)) > 0
    and length(content) <= 280
);

create policy "social_posts_update_own"
on public.social_posts
for update
to authenticated
using (
    citizen_id = public.social_current_citizen_id()
)
with check (
    citizen_id = public.social_current_citizen_id()
    and length(btrim(content)) > 0
    and length(content) <= 280
);

create policy "social_comments_select_authenticated"
on public.social_comments
for select
to authenticated
using (
    deleted_at is null
    and post_id in (
        select sp.id
        from public.social_posts sp
        where sp.deleted_at is null
    )
);

create policy "social_comments_insert_own"
on public.social_comments
for insert
to authenticated
with check (
    citizen_id = public.social_current_citizen_id()
    and post_id in (
        select sp.id
        from public.social_posts sp
        where sp.deleted_at is null
    )
    and content is not null
    and length(btrim(content)) > 0
    and length(content) <= 500
);

create policy "social_comments_update_own"
on public.social_comments
for update
to authenticated
using (
    citizen_id = public.social_current_citizen_id()
)
with check (
    citizen_id = public.social_current_citizen_id()
    and length(btrim(content)) > 0
    and length(content) <= 500
);

create policy "social_post_reactions_select_own"
on public.social_post_reactions
for select
to authenticated
using (
    citizen_id = public.social_current_citizen_id()
    and post_id in (
        select sp.id
        from public.social_posts sp
        where sp.deleted_at is null
    )
);

create policy "social_post_reactions_insert_own"
on public.social_post_reactions
for insert
to authenticated
with check (
    citizen_id = public.social_current_citizen_id()
    and post_id in (
        select sp.id
        from public.social_posts sp
        where sp.deleted_at is null
    )
    and reaction_type in ('like', 'repost')
);

create policy "social_post_reactions_delete_own"
on public.social_post_reactions
for delete
to authenticated
using (
    citizen_id = public.social_current_citizen_id()
);

create policy "social_follows_select_own_or_related"
on public.social_follows
for select
to authenticated
using (
    follower_citizen_id = public.social_current_citizen_id()
    or following_citizen_id = public.social_current_citizen_id()
);

create policy "social_follows_insert_own"
on public.social_follows
for insert
to authenticated
with check (
    follower_citizen_id = public.social_current_citizen_id()
    and following_citizen_id <> public.social_current_citizen_id()
    and following_citizen_id is not null
);

create policy "social_follows_delete_own"
on public.social_follows
for delete
to authenticated
using (
    follower_citizen_id = public.social_current_citizen_id()
);

create policy "social_reports_select_own"
on public.social_reports
for select
to authenticated
using (
    reporter_citizen_id = public.social_current_citizen_id()
);

create policy "social_reports_insert_own"
on public.social_reports
for insert
to authenticated
with check (
    reporter_citizen_id = public.social_current_citizen_id()
    and target_type in ('post', 'comment')
    and target_id is not null
    and length(btrim(reason)) > 0
    and status = 'pending'
    and reviewed_by_citizen_id is null
    and reviewed_at is null
    and moderator_notes is null
);

-- The absence of an update policy on social_reports preserves moderator-only behavior for a future Admin Dashboard.
-- Regular authenticated users may not alter status, reviewer identity, review timestamps, or moderator notes.

-- Public profile access remains intentionally constrained to avoid broadening access to public.citizens.
-- If Social Media later needs public profile data, prefer a dedicated narrow view or RPC that exposes only
-- approved public fields (e.g., public_name and avatar_url) rather than widening citizen table access.
