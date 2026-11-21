BEGIN;

CREATE TABLE IF NOT EXISTS public.social_chat_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_id uuid NOT NULL REFERENCES public.citizens(id) ON DELETE CASCADE,
    message text NOT NULL CHECK (length(btrim(message)) > 0 AND length(message) <= 500),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz NULL,
    deleted_by_citizen_id uuid NULL REFERENCES public.citizens(id) ON DELETE SET NULL,
    moderation_note text NULL CHECK (moderation_note IS NULL OR length(btrim(moderation_note)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_social_chat_messages_citizen_created_at
    ON public.social_chat_messages (citizen_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_chat_messages_visible_created_at
    ON public.social_chat_messages (deleted_at, created_at DESC);

ALTER TABLE public.social_chat_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.social_chat_messages FROM PUBLIC;
REVOKE ALL ON TABLE public.social_chat_messages FROM anon;
REVOKE ALL ON TABLE public.social_chat_messages FROM authenticated;
GRANT SELECT ON TABLE public.social_chat_messages TO authenticated;
GRANT UPDATE (deleted_at, deleted_by_citizen_id, moderation_note, updated_at) ON TABLE public.social_chat_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.social_chat_messages TO service_role;

CREATE OR REPLACE FUNCTION public.social_chat_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.social_chat_set_updated_at() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.social_chat_set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.social_chat_set_updated_at() FROM anon;
GRANT EXECUTE ON FUNCTION public.social_chat_set_updated_at() TO authenticated;

CREATE OR REPLACE FUNCTION public.social_chat_apply_auth_citizen_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_citizen_id uuid;
BEGIN
    v_citizen_id := public.social_current_citizen_id();

    IF v_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Authenticated citizen record not found for social chat insert.' USING ERRCODE = '28000';
    END IF;

    NEW.citizen_id := v_citizen_id;
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.social_chat_apply_auth_citizen_ownership() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.social_chat_apply_auth_citizen_ownership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.social_chat_apply_auth_citizen_ownership() FROM anon;
GRANT EXECUTE ON FUNCTION public.social_chat_apply_auth_citizen_ownership() TO authenticated;

CREATE OR REPLACE FUNCTION public.social_chat_rate_limit_ok(p_citizen_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_recent_count integer;
BEGIN
    SELECT count(*)
      INTO v_recent_count
      FROM public.social_chat_messages AS scm
     WHERE scm.citizen_id = p_citizen_id
       AND scm.created_at > (now() - interval '10 seconds');

    RETURN v_recent_count < 5;
END;
$$;

ALTER FUNCTION public.social_chat_rate_limit_ok(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.social_chat_rate_limit_ok(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.social_chat_rate_limit_ok(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.social_chat_rate_limit_ok(uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_recent_social_chat_messages(p_limit integer DEFAULT 100)
RETURNS TABLE (
    id uuid,
    citizen_id uuid,
    author_handle text,
    message text,
    created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_limit integer := coalesce(p_limit, 100);
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required for chat access.' USING ERRCODE = '28000';
    END IF;

    IF v_limit IS NULL OR v_limit < 1 OR v_limit > 100 THEN
        v_limit := 100;
    END IF;

    RETURN QUERY
    WITH recent AS (
        SELECT
            scm.id,
            scm.citizen_id,
            ch.handle AS author_handle,
            scm.message,
            scm.created_at
        FROM public.social_chat_messages AS scm
        LEFT JOIN public.citizen_social_handles AS ch
          ON ch.citizen_id = scm.citizen_id
        WHERE scm.deleted_at IS NULL
        ORDER BY scm.created_at DESC, scm.id DESC
        LIMIT v_limit
    )
    SELECT
        recent.id,
        recent.citizen_id,
        recent.author_handle,
        recent.message,
        recent.created_at
    FROM recent
    ORDER BY recent.created_at ASC, recent.id ASC;
END;
$$;

ALTER FUNCTION public.get_recent_social_chat_messages(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_recent_social_chat_messages(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_recent_social_chat_messages(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_recent_social_chat_messages(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_social_chat_message(p_message text)
RETURNS TABLE (
    message_id uuid,
    citizen_id uuid,
    author_handle text,
    message text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user uuid;
    v_citizen_id uuid;
    v_message text;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required to send a chat message.' USING ERRCODE = '28000';
    END IF;

    v_citizen_id := public.social_current_citizen_id();
    IF v_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Authenticated citizen record not found for chat posting.' USING ERRCODE = '28000';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(v_citizen_id::text));

    v_message := trim(p_message);
    IF v_message = '' THEN
        RAISE EXCEPTION 'Chat messages cannot be empty.';
    END IF;

    IF length(v_message) > 500 THEN
        RAISE EXCEPTION 'Chat messages must be 500 characters or fewer.';
    END IF;

    IF NOT public.social_chat_rate_limit_ok(v_citizen_id) THEN
        RAISE EXCEPTION 'Rate limit reached. Please wait a moment before sending another chat message.';
    END IF;

    RETURN QUERY
    WITH inserted AS (
        INSERT INTO public.social_chat_messages AS scm (
            citizen_id,
            message
        )
        VALUES (
            v_citizen_id,
            v_message
        )
        RETURNING scm.id, scm.citizen_id, scm.message, scm.created_at
    )
    SELECT
        inserted.id AS message_id,
        inserted.citizen_id,
        ch.handle AS author_handle,
        inserted.message,
        inserted.created_at
    FROM inserted
    LEFT JOIN public.citizen_social_handles AS ch
      ON ch.citizen_id = inserted.citizen_id;
END;
$$;

ALTER FUNCTION public.send_social_chat_message(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.send_social_chat_message(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_social_chat_message(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.send_social_chat_message(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_social_chat_message(p_message_id uuid, p_reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_citizen_id uuid;
    v_owner_citizen_id uuid;
    v_is_moderator boolean;
    v_note text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required to remove a chat message.' USING ERRCODE = '28000';
    END IF;

    v_citizen_id := public.social_current_citizen_id();
    IF v_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Authenticated citizen record not found for chat moderation.' USING ERRCODE = '28000';
    END IF;

    SELECT scm.citizen_id
      INTO v_owner_citizen_id
      FROM public.social_chat_messages AS scm
     WHERE scm.id = p_message_id
     LIMIT 1;

    IF v_owner_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Chat message not found.';
    END IF;

    v_is_moderator := public.is_newsroom_moderator_for_authenticated_user();
    v_note := trim(coalesce(p_reason, ''));

    IF v_is_moderator THEN
        UPDATE public.social_chat_messages AS scm
           SET deleted_at = now(),
               deleted_by_citizen_id = v_citizen_id,
               moderation_note = CASE WHEN v_note = '' THEN 'Moderated by moderator' ELSE v_note END,
               updated_at = now()
         WHERE scm.id = p_message_id
           AND scm.deleted_at IS NULL;
        RETURN TRUE;
    END IF;

    IF v_owner_citizen_id = v_citizen_id THEN
        UPDATE public.social_chat_messages AS scm
           SET deleted_at = now(),
               deleted_by_citizen_id = v_citizen_id,
               moderation_note = 'Removed by author',
               updated_at = now()
         WHERE scm.id = p_message_id
           AND scm.deleted_at IS NULL;
        RETURN TRUE;
    END IF;

    RAISE EXCEPTION 'You may only remove your own message. Moderators can remove inappropriate content.';
END;
$$;

ALTER FUNCTION public.remove_social_chat_message(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.remove_social_chat_message(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_social_chat_message(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.remove_social_chat_message(uuid, text) TO authenticated;

DROP TRIGGER IF EXISTS social_chat_messages_set_citizen_id ON public.social_chat_messages;
DROP TRIGGER IF EXISTS social_chat_messages_set_updated_at ON public.social_chat_messages;

CREATE TRIGGER social_chat_messages_set_citizen_id
BEFORE INSERT ON public.social_chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.social_chat_apply_auth_citizen_ownership();

CREATE TRIGGER social_chat_messages_set_updated_at
BEFORE UPDATE ON public.social_chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.social_chat_set_updated_at();

DROP POLICY IF EXISTS "social_chat_messages_select_visible" ON public.social_chat_messages;
DROP POLICY IF EXISTS "social_chat_messages_insert_own" ON public.social_chat_messages;
DROP POLICY IF EXISTS "social_chat_messages_self_remove" ON public.social_chat_messages;
DROP POLICY IF EXISTS "social_chat_messages_moderator_remove" ON public.social_chat_messages;

CREATE POLICY "social_chat_messages_select_visible"
    ON public.social_chat_messages
    FOR SELECT
    TO authenticated
    USING (deleted_at IS NULL);

CREATE POLICY "social_chat_messages_self_remove"
    ON public.social_chat_messages
    FOR UPDATE
    TO authenticated
    USING (citizen_id = public.social_current_citizen_id() AND deleted_at IS NULL)
    WITH CHECK (
        citizen_id = public.social_current_citizen_id()
        AND deleted_at IS NOT NULL
        AND deleted_by_citizen_id = public.social_current_citizen_id()
    );

CREATE POLICY "social_chat_messages_moderator_remove"
    ON public.social_chat_messages
    FOR UPDATE
    TO authenticated
    USING (public.is_newsroom_moderator_for_authenticated_user() AND deleted_at IS NULL)
    WITH CHECK (
        public.is_newsroom_moderator_for_authenticated_user()
        AND deleted_at IS NOT NULL
        AND deleted_by_citizen_id = public.social_current_citizen_id()
    );

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_publication
         WHERE pubname = 'supabase_realtime'
    )
    AND NOT EXISTS (
        SELECT 1
          FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = 'social_chat_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.social_chat_messages;
    END IF;
END $$;

ALTER TABLE public.social_chat_messages REPLICA IDENTITY FULL;

COMMIT;
