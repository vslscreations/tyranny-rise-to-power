BEGIN;

CREATE TABLE IF NOT EXISTS public.polls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question text NOT NULL CHECK (length(trim(question)) > 0),
    description text NOT NULL DEFAULT '',
    required_diploma boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
    created_by_citizen_id uuid NOT NULL REFERENCES public.citizens(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    opened_at timestamptz,
    closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.poll_options (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    option_text text NOT NULL CHECK (length(trim(option_text)) > 0),
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (poll_id, option_text)
);

CREATE TABLE IF NOT EXISTS public.poll_votes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    citizen_id uuid NOT NULL REFERENCES public.citizens(id) ON DELETE CASCADE,
    option_id uuid NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (poll_id, citizen_id)
);

ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.polls FROM PUBLIC;
REVOKE ALL ON TABLE public.polls FROM anon;
REVOKE ALL ON TABLE public.polls FROM authenticated;
REVOKE ALL ON TABLE public.polls FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.polls TO service_role;

REVOKE ALL ON TABLE public.poll_options FROM PUBLIC;
REVOKE ALL ON TABLE public.poll_options FROM anon;
REVOKE ALL ON TABLE public.poll_options FROM authenticated;
REVOKE ALL ON TABLE public.poll_options FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.poll_options TO service_role;

REVOKE ALL ON TABLE public.poll_votes FROM PUBLIC;
REVOKE ALL ON TABLE public.poll_votes FROM anon;
REVOKE ALL ON TABLE public.poll_votes FROM authenticated;
REVOKE ALL ON TABLE public.poll_votes FROM service_role;
GRANT SELECT, INSERT ON TABLE public.poll_votes TO service_role;

CREATE OR REPLACE FUNCTION public.is_owner_for_authenticated_user(p_user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL THEN
        RETURN false;
    END IF;

    IF p_user_id IS NOT NULL AND p_user_id <> v_user THEN
        RAISE EXCEPTION 'User context mismatch.' USING ERRCODE = '42501';
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.citizens AS c
        JOIN public.moneytree_owners AS mo ON mo.citizen_id = c.id
        WHERE c.auth_user_id = v_user
    );
END;
$$;

ALTER FUNCTION public.is_owner_for_authenticated_user(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_owner_for_authenticated_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_owner_for_authenticated_user(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_owner_for_authenticated_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.citizen_id_for_authenticated_user(p_user_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL THEN
        RETURN NULL;
    END IF;

    IF p_user_id IS NOT NULL AND p_user_id <> v_user THEN
        RAISE EXCEPTION 'User context mismatch.' USING ERRCODE = '42501';
    END IF;

    RETURN (
        SELECT c.id
        FROM public.citizens AS c
        WHERE c.auth_user_id = v_user
        LIMIT 1
    );
END;
$$;

ALTER FUNCTION public.citizen_id_for_authenticated_user(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.citizen_id_for_authenticated_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.citizen_id_for_authenticated_user(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.citizen_id_for_authenticated_user(uuid) TO authenticated;

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
        poll_id,
        question,
        description,
        required_diploma,
        status,
        created_at,
        opened_at,
        closed_at,
        total_votes,
        total_eligible,
        CASE
            WHEN total_eligible > 0 THEN round((total_votes::numeric / total_eligible::numeric) * 100, 2)
            ELSE 0
        END AS turnout,
        winner_option_id,
        winner_text,
        options
    FROM poll_base
    ORDER BY created_at DESC;
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
        SELECT p.id AS poll_id,
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
    SELECT poll_id,
           question,
           description,
           required_diploma,
           created_at,
           options,
           is_eligible,
           user_has_voted,
           my_vote_option_id
    FROM open_polls
    ORDER BY created_at DESC;
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
        poll_id,
        question,
        description,
        required_diploma,
        created_at,
        closed_at,
        options,
        turnout,
        total_votes,
        winner_text,
        winner_percent
    FROM closed_polls
    ORDER BY closed_at DESC;
END;
$$;

ALTER FUNCTION public.get_closed_polls_for_citizen() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_closed_polls_for_citizen() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_closed_polls_for_citizen() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_closed_polls_for_citizen() TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_poll_vote(p_poll_id uuid, p_option_id uuid)
RETURNS TABLE (
    vote_id uuid,
    poll_id uuid,
    option_id uuid,
    result text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
    v_citizen_id uuid;
    v_poll record;
    v_option record;
    v_new_vote_id uuid;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
    END IF;

    v_citizen_id := public.citizen_id_for_authenticated_user(v_user);
    IF v_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Citizen record not found.' USING ERRCODE = '23503';
    END IF;

    SELECT * INTO v_poll
    FROM public.polls AS p
    WHERE p.id = p_poll_id
    LIMIT 1
    FOR UPDATE;

    IF v_poll.id IS NULL THEN
        RAISE EXCEPTION 'Poll not found.' USING ERRCODE = '23503';
    END IF;

    IF v_poll.status <> 'open' THEN
        RAISE EXCEPTION 'Voting is unavailable for this poll.' USING ERRCODE = '42501';
    END IF;

    IF v_poll.required_diploma THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.citizen_private AS cp
            WHERE cp.citizen_id = v_citizen_id
              AND cp.education = 'High School Diploma'
        ) THEN
            RAISE EXCEPTION 'High School Diploma is required to vote in this poll.' USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT * INTO v_option
    FROM public.poll_options AS po
    WHERE po.id = p_option_id
      AND po.poll_id = p_poll_id
    LIMIT 1;

    IF v_option.id IS NULL THEN
        RAISE EXCEPTION 'Option not found for this poll.' USING ERRCODE = '23503';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.poll_votes AS pv
        WHERE pv.poll_id = p_poll_id
          AND pv.citizen_id = v_citizen_id
    ) THEN
        RAISE EXCEPTION 'You have already voted in this poll.' USING ERRCODE = '23505';
    END IF;

    v_new_vote_id := gen_random_uuid();
    INSERT INTO public.poll_votes (
        id,
        poll_id,
        citizen_id,
        option_id,
        created_at
    ) VALUES (
        v_new_vote_id,
        p_poll_id,
        v_citizen_id,
        p_option_id,
        now()
    );

    RETURN QUERY
    SELECT v_new_vote_id, p_poll_id, p_option_id, 'voted'::text;
END;
$$;

ALTER FUNCTION public.submit_poll_vote(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_poll_vote(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_poll_vote(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_poll_vote(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_create_poll(
    p_question text,
    p_description text,
    p_required_diploma boolean,
    p_options text[]
)
RETURNS TABLE (
    poll_id uuid,
    question text,
    description text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
    v_citizen_id uuid;
    v_poll_id uuid;
    v_option text;
    v_valid_options text[] := '{}';
    v_option_count integer := 0;
    i integer;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL OR NOT public.is_owner_for_authenticated_user(v_user) THEN
        RAISE EXCEPTION 'Owner access required.' USING ERRCODE = '42501';
    END IF;

    v_citizen_id := public.citizen_id_for_authenticated_user(v_user);
    IF v_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Owner citizen record not found.' USING ERRCODE = '23503';
    END IF;

    IF p_question IS NULL OR btrim(p_question) = '' THEN
        RAISE EXCEPTION 'Poll question is required.' USING ERRCODE = '23502';
    END IF;

    IF p_options IS NULL THEN
        RAISE EXCEPTION 'A poll requires at least two answer choices.' USING ERRCODE = '23514';
    END IF;

    FOREACH v_option IN ARRAY p_options LOOP
        v_option := btrim(COALESCE(v_option, ''));
        IF v_option <> '' AND NOT EXISTS (
            SELECT 1
            FROM unnest(v_valid_options) AS existing_option(value)
            WHERE existing_option.value = v_option
        ) THEN
            v_valid_options := array_append(v_valid_options, v_option);
            v_option_count := v_option_count + 1;
        END IF;
    END LOOP;

    IF v_option_count < 2 THEN
        RAISE EXCEPTION 'A poll requires at least two non-blank, distinct answer choices.' USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.polls (
        question,
        description,
        required_diploma,
        status,
        created_by_citizen_id
    ) VALUES (
        btrim(p_question),
        COALESCE(p_description, ''),
        COALESCE(p_required_diploma, false),
        'draft',
        v_citizen_id
    ) RETURNING id INTO v_poll_id;

    FOR i IN 1..array_length(v_valid_options, 1) LOOP
        INSERT INTO public.poll_options (poll_id, option_text, sort_order)
        VALUES (v_poll_id, v_valid_options[i], i);
    END LOOP;

    RETURN QUERY
    SELECT v_poll_id, btrim(p_question), COALESCE(p_description, '');
END;
$$;

ALTER FUNCTION public.owner_create_poll(text, text, boolean, text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.owner_create_poll(text, text, boolean, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_create_poll(text, text, boolean, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_create_poll(text, text, boolean, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_update_poll(
    p_poll_id uuid,
    p_question text,
    p_description text,
    p_required_diploma boolean
)
RETURNS TABLE (
    poll_id uuid,
    question text,
    description text,
    required_diploma boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
    v_poll record;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL OR NOT public.is_owner_for_authenticated_user(v_user) THEN
        RAISE EXCEPTION 'Owner access required.' USING ERRCODE = '42501';
    END IF;

    IF p_question IS NULL OR btrim(p_question) = '' THEN
        RAISE EXCEPTION 'Poll question is required.' USING ERRCODE = '23502';
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
        RAISE EXCEPTION 'Only draft polls can be edited.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.polls
       SET question = btrim(p_question),
           description = COALESCE(p_description, ''),
           required_diploma = COALESCE(p_required_diploma, false)
     WHERE id = p_poll_id;

    RETURN QUERY
    SELECT p.id, p.question, p.description, p.required_diploma
    FROM public.polls AS p
    WHERE p.id = p_poll_id;
END;
$$;

ALTER FUNCTION public.owner_update_poll(uuid, text, text, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.owner_update_poll(uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_update_poll(uuid, text, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_update_poll(uuid, text, text, boolean) TO authenticated;

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

        UPDATE public.poll_options
           SET option_text = v_option_text
         WHERE id = p_option_id
           AND poll_id = p_poll_id;

        RETURN QUERY
        SELECT po.id, po.poll_id, po.option_text
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
        SELECT COALESCE(MAX(sort_order), 0) + 1
        FROM public.poll_options AS po
        WHERE po.poll_id = p_poll_id
    ))
    RETURNING id, poll_id, option_text INTO v_return_option_id, v_return_poll_id, v_return_option_text;

    RETURN QUERY
    SELECT v_return_option_id, v_return_poll_id, v_return_option_text;
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

    SELECT po.*, p.status, p.id AS poll_id
    INTO v_option
    FROM public.poll_options AS po
    JOIN public.polls AS p ON p.id = po.poll_id
    WHERE po.id = p_option_id
    LIMIT 1;

    IF v_option.id IS NULL THEN
        RAISE EXCEPTION 'Option not found.' USING ERRCODE = '23503';
    END IF;

    v_poll_id := v_option.poll_id;

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

    DELETE FROM public.poll_options
    WHERE id = p_option_id;

    RETURN QUERY
    SELECT p_option_id;
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
        FROM public.poll_options
        WHERE poll_id = p_poll_id;

        IF v_option_count < 2 THEN
            RAISE EXCEPTION 'A poll must have at least two answer choices before opening.' USING ERRCODE = '23514';
        END IF;

        UPDATE public.polls
           SET status = 'open',
               opened_at = COALESCE(opened_at, now()),
               closed_at = NULL
         WHERE id = p_poll_id;
    ELSIF p_status = 'closed' AND v_poll.status = 'open' THEN
        UPDATE public.polls
           SET status = 'closed',
               closed_at = COALESCE(closed_at, now())
         WHERE id = p_poll_id;
    ELSE
        RAISE EXCEPTION 'The poll status transition is not allowed.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT p.id, p.status, p.opened_at, p.closed_at
    FROM public.polls AS p
    WHERE p.id = p_poll_id;
END;
$$;

ALTER FUNCTION public.owner_set_poll_status(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.owner_set_poll_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_set_poll_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_set_poll_status(uuid, text) TO authenticated;

CREATE POLICY polls_owner_select
    ON public.polls
    FOR SELECT
    TO authenticated
    USING (
        status = 'open'
        OR public.is_owner_for_authenticated_user(auth.uid())
    );

CREATE POLICY polls_owner_insert
    ON public.polls
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_owner_for_authenticated_user(auth.uid()));

CREATE POLICY polls_owner_update
    ON public.polls
    FOR UPDATE
    TO authenticated
    USING (public.is_owner_for_authenticated_user(auth.uid()))
    WITH CHECK (public.is_owner_for_authenticated_user(auth.uid()));

CREATE POLICY polls_owner_delete
    ON public.polls
    FOR DELETE
    TO authenticated
    USING (public.is_owner_for_authenticated_user(auth.uid()));

CREATE POLICY poll_options_owner_select
    ON public.poll_options
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.polls AS p
            WHERE p.id = poll_id
              AND (p.status = 'open' OR public.is_owner_for_authenticated_user(auth.uid()))
        )
    );

CREATE POLICY poll_options_owner_insert
    ON public.poll_options
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.polls AS p
            WHERE p.id = poll_id
              AND public.is_owner_for_authenticated_user(auth.uid())
              AND p.status = 'draft'
        )
    );

CREATE POLICY poll_options_owner_update
    ON public.poll_options
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.polls AS p
            WHERE p.id = poll_id
              AND public.is_owner_for_authenticated_user(auth.uid())
              AND p.status = 'draft'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.polls AS p
            WHERE p.id = poll_id
              AND public.is_owner_for_authenticated_user(auth.uid())
              AND p.status = 'draft'
        )
    );

CREATE POLICY poll_options_owner_delete
    ON public.poll_options
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.polls AS p
            WHERE p.id = poll_id
              AND public.is_owner_for_authenticated_user(auth.uid())
              AND p.status = 'draft'
        )
    );

CREATE POLICY poll_votes_insert_and_select_own
    ON public.poll_votes
    FOR INSERT
    TO authenticated
    WITH CHECK (
        citizen_id = public.citizen_id_for_authenticated_user(auth.uid())
    );

CREATE POLICY poll_votes_no_browser_read
    ON public.poll_votes
    FOR SELECT
    TO authenticated
    USING (false);

CREATE POLICY poll_votes_no_browser_update_delete
    ON public.poll_votes
    FOR UPDATE
    TO authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY poll_votes_no_browser_delete
    ON public.poll_votes
    FOR DELETE
    TO authenticated
    USING (false);

COMMIT;
