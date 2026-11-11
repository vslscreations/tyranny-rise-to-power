BEGIN;

-- Phase 1: minimal private messaging foundation
-- This migration creates the minimal one-to-one messaging tables for the beta.
-- Unread state is derived from read_at rather than a separate column.
-- It intentionally keeps the design narrow: no group chats, attachments, or extra infrastructure.

CREATE OR REPLACE FUNCTION public.message_threads_apply_canonical_order()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_a uuid := NEW.participant_a_citizen_id;
    v_b uuid := NEW.participant_b_citizen_id;
BEGIN
    IF NEW.participant_a_citizen_id IS NULL OR NEW.participant_b_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Both participants are required for a message thread.';
    END IF;

    IF NEW.participant_a_citizen_id = NEW.participant_b_citizen_id THEN
        RAISE EXCEPTION 'A conversation cannot include the same citizen twice.';
    END IF;

    IF v_a > v_b THEN
        NEW.participant_a_citizen_id := v_b;
        NEW.participant_b_citizen_id := v_a;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.messages_validate_thread_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_participant_a uuid;
    v_participant_b uuid;
BEGIN
    IF NEW.thread_id IS NULL THEN
        RAISE EXCEPTION 'Message thread is required.';
    END IF;

    IF NEW.sender_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Message sender is required.';
    END IF;

    SELECT participant_a_citizen_id, participant_b_citizen_id
      INTO v_participant_a, v_participant_b
      FROM public.message_threads
     WHERE id = NEW.thread_id;

    IF v_participant_a IS NULL OR v_participant_b IS NULL THEN
        RAISE EXCEPTION 'Message thread does not exist.';
    END IF;

    IF NEW.sender_citizen_id NOT IN (v_participant_a, v_participant_b) THEN
        RAISE EXCEPTION 'Sender must be one of the thread participants.';
    END IF;

    IF NEW.read_at IS NOT NULL AND NEW.read_at < NEW.created_at THEN
        RAISE EXCEPTION 'Read timestamp cannot be earlier than message creation time.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.message_threads (
    id uuid primary key default gen_random_uuid(),
    participant_a_citizen_id uuid not null references public.citizens(id) on delete cascade,
    participant_b_citizen_id uuid not null references public.citizens(id) on delete cascade,
    created_at timestamptz not null default now(),
    constraint message_threads_distinct_participants check (participant_a_citizen_id <> participant_b_citizen_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_message_threads_canonical_pair
    ON public.message_threads (
        least(participant_a_citizen_id, participant_b_citizen_id),
        greatest(participant_a_citizen_id, participant_b_citizen_id)
    );

CREATE INDEX IF NOT EXISTS idx_message_threads_participant_a
    ON public.message_threads (participant_a_citizen_id, created_at desc);

CREATE INDEX IF NOT EXISTS idx_message_threads_participant_b
    ON public.message_threads (participant_b_citizen_id, created_at desc);

CREATE TRIGGER message_threads_canonicalize_participants
BEFORE INSERT OR UPDATE ON public.message_threads
FOR EACH ROW
EXECUTE FUNCTION public.message_threads_apply_canonical_order();

CREATE TABLE IF NOT EXISTS public.messages (
    id uuid primary key default gen_random_uuid(),
    thread_id uuid not null references public.message_threads(id) on delete cascade,
    sender_citizen_id uuid not null references public.citizens(id) on delete cascade,
    content text not null check (
        length(btrim(content)) > 0
        and length(content) <= 2000
    ),
    created_at timestamptz not null default now(),
    read_at timestamptz null,
    constraint messages_read_after_create check (read_at is null or read_at >= created_at)
);

CREATE INDEX IF NOT EXISTS idx_messages_thread_created_at
    ON public.messages (thread_id, created_at desc);

CREATE INDEX IF NOT EXISTS idx_messages_sender_created_at
    ON public.messages (sender_citizen_id, created_at desc);

CREATE TRIGGER messages_validate_thread_membership
BEFORE INSERT OR UPDATE OF thread_id, sender_citizen_id, content, read_at ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.messages_validate_thread_membership();

ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.message_threads FROM PUBLIC;
REVOKE ALL ON TABLE public.message_threads FROM anon;
REVOKE ALL ON TABLE public.message_threads FROM authenticated;
REVOKE ALL ON TABLE public.messages FROM PUBLIC;
REVOKE ALL ON TABLE public.messages FROM anon;
REVOKE ALL ON TABLE public.messages FROM authenticated;

GRANT SELECT ON TABLE public.message_threads TO authenticated;
GRANT INSERT (participant_a_citizen_id, participant_b_citizen_id) ON TABLE public.message_threads TO authenticated;

GRANT SELECT ON TABLE public.messages TO authenticated;
GRANT INSERT (thread_id, sender_citizen_id, content) ON TABLE public.messages TO authenticated;
GRANT UPDATE (read_at) ON TABLE public.messages TO authenticated;

CREATE POLICY "message_threads_select_participants"
ON public.message_threads
FOR SELECT
TO authenticated
USING (
    participant_a_citizen_id = public.social_current_citizen_id()
    OR participant_b_citizen_id = public.social_current_citizen_id()
);

CREATE POLICY "message_threads_insert_participants"
ON public.message_threads
FOR INSERT
TO authenticated
WITH CHECK (
    participant_a_citizen_id IS NOT NULL
    AND participant_b_citizen_id IS NOT NULL
    AND participant_a_citizen_id <> participant_b_citizen_id
    AND (
        participant_a_citizen_id = public.social_current_citizen_id()
        OR participant_b_citizen_id = public.social_current_citizen_id()
    )
);

CREATE POLICY "messages_select_participants"
ON public.messages
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.message_threads AS mt
        WHERE mt.id = messages.thread_id
          AND (
              mt.participant_a_citizen_id = public.social_current_citizen_id()
              OR mt.participant_b_citizen_id = public.social_current_citizen_id()
          )
    )
);

CREATE POLICY "messages_insert_participants"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.message_threads AS mt
        WHERE mt.id = messages.thread_id
          AND (
              mt.participant_a_citizen_id = public.social_current_citizen_id()
              OR mt.participant_b_citizen_id = public.social_current_citizen_id()
          )
    )
    AND sender_citizen_id = public.social_current_citizen_id()
);

CREATE POLICY "messages_update_read_receipt_only"
ON public.messages
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.message_threads AS mt
        WHERE mt.id = messages.thread_id
          AND (
              (mt.participant_a_citizen_id = public.social_current_citizen_id()
               AND mt.participant_b_citizen_id = messages.sender_citizen_id)
              OR
              (mt.participant_b_citizen_id = public.social_current_citizen_id()
               AND mt.participant_a_citizen_id = messages.sender_citizen_id)
          )
    )
)
WITH CHECK (
    read_at IS NOT NULL
    AND EXISTS (
        SELECT 1
        FROM public.message_threads AS mt
        WHERE mt.id = messages.thread_id
          AND (
              (mt.participant_a_citizen_id = public.social_current_citizen_id()
               AND mt.participant_b_citizen_id = messages.sender_citizen_id)
              OR
              (mt.participant_b_citizen_id = public.social_current_citizen_id()
               AND mt.participant_a_citizen_id = messages.sender_citizen_id)
          )
    )
);

COMMIT;
