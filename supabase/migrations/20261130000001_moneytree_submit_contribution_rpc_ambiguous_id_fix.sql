BEGIN;

CREATE OR REPLACE FUNCTION public.submit_moneytree_contribution(
    p_discussion_id uuid,
    p_contribution_type text,
    p_parent_contribution_id uuid,
    p_content text,
    p_submission_request_id uuid
)
RETURNS TABLE (
    id uuid,
    moderation_state text,
    result text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
    v_citizen_id uuid;
    v_citizen_private record;
    v_discussion record;
    v_parent record;
    v_original record;
    v_now timestamptz;
    v_normalized text;
    v_word_count integer;
    v_bucket text;
    v_last_contribution record;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
    END IF;

    IF p_submission_request_id IS NULL THEN
        RAISE EXCEPTION 'submission_request_id is required.' USING ERRCODE = '23502';
    END IF;

    IF p_discussion_id IS NULL THEN
        RAISE EXCEPTION 'discussion_id is required.' USING ERRCODE = '23502';
    END IF;

    IF p_contribution_type IS NULL THEN
        RAISE EXCEPTION 'contribution_type is required.' USING ERRCODE = '23502';
    END IF;

    IF p_content IS NULL OR regexp_replace(p_content, '\s+', '', 'g') = '' THEN
        RAISE EXCEPTION 'Content is required.' USING ERRCODE = '23502';
    END IF;

    SELECT c.id
      INTO v_citizen_id
      FROM public.citizens AS c
     WHERE c.auth_user_id = v_user;

    IF v_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Authenticated citizen record not found.' USING ERRCODE = '23503';
    END IF;

    SELECT cp.*
      INTO v_citizen_private
      FROM public.citizen_private AS cp
     WHERE cp.citizen_id = v_citizen_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Citizen private record not found.' USING ERRCODE = '23503';
    END IF;

    SELECT mc.id, mc.moderation_state, mc.discussion_id, mc.contribution_type,
           mc.parent_contribution_id, mc.content
      INTO v_original
      FROM public.moneytree_contributions AS mc
     WHERE mc.citizen_id = v_citizen_id
       AND mc.submission_request_id = p_submission_request_id
     LIMIT 1;

    IF FOUND THEN
        IF v_original.discussion_id <> p_discussion_id
            OR v_original.contribution_type <> p_contribution_type
            OR v_original.parent_contribution_id IS DISTINCT FROM p_parent_contribution_id
            OR v_original.content <> p_content THEN
            RAISE EXCEPTION 'submission_request_id already used with different payload.' USING ERRCODE = '23505';
        END IF;

        RETURN QUERY
        SELECT v_original.id AS id,
               v_original.moderation_state AS moderation_state,
               'duplicate_request'::text AS result;
        RETURN;
    END IF;

    SELECT md.*
      INTO v_discussion
      FROM public.moneytree_discussions AS md
     WHERE md.id = p_discussion_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Discussion not found.' USING ERRCODE = '23503';
    END IF;

    IF NOT v_discussion.is_active THEN
        RAISE EXCEPTION 'Discussion is inactive.' USING ERRCODE = '23514';
    END IF;

    IF p_contribution_type = 'reply' THEN
        RAISE EXCEPTION 'Ordinary replies are not allowed.' USING ERRCODE = '23514';
    END IF;

    IF p_contribution_type NOT IN ('question_answer', 'career_answer', 'open_discussion', 'challenge') THEN
        RAISE EXCEPTION 'Contribution type is not allowed.' USING ERRCODE = '23514';
    END IF;

    IF p_parent_contribution_id IS NULL THEN
        IF p_contribution_type = 'challenge' THEN
            RAISE EXCEPTION 'Challenges require a parent contribution.' USING ERRCODE = '23514';
        END IF;
    ELSE
        IF p_contribution_type <> 'challenge' THEN
            RAISE EXCEPTION 'Only challenge contributions may include a parent contribution.' USING ERRCODE = '23514';
        END IF;

        SELECT mc.*
          INTO v_parent
          FROM public.moneytree_contributions AS mc
         WHERE mc.id = p_parent_contribution_id
         FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Parent contribution not found.' USING ERRCODE = '23503';
        END IF;

        IF v_parent.discussion_id <> p_discussion_id THEN
            RAISE EXCEPTION 'Parent contribution is not in the target discussion.' USING ERRCODE = '23514';
        END IF;

        IF v_parent.citizen_id = v_citizen_id THEN
            RAISE EXCEPTION 'Citizens cannot challenge their own contributions.' USING ERRCODE = '23514';
        END IF;

        IF v_parent.moderation_state = 'rejected' THEN
            RAISE EXCEPTION 'Challenges cannot target a rejected contribution.' USING ERRCODE = '23514';
        END IF;

        IF EXISTS (
            WITH RECURSIVE ancestor_chain AS (
                SELECT c.id,
                       c.parent_contribution_id,
                       c.moderation_state,
                       ARRAY[c.id]::uuid[] AS visited_ids
                  FROM public.moneytree_contributions AS c
                 WHERE c.id = p_parent_contribution_id

                UNION ALL

                SELECT c.id,
                       c.parent_contribution_id,
                       c.moderation_state,
                       ac.visited_ids || c.id
                  FROM public.moneytree_contributions AS c
                  JOIN ancestor_chain AS ac
                    ON ac.parent_contribution_id = c.id
                 WHERE NOT c.id = ANY(ac.visited_ids)
            )
            SELECT 1
              FROM ancestor_chain AS ac
             WHERE ac.moderation_state = 'rejected'
             LIMIT 1
        ) THEN
            RAISE EXCEPTION 'Challenges cannot target a contribution within a rejected branch.' USING ERRCODE = '23514';
        END IF;
    END IF;

    IF p_contribution_type = 'question_answer' AND v_discussion.discussion_type <> 'question' THEN
        RAISE EXCEPTION 'Question discussions accept question_answer contributions only.' USING ERRCODE = '23514';
    END IF;

    IF p_contribution_type = 'career_answer' AND v_discussion.discussion_type <> 'career' THEN
        RAISE EXCEPTION 'Career discussions accept career_answer contributions only.' USING ERRCODE = '23514';
    END IF;

    IF p_contribution_type = 'open_discussion' AND v_discussion.discussion_type <> 'open_chat' THEN
        RAISE EXCEPTION 'Open discussion posts are only valid in open_chat discussions.' USING ERRCODE = '23514';
    END IF;

    IF v_discussion.discussion_type = 'career' THEN
        IF lower(trim(v_citizen_private.profession)) IS DISTINCT FROM lower(trim(v_discussion.profession_gate)) THEN
            RAISE EXCEPTION 'Citizen profession does not meet this career discussion requirement.' USING ERRCODE = '23514';
        END IF;
    END IF;

    IF length(p_content) > 4000 THEN
        RAISE EXCEPTION 'Content exceeds the maximum allowed length.' USING ERRCODE = '22001';
    END IF;

    v_normalized := lower(regexp_replace(trim(p_content), '\s+', ' ', 'g'));

    IF EXISTS (
        SELECT 1
          FROM public.moneytree_contributions AS mc
         WHERE mc.citizen_id = v_citizen_id
           AND mc.moderation_state <> 'rejected'
           AND lower(regexp_replace(trim(mc.content), '\s+', ' ', 'g')) = v_normalized
    ) THEN
        RAISE EXCEPTION 'Duplicate content from this citizen is not allowed.' USING ERRCODE = '23514';
    END IF;

    v_word_count := (
        SELECT count(*)::integer
          FROM regexp_split_to_table(v_normalized, '\s+') AS split_words(token)
         WHERE token ~ '[[:alnum:]]'
    );

    IF p_contribution_type IN ('question_answer', 'career_answer') AND v_word_count < 25 THEN
        RAISE EXCEPTION 'Initial question and career answers require at least 25 words.' USING ERRCODE = '23514';
    END IF;

    v_now := clock_timestamp();

    IF v_discussion.discussion_type = 'career' THEN
        v_bucket := 'career';
    ELSE
        v_bucket := 'general';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.moneytree_contributions AS mc
          JOIN public.moneytree_discussions AS md
            ON md.id = mc.discussion_id
         WHERE mc.citizen_id = v_citizen_id
           AND mc.moderation_state <> 'rejected'
           AND mc.created_at >= v_now - interval '2 minutes'
           AND (
                (v_bucket = 'career' AND md.discussion_type = 'career')
                OR (v_bucket = 'general' AND md.discussion_type IN ('question', 'open_chat'))
           )
    ) THEN
        RAISE EXCEPTION 'Cooldown has not expired.' USING ERRCODE = '23514';
    END IF;

    SELECT mc.citizen_id, mc.created_at
      INTO v_last_contribution
      FROM public.moneytree_contributions AS mc
     WHERE mc.discussion_id = p_discussion_id
       AND mc.moderation_state <> 'rejected'
     ORDER BY mc.created_at DESC
     LIMIT 1;

    IF FOUND AND v_last_contribution.citizen_id = v_citizen_id THEN
        RAISE EXCEPTION 'Another citizen must contribute before this citizen can contribute again in the same discussion.' USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.moneytree_contributions AS inserted (
        discussion_id,
        citizen_id,
        contribution_type,
        parent_contribution_id,
        content,
        word_count,
        moderation_state,
        submission_request_id,
        created_at
    )
    VALUES (
        p_discussion_id,
        v_citizen_id,
        p_contribution_type,
        p_parent_contribution_id,
        p_content,
        v_word_count,
        'pending',
        p_submission_request_id,
        v_now
    )
    RETURNING inserted.id, inserted.moderation_state INTO v_original;

    RETURN QUERY
    SELECT v_original.id AS id,
           v_original.moderation_state AS moderation_state,
           'submitted'::text AS result;
END;
$$;

ALTER FUNCTION public.submit_moneytree_contribution(
    uuid,
    text,
    uuid,
    text,
    uuid
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.submit_moneytree_contribution(uuid, text, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_moneytree_contribution(uuid, text, uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_moneytree_contribution(uuid, text, uuid, text, uuid) TO authenticated;

COMMIT;
