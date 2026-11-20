BEGIN;

CREATE OR REPLACE FUNCTION public.owner_get_polls()
RETURNS TABLE (
    poll_id uuid,
    question text,
    description text,
    required_diploma boolean,
    status text,
    created_at timestamptz,
    opened_at timestamptz,
    closed_at timestamptz,
    total_votes bigint,
    total_eligible bigint,
    turnout numeric,
    winner_option_id uuid,
    winner_text text,
    options jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL OR NOT public.is_owner_for_authenticated_user(v_user) THEN
        RAISE EXCEPTION 'Owner access required.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH poll_base AS (
        SELECT
            p.id AS poll_id,
            p.question,
            p.description,
            p.required_diploma,
            p.status,
            p.created_at,
            p.opened_at,
            p.closed_at,
            COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', po.id,
                        'option_text', po.option_text,
                        'sort_order', po.sort_order,
                        'vote_count', (
                            SELECT COUNT(*)
                            FROM public.poll_votes AS pv
                            WHERE pv.option_id = po.id
                        ),
                        'percent', CASE
                            WHEN (
                                SELECT COUNT(*)
                                FROM public.poll_votes AS pv
                                WHERE pv.poll_id = p.id
                            ) > 0 THEN ROUND(
                                (
                                    (
                                        SELECT COUNT(*)
                                        FROM public.poll_votes AS pv
                                        WHERE pv.option_id = po.id
                                    )::numeric
                                    /
                                    (
                                        SELECT COUNT(*)
                                        FROM public.poll_votes AS pv
                                        WHERE pv.poll_id = p.id
                                    )::numeric
                                ) * 100,
                                2
                            )
                            ELSE 0
                        END
                    )
                    ORDER BY po.sort_order, po.option_text
                )
                FROM public.poll_options AS po
                WHERE po.poll_id = p.id
            ), '[]'::jsonb) AS options,
            (
                SELECT COUNT(*)
                FROM public.poll_votes AS pv
                WHERE pv.poll_id = p.id
            ) AS total_votes,
            (
                SELECT COUNT(*)
                FROM public.citizens AS c
                LEFT JOIN public.citizen_private AS cp ON cp.citizen_id = c.id
                WHERE (NOT p.required_diploma) OR (cp.education = 'High School Diploma')
            ) AS total_eligible,
            (
                WITH option_counts AS (
                    SELECT po.id, po.option_text, COUNT(pv.id) AS vote_count
                    FROM public.poll_options AS po
                    LEFT JOIN public.poll_votes AS pv ON pv.option_id = po.id AND pv.poll_id = p.id
                    WHERE po.poll_id = p.id
                    GROUP BY po.id, po.option_text
                ), max_vote AS (
                    SELECT MAX(vote_count) AS max_vote_count
                    FROM option_counts
                )
                SELECT CASE
                    WHEN (
                        SELECT COUNT(*)
                        FROM public.poll_votes AS pv
                        WHERE pv.poll_id = p.id
                    ) = 0 THEN NULL
                    WHEN (
                        SELECT COUNT(*)
                        FROM option_counts
                        WHERE vote_count = (SELECT max_vote_count FROM max_vote)
                    ) > 1 THEN NULL
                    ELSE (
                        SELECT id
                        FROM option_counts
                        WHERE vote_count = (SELECT max_vote_count FROM max_vote)
                        ORDER BY option_text ASC
                        LIMIT 1
                    )
                END
            ) AS winner_option_id,
            (
                WITH option_counts AS (
                    SELECT po.id, po.option_text, COUNT(pv.id) AS vote_count
                    FROM public.poll_options AS po
                    LEFT JOIN public.poll_votes AS pv ON pv.option_id = po.id AND pv.poll_id = p.id
                    WHERE po.poll_id = p.id
                    GROUP BY po.id, po.option_text
                ), max_vote AS (
                    SELECT MAX(vote_count) AS max_vote_count
                    FROM option_counts
                )
                SELECT CASE
                    WHEN (
                        SELECT COUNT(*)
                        FROM public.poll_votes AS pv
                        WHERE pv.poll_id = p.id
                    ) = 0 THEN 'No votes yet'
                    WHEN (
                        SELECT COUNT(*)
                        FROM option_counts
                        WHERE vote_count = (SELECT max_vote_count FROM max_vote)
                    ) = 1 THEN (
                        SELECT option_text
                        FROM option_counts
                        WHERE vote_count = (SELECT max_vote_count FROM max_vote)
                        LIMIT 1
                    )
                    ELSE 'Tie: ' || (
                        SELECT string_agg(option_text, ' / ' ORDER BY option_text)
                        FROM option_counts
                        WHERE vote_count = (SELECT max_vote_count FROM max_vote)
                    )
                END
            ) AS winner_text
        FROM public.polls AS p
    )
    SELECT
        poll_base.poll_id,
        poll_base.question,
        poll_base.description,
        poll_base.required_diploma,
        poll_base.status,
        poll_base.created_at,
        poll_base.opened_at,
        poll_base.closed_at,
        poll_base.total_votes,
        poll_base.total_eligible,
        CASE
            WHEN poll_base.total_eligible > 0 THEN round((poll_base.total_votes::numeric / poll_base.total_eligible::numeric) * 100, 2)
            ELSE 0
        END AS turnout,
        poll_base.winner_option_id,
        poll_base.winner_text,
        poll_base.options
    FROM poll_base
    ORDER BY poll_base.created_at DESC;
END;
$$;

ALTER FUNCTION public.owner_get_polls() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.owner_get_polls() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_get_polls() FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_get_polls() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_open_polls_for_citizen()
RETURNS TABLE (
    poll_id uuid,
    question text,
    description text,
    required_diploma boolean,
    created_at timestamptz,
    options jsonb,
    is_eligible boolean,
    user_has_voted boolean,
    my_vote_option_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
    v_citizen_id uuid;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
    END IF;

    v_citizen_id := public.citizen_id_for_authenticated_user(v_user);
    IF v_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Citizen record not found.' USING ERRCODE = '23503';
    END IF;

    RETURN QUERY
    WITH open_polls AS (
        SELECT
            p.id AS poll_id,
            p.question,
            p.description,
            p.required_diploma,
            p.created_at,
            COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', po.id,
                        'option_text', po.option_text,
                        'sort_order', po.sort_order
                    )
                    ORDER BY po.sort_order, po.option_text
                )
                FROM public.poll_options AS po
                WHERE po.poll_id = p.id
            ), '[]'::jsonb) AS options,
            (
                SELECT EXISTS (
                    SELECT 1
                    FROM public.poll_votes AS pv
                    WHERE pv.poll_id = p.id
                      AND pv.citizen_id = v_citizen_id
                )
            ) AS user_has_voted,
            (
                SELECT pv.option_id
                FROM public.poll_votes AS pv
                WHERE pv.poll_id = p.id
                  AND pv.citizen_id = v_citizen_id
                LIMIT 1
            ) AS my_vote_option_id,
            (
                SELECT (NOT p.required_diploma)
                OR EXISTS (
                    SELECT 1
                    FROM public.citizens AS c
                    LEFT JOIN public.citizen_private AS cp ON cp.citizen_id = c.id
                    WHERE c.id = v_citizen_id
                      AND (
                          (NOT p.required_diploma)
                          OR (cp.education = 'High School Diploma')
                      )
                )
            ) AS is_eligible
        FROM public.polls AS p
        WHERE p.status = 'open'
    )
    SELECT
        open_polls.poll_id,
        open_polls.question,
        open_polls.description,
        open_polls.required_diploma,
        open_polls.created_at,
        open_polls.options,
        open_polls.is_eligible,
        open_polls.user_has_voted,
        open_polls.my_vote_option_id
    FROM open_polls
    ORDER BY open_polls.created_at DESC;
END;
$$;

ALTER FUNCTION public.get_open_polls_for_citizen() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_open_polls_for_citizen() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_open_polls_for_citizen() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_open_polls_for_citizen() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_closed_polls_for_citizen()
RETURNS TABLE (
    poll_id uuid,
    question text,
    description text,
    required_diploma boolean,
    created_at timestamptz,
    closed_at timestamptz,
    options jsonb,
    turnout numeric,
    total_votes bigint,
    winner_text text,
    winner_percent numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
    v_citizen_id uuid;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
    END IF;

    v_citizen_id := public.citizen_id_for_authenticated_user(v_user);
    IF v_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Citizen record not found.' USING ERRCODE = '23503';
    END IF;

    RETURN QUERY
    WITH closed_polls AS (
        SELECT
            p.id AS poll_id,
            p.question,
            p.description,
            p.required_diploma,
            p.created_at,
            p.closed_at,
            COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', po.id,
                        'option_text', po.option_text,
                        'sort_order', po.sort_order,
                        'vote_count', (
                            SELECT COUNT(*)
                            FROM public.poll_votes AS pv
                            WHERE pv.option_id = po.id
                        ),
                        'percent', CASE
                            WHEN (
                                SELECT COUNT(*)
                                FROM public.poll_votes AS pv
                                WHERE pv.poll_id = p.id
                            ) > 0 THEN ROUND(
                                (
                                    (
                                        SELECT COUNT(*)
                                        FROM public.poll_votes AS pv
                                        WHERE pv.option_id = po.id
                                    )::numeric
                                    /
                                    (
                                        SELECT COUNT(*)
                                        FROM public.poll_votes AS pv
                                        WHERE pv.poll_id = p.id
                                    )::numeric
                                ) * 100,
                                2
                            )
                            ELSE 0
                        END
                    )
                    ORDER BY po.sort_order, po.option_text
                )
                FROM public.poll_options AS po
                WHERE po.poll_id = p.id
            ), '[]'::jsonb) AS options,
            (
                SELECT COUNT(*)
                FROM public.poll_votes AS pv
                WHERE pv.poll_id = p.id
            ) AS total_votes,
            (
                SELECT COUNT(*)
                FROM public.citizens AS c
                LEFT JOIN public.citizen_private AS cp ON cp.citizen_id = c.id
                WHERE (NOT p.required_diploma) OR (cp.education = 'High School Diploma')
            ) AS total_eligible,
            (
                WITH option_counts AS (
                    SELECT po.id, po.option_text, COUNT(pv.id) AS vote_count
                    FROM public.poll_options AS po
                    LEFT JOIN public.poll_votes AS pv ON pv.option_id = po.id AND pv.poll_id = p.id
                    WHERE po.poll_id = p.id
                    GROUP BY po.id, po.option_text
                ), max_vote AS (
                    SELECT MAX(vote_count) AS max_vote_count
                    FROM option_counts
                )
                SELECT CASE
                    WHEN (
                        SELECT COUNT(*)
                        FROM public.poll_votes AS pv
                        WHERE pv.poll_id = p.id
                    ) = 0 THEN 'No votes yet'
                    WHEN (
                        SELECT COUNT(*)
                        FROM option_counts
                        WHERE vote_count = (SELECT max_vote_count FROM max_vote)
                    ) = 1 THEN (
                        SELECT option_text
                        FROM option_counts
                        WHERE vote_count = (SELECT max_vote_count FROM max_vote)
                        LIMIT 1
                    )
                    ELSE 'Tie: ' || (
                        SELECT string_agg(option_text, ' / ' ORDER BY option_text)
                        FROM option_counts
                        WHERE vote_count = (SELECT max_vote_count FROM max_vote)
                    )
                END
            ) AS winner_text,
            (
                WITH option_counts AS (
                    SELECT po.id, po.option_text, COUNT(pv.id) AS vote_count
                    FROM public.poll_options AS po
                    LEFT JOIN public.poll_votes AS pv ON pv.option_id = po.id AND pv.poll_id = p.id
                    WHERE po.poll_id = p.id
                    GROUP BY po.id, po.option_text
                ), max_vote AS (
                    SELECT MAX(vote_count) AS max_vote_count
                    FROM option_counts
                )
                SELECT CASE
                    WHEN (
                        SELECT COUNT(*)
                        FROM public.poll_votes AS pv
                        WHERE pv.poll_id = p.id
                    ) = 0 THEN 0
                    ELSE ROUND(
                        (
                            (
                                SELECT COALESCE(SUM(vote_count), 0)
                                FROM option_counts
                                WHERE vote_count = (SELECT max_vote_count FROM max_vote)
                            )::numeric
                            /
                            (
                                SELECT COUNT(*)
                                FROM public.poll_votes AS pv
                                WHERE pv.poll_id = p.id
                            )::numeric
                        ) * 100,
                        2
                    )
                END
            ) AS winner_percent,
            (
                CASE
                    WHEN (
                        SELECT COUNT(*)
                        FROM public.citizens AS c
                        LEFT JOIN public.citizen_private AS cp ON cp.citizen_id = c.id
                        WHERE (NOT p.required_diploma) OR (cp.education = 'High School Diploma')
                    ) > 0 THEN ROUND(
                        (
                            (
                                SELECT COUNT(*)
                                FROM public.poll_votes AS pv
                                WHERE pv.poll_id = p.id
                            )::numeric
                            /
                            (
                                SELECT COUNT(*)
                                FROM public.citizens AS c
                                LEFT JOIN public.citizen_private AS cp ON cp.citizen_id = c.id
                                WHERE (NOT p.required_diploma) OR (cp.education = 'High School Diploma')
                            )::numeric
                        ) * 100,
                        2
                    )
                    ELSE 0
                END
            ) AS turnout
        FROM public.polls AS p
        WHERE p.status = 'closed'
    )
    SELECT
        closed_polls.poll_id,
        closed_polls.question,
        closed_polls.description,
        closed_polls.required_diploma,
        closed_polls.created_at,
        closed_polls.closed_at,
        closed_polls.options,
        closed_polls.turnout,
        closed_polls.total_votes,
        closed_polls.winner_text,
        closed_polls.winner_percent
    FROM closed_polls
    ORDER BY closed_polls.closed_at DESC;
END;
$$;

ALTER FUNCTION public.get_closed_polls_for_citizen() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_closed_polls_for_citizen() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_closed_polls_for_citizen() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_closed_polls_for_citizen() TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_upsert_poll_option(
    p_poll_id uuid,
    p_option_id uuid DEFAULT NULL,
    p_option_text text DEFAULT NULL
)
RETURNS TABLE (
    option_id uuid,
    poll_id uuid,
    option_text text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
    v_poll record;
    v_option_text text;
    v_return_option_id uuid;
    v_return_poll_id uuid;
    v_return_option_text text;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL OR NOT public.is_owner_for_authenticated_user(v_user) THEN
        RAISE EXCEPTION 'Owner access required.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_poll
    FROM public.polls AS p
    WHERE p.id = p_poll_id
    LIMIT 1
    FOR UPDATE;

    IF v_poll.id IS NULL THEN
        RAISE EXCEPTION 'Poll not found.' USING ERRCODE = '23503';
    END IF;

    IF v_poll.status <> 'draft' THEN
        RAISE EXCEPTION 'Only draft polls can change answer choices.' USING ERRCODE = '42501';
    END IF;

    v_option_text := NULLIF(btrim(COALESCE(p_option_text, '')), '');
    IF v_option_text IS NULL THEN
        RAISE EXCEPTION 'Answer choice text is required.' USING ERRCODE = '23502';
    END IF;

    IF p_option_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.poll_options AS po
            WHERE po.id = p_option_id
              AND po.poll_id = p_poll_id
        ) THEN
            RAISE EXCEPTION 'The requested option does not belong to the specified poll.' USING ERRCODE = '23503';
        END IF;

        UPDATE public.poll_options AS po
           SET option_text = v_option_text
         WHERE po.id = p_option_id
           AND po.poll_id = p_poll_id;

        RETURN QUERY
        SELECT po.id AS option_id, po.poll_id, po.option_text
        FROM public.poll_options AS po
        WHERE po.id = p_option_id;
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.poll_options AS po
        WHERE po.poll_id = p_poll_id
          AND po.option_text = v_option_text
    ) THEN
        RAISE EXCEPTION 'Answer choice already exists in this poll.' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.poll_options (poll_id, option_text, sort_order)
    VALUES (p_poll_id, v_option_text, (
        SELECT COALESCE(MAX(po.sort_order), 0) + 1
        FROM public.poll_options AS po
        WHERE po.poll_id = p_poll_id
    ))
    RETURNING id, poll_id, option_text INTO v_return_option_id, v_return_poll_id, v_return_option_text;

    RETURN QUERY
    SELECT v_return_option_id AS option_id, v_return_poll_id AS poll_id, v_return_option_text AS option_text;
END;
$$;

ALTER FUNCTION public.owner_upsert_poll_option(uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.owner_upsert_poll_option(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_upsert_poll_option(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_upsert_poll_option(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_delete_poll_option(p_option_id uuid)
RETURNS TABLE (
    deleted_option_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
    v_option record;
    v_poll record;
    v_poll_id uuid;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL OR NOT public.is_owner_for_authenticated_user(v_user) THEN
        RAISE EXCEPTION 'Owner access required.' USING ERRCODE = '42501';
    END IF;

    SELECT po.id AS option_id,
           po.poll_id AS option_poll_id,
           po.option_text,
           po.sort_order,
           p.status
      INTO v_option
      FROM public.poll_options AS po
      JOIN public.polls AS p ON p.id = po.poll_id
     WHERE po.id = p_option_id
     LIMIT 1;

    IF v_option.option_id IS NULL THEN
        RAISE EXCEPTION 'Option not found.' USING ERRCODE = '23503';
    END IF;

    v_poll_id := v_option.option_poll_id;

    SELECT *
      INTO v_poll
      FROM public.polls AS p
     WHERE p.id = v_poll_id
     LIMIT 1
     FOR UPDATE;

    IF v_poll.status <> 'draft' THEN
        RAISE EXCEPTION 'Only draft polls can remove answer choices.' USING ERRCODE = '42501';
    END IF;

    IF (
        SELECT COUNT(*)
          FROM public.poll_options AS po
         WHERE po.poll_id = v_poll_id
           AND po.id <> p_option_id
    ) < 2 THEN
        RAISE EXCEPTION 'At least two answer choices must remain in a poll.' USING ERRCODE = '23514';
    END IF;

    DELETE FROM public.poll_options AS po
     WHERE po.id = p_option_id;

    RETURN QUERY
    SELECT p_option_id AS deleted_option_id;
END;
$$;

ALTER FUNCTION public.owner_delete_poll_option(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.owner_delete_poll_option(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_delete_poll_option(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_delete_poll_option(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_set_poll_status(p_poll_id uuid, p_status text)
RETURNS TABLE (
    poll_id uuid,
    status text,
    opened_at timestamptz,
    closed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
    v_poll record;
    v_option_count integer;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL OR NOT public.is_owner_for_authenticated_user(v_user) THEN
        RAISE EXCEPTION 'Owner access required.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_poll
    FROM public.polls AS p
    WHERE p.id = p_poll_id
    LIMIT 1
    FOR UPDATE;

    IF v_poll.id IS NULL THEN
        RAISE EXCEPTION 'Poll not found.' USING ERRCODE = '23503';
    END IF;

    IF p_status NOT IN ('draft', 'open', 'closed') THEN
        RAISE EXCEPTION 'Invalid poll status.' USING ERRCODE = '23514';
    END IF;

    IF p_status = 'open' AND v_poll.status = 'draft' THEN
        SELECT COUNT(*) INTO v_option_count
        FROM public.poll_options AS po
        WHERE po.poll_id = p_poll_id;

        IF v_option_count < 2 THEN
            RAISE EXCEPTION 'A poll must have at least two answer choices before opening.' USING ERRCODE = '23514';
        END IF;

        UPDATE public.polls AS p
           SET status = 'open',
               opened_at = COALESCE(p.opened_at, now()),
               closed_at = NULL
         WHERE p.id = p_poll_id;
    ELSIF p_status = 'closed' AND v_poll.status = 'open' THEN
        UPDATE public.polls AS p
           SET status = 'closed',
               closed_at = COALESCE(p.closed_at, now())
         WHERE p.id = p_poll_id;
    ELSE
        RAISE EXCEPTION 'The poll status transition is not allowed.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT p.id AS poll_id, p.status, p.opened_at, p.closed_at
    FROM public.polls AS p
    WHERE p.id = p_poll_id;
END;
$$;

ALTER FUNCTION public.owner_set_poll_status(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.owner_set_poll_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_set_poll_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_set_poll_status(uuid, text) TO authenticated;

COMMIT;
