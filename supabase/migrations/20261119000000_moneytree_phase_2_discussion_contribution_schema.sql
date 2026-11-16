BEGIN;

-- MoneyTree discussion foundation.
--
-- The initial question set (at least 10 question discussions) will be seeded by a trusted
-- backend process after this schema is applied. This migration intentionally does not create
-- or seed the discussion content itself.

CREATE TABLE public.moneytree_discussions (
    id uuid primary key default gen_random_uuid(),
    discussion_type text not null check (
        discussion_type in ('question', 'career', 'open_chat')
    ),
    title text not null check (
        length(btrim(title)) > 0
        and length(title) <= 160
    ),
    prompt text not null check (
        length(btrim(prompt)) > 0
        and length(prompt) <= 5000
    ),
    profession_gate text null check (
        profession_gate is null
        or length(btrim(profession_gate)) > 0
    ),
    created_by_citizen_id uuid not null references public.citizens(id) on delete restrict,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    archived_at timestamptz null,

    constraint moneytree_discussions_career_requires_profession_gate
        check (
            discussion_type <> 'career'
            or profession_gate is not null
        ),

    constraint moneytree_discussions_noncareer_forbids_profession_gate
        check (
            discussion_type = 'career'
            or profession_gate is null
        )
);

CREATE UNIQUE INDEX idx_moneytree_discussions_open_chat_active
    ON public.moneytree_discussions (discussion_type)
    WHERE discussion_type = 'open_chat' AND is_active = true;

CREATE INDEX idx_moneytree_discussions_type_active_created_at
    ON public.moneytree_discussions (discussion_type, is_active, created_at desc);

CREATE INDEX idx_moneytree_discussions_profession_gate
    ON public.moneytree_discussions (profession_gate);

CREATE INDEX idx_moneytree_discussions_creator_created_at
    ON public.moneytree_discussions (created_by_citizen_id, created_at desc);

-- MoneyTree contribution foundation.
-- Every contribution belongs to a citizen and a discussion.
-- Challenges and replies must have a parent contribution.
-- Initial answers and open-chat posts do not require a parent.
-- A parent contribution cannot be deleted while children still reference it.
CREATE TABLE public.moneytree_contributions (
    id uuid primary key default gen_random_uuid(),
    discussion_id uuid not null references public.moneytree_discussions(id) on delete restrict,
    citizen_id uuid not null references public.citizens(id) on delete restrict,
    contribution_type text not null check (
        contribution_type in (
            'question_answer',
            'career_answer',
            'open_discussion',
            'challenge',
            'reply'
        )
    ),
    parent_contribution_id uuid null,
    content text not null check (
        length(btrim(content)) > 0
        and length(content) <= 4000
    ),
    word_count integer not null default 0 check (word_count >= 0),
    created_at timestamptz not null default now(),
    UNIQUE (id, discussion_id),

    constraint moneytree_contributions_parent_relationship_required
        check (
            (
                contribution_type in ('challenge', 'reply')
                and parent_contribution_id is not null
            )
            or (
                contribution_type in ('question_answer', 'career_answer', 'open_discussion')
                and parent_contribution_id is null
            )
        )
);

ALTER TABLE public.moneytree_contributions
    ADD CONSTRAINT moneytree_contributions_parent_discussion_fk
    FOREIGN KEY (parent_contribution_id, discussion_id)
    REFERENCES public.moneytree_contributions (id, discussion_id)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX idx_moneytree_contributions_discussion_created_at
    ON public.moneytree_contributions (discussion_id, created_at desc);

CREATE INDEX idx_moneytree_contributions_citizen_discussion_created_at
    ON public.moneytree_contributions (citizen_id, discussion_id, created_at desc);

CREATE INDEX idx_moneytree_contributions_parent_created_at
    ON public.moneytree_contributions (parent_contribution_id, discussion_id, created_at desc);

CREATE INDEX idx_moneytree_contributions_type_created_at
    ON public.moneytree_contributions (contribution_type, created_at desc);

-- RLS and explicit browser restrictions.
ALTER TABLE public.moneytree_discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moneytree_contributions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.moneytree_discussions FROM PUBLIC;
REVOKE ALL ON TABLE public.moneytree_discussions FROM anon;
REVOKE ALL ON TABLE public.moneytree_discussions FROM authenticated;
REVOKE ALL ON TABLE public.moneytree_discussions FROM service_role;

REVOKE ALL ON TABLE public.moneytree_contributions FROM PUBLIC;
REVOKE ALL ON TABLE public.moneytree_contributions FROM anon;
REVOKE ALL ON TABLE public.moneytree_contributions FROM authenticated;
REVOKE ALL ON TABLE public.moneytree_contributions FROM service_role;

GRANT SELECT
    ON TABLE public.moneytree_discussions TO service_role;

GRANT SELECT
    ON TABLE public.moneytree_contributions TO service_role;

GRANT INSERT (
    discussion_type,
    title,
    prompt,
    profession_gate,
    created_by_citizen_id,
    is_active,
    created_at,
    archived_at
)
    ON TABLE public.moneytree_discussions TO service_role;

GRANT INSERT (
    discussion_id,
    citizen_id,
    contribution_type,
    parent_contribution_id,
    content,
    word_count,
    created_at
)
    ON TABLE public.moneytree_contributions TO service_role;

-- Browser clients are blocked from direct writes by RLS + no browser grants.
CREATE POLICY moneytree_discussions_no_browser_insert
    ON public.moneytree_discussions
    FOR INSERT
    TO authenticated
    WITH CHECK (false);

CREATE POLICY moneytree_discussions_no_browser_update
    ON public.moneytree_discussions
    FOR UPDATE
    TO authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY moneytree_discussions_no_browser_delete
    ON public.moneytree_discussions
    FOR DELETE
    TO authenticated
    USING (false);

CREATE POLICY moneytree_contributions_no_browser_insert
    ON public.moneytree_contributions
    FOR INSERT
    TO authenticated
    WITH CHECK (false);

CREATE POLICY moneytree_contributions_no_browser_update
    ON public.moneytree_contributions
    FOR UPDATE
    TO authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY moneytree_contributions_no_browser_delete
    ON public.moneytree_contributions
    FOR DELETE
    TO authenticated
    USING (false);

COMMIT;
