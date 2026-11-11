BEGIN;

-- Phase 1B: secure message read functions for the messaging beta.
-- These functions are intentionally narrow: they expose only the approved public-facing
-- conversation metadata needed by the app and never disclose private citizen fields.
-- They intentionally do not change existing messaging table grants, RLS policies,
-- triggers, or the unrelated social-media objects.

CREATE OR REPLACE FUNCTION public.get_message_inbox(
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    thread_id uuid,
    other_citizen_id uuid,
    other_public_name text,
    other_avatar_url text,
    latest_message_preview text,
    latest_message_time timestamptz,
    unread_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_citizen_id uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_limit IS NULL THEN
        p_limit := 50;
    END IF;

    IF p_offset IS NULL THEN
        p_offset := 0;
    END IF;

    IF p_limit < 1 OR p_limit > 200 THEN
        RAISE EXCEPTION 'Inbox limit must be between 1 and 200.';
    END IF;

    IF p_offset < 0 OR p_offset > 5000 THEN
        RAISE EXCEPTION 'Inbox offset must be between 0 and 5000.';
    END IF;

    v_current_citizen_id := public.social_current_citizen_id();

    IF v_current_citizen_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH participant_threads AS (
        SELECT
            mt.id AS thread_id,
            CASE
                WHEN mt.participant_a_citizen_id = v_current_citizen_id THEN mt.participant_b_citizen_id
                ELSE mt.participant_a_citizen_id
            END AS other_citizen_id
        FROM public.message_threads AS mt
        WHERE mt.participant_a_citizen_id = v_current_citizen_id
           OR mt.participant_b_citizen_id = v_current_citizen_id
    ),
    latest_message AS (
        SELECT
            ranked_messages.thread_id,
            ranked_messages.latest_message_preview,
            ranked_messages.latest_message_time
        FROM (
            SELECT
                m.thread_id,
                m.content AS latest_message_preview,
                m.created_at AS latest_message_time,
                ROW_NUMBER() OVER (
                    PARTITION BY m.thread_id
                    ORDER BY m.created_at DESC, m.id DESC
                ) AS row_num
            FROM public.messages AS m
            WHERE EXISTS (
                SELECT 1
                FROM participant_threads AS pt
                WHERE pt.thread_id = m.thread_id
            )
        ) AS ranked_messages
        WHERE ranked_messages.row_num = 1
    )
    SELECT
        pt.thread_id,
        pt.other_citizen_id,
        oc.public_name AS other_public_name,
        CASE
            WHEN oc.avatar_url = './assets/avatars/aurelia-voss.svg'
              OR oc.avatar_url = './assets/avatars/jasper-reed.svg'
              OR oc.avatar_url = './assets/avatars/mira-sloane.svg'
              OR oc.avatar_url = './assets/avatars/dorian-kestrel.svg'
              OR oc.avatar_url = './assets/avatars/leah-cortez.svg'
              OR oc.avatar_url = './assets/avatars/omar-tate.svg'
                THEN oc.avatar_url
            ELSE './assets/avatars/aurelia-voss.svg'
        END AS other_avatar_url,
        CASE
            WHEN lm.latest_message_preview IS NULL THEN NULL
            WHEN length(lm.latest_message_preview) <= 160 THEN lm.latest_message_preview
            ELSE substring(lm.latest_message_preview, 1, 157) || '...'
        END AS latest_message_preview,
        lm.latest_message_time AS latest_message_time,
        (
            SELECT count(*)::bigint
            FROM public.messages AS incoming
            WHERE incoming.thread_id = pt.thread_id
              AND incoming.sender_citizen_id = pt.other_citizen_id
              AND incoming.read_at IS NULL
        ) AS unread_count
    FROM participant_threads AS pt
    JOIN public.citizens AS oc
      ON oc.id = pt.other_citizen_id
    JOIN latest_message AS lm
      ON lm.thread_id = pt.thread_id
    WHERE lm.latest_message_time IS NOT NULL
    ORDER BY lm.latest_message_time DESC, pt.thread_id DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

ALTER FUNCTION public.get_message_inbox(integer, integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_message_inbox(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_message_inbox(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_message_inbox(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_message_inbox(integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_message_history(
    p_thread_id uuid,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    sender_citizen_id uuid,
    content text,
    created_at timestamptz,
    read_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_citizen_id uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_thread_id IS NULL THEN
        RAISE EXCEPTION 'Thread id is required.';
    END IF;

    IF p_limit IS NULL THEN
        p_limit := 50;
    END IF;

    IF p_offset IS NULL THEN
        p_offset := 0;
    END IF;

    IF p_limit < 1 OR p_limit > 200 THEN
        RAISE EXCEPTION 'History limit must be between 1 and 200.';
    END IF;

    IF p_offset < 0 OR p_offset > 5000 THEN
        RAISE EXCEPTION 'History offset must be between 0 and 5000.';
    END IF;

    v_current_citizen_id := public.social_current_citizen_id();

    IF v_current_citizen_id IS NULL THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.message_threads AS mt
        WHERE mt.id = p_thread_id
          AND (
              mt.participant_a_citizen_id = v_current_citizen_id
              OR mt.participant_b_citizen_id = v_current_citizen_id
          )
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        m.id,
        m.sender_citizen_id,
        m.content,
        m.created_at,
        m.read_at
    FROM public.messages AS m
    WHERE m.thread_id = p_thread_id
    ORDER BY m.created_at ASC, m.id ASC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

ALTER FUNCTION public.get_message_history(uuid, integer, integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_message_history(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_message_history(uuid, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_message_history(uuid, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_message_history(uuid, integer, integer) TO authenticated;

COMMIT;
