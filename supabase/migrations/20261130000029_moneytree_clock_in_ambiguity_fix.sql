BEGIN;

-- Fix ambiguous Clock In references introduced by using function result column names
-- that shadow table columns in PL/pgSQL.
--
-- This migration intentionally replaces only the Clock In RPC functions and keeps the
-- existing security model, wallet credit flow, idempotency behavior, and time-window rules.

CREATE OR REPLACE FUNCTION public.get_moneytree_clock_in_status()
RETURNS TABLE (
    citizen_id uuid,
    reward_amount numeric(12,2),
    window_start timestamptz,
    window_end timestamptz,
    remaining_seconds integer,
    already_claimed boolean,
    window_is_open boolean,
    can_claim boolean,
    next_eligible_at timestamptz,
    message text,
    server_now timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid := auth.uid();
    v_citizen_id uuid;
    v_now timestamptz := now();
    v_window_start timestamptz := date_trunc('hour', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    v_window_end timestamptz := v_window_start + interval '5 minutes';
    v_claimed boolean := false;
BEGIN
    IF v_user IS NULL THEN
        RETURN QUERY
        SELECT
            NULL::uuid,
            25.00::numeric(12,2),
            NULL::timestamptz,
            NULL::timestamptz,
            0,
            false,
            false,
            false,
            NULL::timestamptz,
            'Authentication required.'::text,
            v_now;
        RETURN;
    END IF;

    SELECT c.id
      INTO v_citizen_id
      FROM public.citizens AS c
     WHERE c.auth_user_id = v_user
     LIMIT 1;

    IF v_citizen_id IS NULL THEN
        RETURN QUERY
        SELECT
            NULL::uuid,
            25.00::numeric(12,2),
            NULL::timestamptz,
            NULL::timestamptz,
            0,
            false,
            false,
            false,
            NULL::timestamptz,
            'Citizen profile not found.'::text,
            v_now;
        RETURN;
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM public.moneytree_clock_in_claims AS claim
         WHERE claim.citizen_id = v_citizen_id
           AND claim.window_start = v_window_start
    ) INTO v_claimed;

    RETURN QUERY
    SELECT
        v_citizen_id,
        25.00::numeric(12,2),
        v_window_start,
        v_window_end,
        CASE
            WHEN v_now >= v_window_start AND v_now < v_window_end THEN greatest(0, floor(extract(epoch FROM (v_window_end - v_now)))::int)
            ELSE 0
        END AS remaining_seconds,
        v_claimed AS already_claimed,
        (v_now >= v_window_start AND v_now < v_window_end) AS window_is_open,
        ((v_now >= v_window_start AND v_now < v_window_end) AND NOT v_claimed) AS can_claim,
        CASE
            WHEN v_now >= v_window_start AND v_now < v_window_end THEN v_window_end
            ELSE v_window_start + interval '1 hour'
        END AS next_eligible_at,
        CASE
            WHEN v_now >= v_window_start AND v_now < v_window_end AND NOT v_claimed THEN 'Clock In is available now.'::text
            WHEN v_now >= v_window_start AND v_now < v_window_end AND v_claimed THEN 'You have already claimed this hourly reward.'::text
            ELSE 'The next Clock In window opens at the top of the next hour.'::text
        END AS message,
        v_now AS server_now;
END;
$$;

ALTER FUNCTION public.get_moneytree_clock_in_status() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_moneytree_clock_in_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_moneytree_clock_in_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_moneytree_clock_in_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_moneytree_clock_in(
    p_idempotency_key text
)
RETURNS TABLE (
    success boolean,
    message text,
    reward_amount numeric(12,2),
    claimed_at timestamptz,
    window_start timestamptz,
    window_end timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid := auth.uid();
    v_citizen_id uuid;
    v_now timestamptz := now();
    v_window_start timestamptz := date_trunc('hour', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    v_window_end timestamptz := v_window_start + interval '5 minutes';
    v_clean_idempotency_key text;
    v_claimed boolean := false;
    v_row public.moneytree_clock_in_claims%ROWTYPE;
BEGIN
    IF v_user IS NULL THEN
        success := false;
        message := 'Authentication required.';
        reward_amount := 25.00::numeric(12,2);
        claimed_at := v_now;
        window_start := NULL::timestamptz;
        window_end := NULL::timestamptz;
        RETURN NEXT;
        RETURN;
    END IF;

    IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'An idempotency key is required.' USING ERRCODE = '23514';
    END IF;

    SELECT c.id
      INTO v_citizen_id
      FROM public.citizens AS c
     WHERE c.auth_user_id = v_user
     LIMIT 1;

    IF v_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Citizen profile not found.' USING ERRCODE = '23503';
    END IF;

    IF v_now < v_window_start OR v_now >= v_window_end THEN
        success := false;
        message := 'Clock In is only available during the first five minutes of each hour.';
        reward_amount := 25.00::numeric(12,2);
        claimed_at := v_now;
        window_start := v_window_start;
        window_end := v_window_end;
        RETURN NEXT;
        RETURN;
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM public.moneytree_clock_in_claims AS claim
         WHERE claim.citizen_id = v_citizen_id
           AND claim.window_start = v_window_start
    ) INTO v_claimed;

    IF v_claimed THEN
        success := false;
        message := 'You have already claimed this hourly reward.';
        reward_amount := 25.00::numeric(12,2);
        claimed_at := v_now;
        window_start := v_window_start;
        window_end := v_window_end;
        RETURN NEXT;
        RETURN;
    END IF;

    v_clean_idempotency_key := trim(p_idempotency_key);

    INSERT INTO public.moneytree_clock_in_claims (
        citizen_id,
        window_start,
        reward_amount,
        claimed_at,
        idempotency_key
    )
    VALUES (
        v_citizen_id,
        v_window_start,
        25.00::numeric(12,2),
        v_now,
        v_clean_idempotency_key
    )
    ON CONFLICT ON CONSTRAINT moneytree_clock_in_claims_citizen_id_window_start_key DO NOTHING
    RETURNING *
    INTO v_row;

    IF v_row.id IS NULL THEN
        success := false;
        message := 'You have already claimed this hourly reward.';
        reward_amount := 25.00::numeric(12,2);
        claimed_at := v_now;
        window_start := v_window_start;
        window_end := v_window_end;
        RETURN NEXT;
        RETURN;
    END IF;

    PERFORM set_config('app.moneytree_reward_credit', 'on', true);

    UPDATE public.citizen_private AS cp
       SET balance = cp.balance + 25.00::numeric(12,2)
     WHERE cp.citizen_id = v_citizen_id;

    IF NOT FOUND THEN
        PERFORM set_config('app.moneytree_reward_credit', 'off', true);
        RAISE EXCEPTION 'Citizen balance record not found.' USING ERRCODE = '23503';
    END IF;

    PERFORM set_config('app.moneytree_reward_credit', 'off', true);

    success := true;
    message := 'Clock In successful. $25.00 has been credited to your available balance.';
    reward_amount := 25.00::numeric(12,2);
    claimed_at := v_now;
    window_start := v_window_start;
    window_end := v_window_end;
    RETURN NEXT;
END;
$$;

ALTER FUNCTION public.claim_moneytree_clock_in(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_moneytree_clock_in(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_moneytree_clock_in(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_moneytree_clock_in(text) TO authenticated;

COMMIT;
