BEGIN;

-- Additive roulette fix: enforce one mutually exclusive selection per category
-- while allowing a total of up to three bets in one round (color, parity, range).
CREATE OR REPLACE FUNCTION public.process_lucky7_game(
    p_game_type text,
    p_wager numeric(12,2),
    p_idempotency_key text,
    p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
    id uuid,
    game_type text,
    wager numeric(12,2),
    payout numeric(12,2),
    net_change numeric(12,2),
    balance_after numeric(12,2),
    result jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
    v_citizen_id uuid;
    v_citizen_private public.citizen_private%ROWTYPE;
    v_existing public.lucky7_transaction_history%ROWTYPE;
    v_game_type text;
    v_wager numeric(12,2);
    v_payload jsonb;
    v_payout numeric(12,2);
    v_net_change numeric(12,2);
    v_balance_after numeric(12,2);
    v_result jsonb;
    v_slots_one integer;
    v_slots_two integer;
    v_slots_three integer;
    v_roulette_spin integer;
    v_roulette_bet_type text;
    v_roulette_bet_wager numeric(12,2);
    v_roulette_bet_result jsonb;
    v_roulette_bet_won boolean;
    v_roulette_bet_payout numeric(12,2);
    v_roulette_color text;
    v_roulette_is_red boolean;
    v_roulette_is_even boolean;
    v_roulette_is_low boolean;
    v_roulette_is_high boolean;
    v_roulette_total_wager numeric(12,2);
    v_roulette_total_payout numeric(12,2);
    v_roulette_bets jsonb;
    v_roulette_bet jsonb;
    v_roulette_seen_color boolean := false;
    v_roulette_seen_parity boolean := false;
    v_roulette_seen_range boolean := false;
    v_player_total integer;
    v_dealer_total integer;
    v_ledger_record public.lucky7_transaction_history%ROWTYPE;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
    END IF;

    v_game_type := lower(trim(coalesce(p_game_type, '')));
    IF v_game_type NOT IN ('slots', 'roulette', 'blackjack') THEN
        RAISE EXCEPTION 'Game type is not supported.' USING ERRCODE = '23514';
    END IF;

    v_wager := p_wager;
    IF v_wager IS NULL OR v_wager <= 0 THEN
        RAISE EXCEPTION 'Wager must be greater than zero.' USING ERRCODE = '23514';
    END IF;

    IF v_wager < 1 OR v_wager > 500 THEN
        RAISE EXCEPTION 'Wager must be between $1 and $500.' USING ERRCODE = '23514';
    END IF;

    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'Idempotency key is required.' USING ERRCODE = '23502';
    END IF;

    v_payload := coalesce(p_payload, '{}'::jsonb);

    SELECT c.id
      INTO v_citizen_id
      FROM public.citizens AS c
     WHERE c.auth_user_id = v_user
     LIMIT 1;

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

    SELECT lth.*
      INTO v_existing
      FROM public.lucky7_transaction_history AS lth
     WHERE lth.citizen_id = v_citizen_id
       AND lth.idempotency_key = p_idempotency_key
     LIMIT 1;

    IF FOUND THEN
        RETURN QUERY
        SELECT v_existing.id,
               v_existing.game_type,
               v_existing.wager,
               v_existing.payout,
               v_existing.net_change,
               v_existing.balance_after,
               v_existing.result;
        RETURN;
    END IF;

    IF v_citizen_private.balance < v_wager THEN
        RAISE EXCEPTION 'Insufficient balance for this wager.' USING ERRCODE = '23514';
    END IF;

    v_payout := 0;
    v_result := jsonb_build_object('summary', 'No win');

    IF v_game_type = 'slots' THEN
        v_slots_one := floor(random() * 10)::int;
        v_slots_two := floor(random() * 10)::int;
        v_slots_three := floor(random() * 10)::int;

        IF v_slots_one = v_slots_two AND v_slots_two = v_slots_three THEN
            v_payout := round((v_wager * 15.00)::numeric(12,2), 2);
            v_result := jsonb_build_object(
                'summary', 'JACKPOT',
                'reels', jsonb_build_array(v_slots_one, v_slots_two, v_slots_three),
                'multiplier', 15,
                'match_count', 3
            );
        ELSIF v_slots_one = v_slots_two OR v_slots_two = v_slots_three OR v_slots_one = v_slots_three THEN
            v_payout := round((v_wager * 3.00)::numeric(12,2), 2);
            v_result := jsonb_build_object(
                'summary', 'Pair match',
                'reels', jsonb_build_array(v_slots_one, v_slots_two, v_slots_three),
                'multiplier', 3,
                'match_count', 2
            );
        ELSE
            v_result := jsonb_build_object(
                'summary', 'No match',
                'reels', jsonb_build_array(v_slots_one, v_slots_two, v_slots_three),
                'multiplier', 0,
                'match_count', 0
            );
        END IF;
    ELSIF v_game_type = 'roulette' THEN
        v_roulette_spin := floor(random() * 37)::int;
        v_roulette_color := 'GREEN';
        v_roulette_is_red := false;
        v_roulette_is_even := false;
        v_roulette_is_low := false;
        v_roulette_is_high := false;
        v_roulette_total_wager := 0;
        v_roulette_total_payout := 0;
        v_roulette_bet_result := '[]'::jsonb;
        v_roulette_seen_color := false;
        v_roulette_seen_parity := false;
        v_roulette_seen_range := false;

        IF v_roulette_spin IN (1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36) THEN
            v_roulette_color := 'RED';
            v_roulette_is_red := true;
        ELSIF v_roulette_spin <> 0 THEN
            v_roulette_color := 'BLACK';
        END IF;

        v_roulette_is_even := v_roulette_spin <> 0 AND (v_roulette_spin % 2 = 0);
        v_roulette_is_low := v_roulette_spin > 0 AND v_roulette_spin <= 18;
        v_roulette_is_high := v_roulette_spin > 18 AND v_roulette_spin <= 36;

        v_roulette_bets := coalesce(v_payload->'bets', '[]'::jsonb);
        IF jsonb_typeof(v_roulette_bets) IS NULL OR v_roulette_bets = 'null'::jsonb THEN
            IF v_payload ? 'bet_type' THEN
                v_roulette_bets := jsonb_build_array(jsonb_build_object(
                    'type', lower(trim(coalesce(v_payload->>'bet_type', 'red'))),
                    'wager', coalesce((NULLIF(v_payload->>'bet_wager', ''))::numeric(12,2), v_wager)
                ));
            ELSE
                v_roulette_bets := jsonb_build_array(jsonb_build_object('type', 'red', 'wager', v_wager));
            END IF;
        END IF;

        IF jsonb_typeof(v_roulette_bets) <> 'array' THEN
            RAISE EXCEPTION 'Roulette bets must be provided as an array.' USING ERRCODE = '23514';
        END IF;

        IF jsonb_array_length(v_roulette_bets) = 0 THEN
            RAISE EXCEPTION 'Roulette requires at least one active bet.' USING ERRCODE = '23514';
        END IF;

        FOR v_roulette_bet IN SELECT value FROM jsonb_array_elements(v_roulette_bets)
        LOOP
            v_roulette_bet_type := lower(trim(coalesce(v_roulette_bet->>'type', '')));
            v_roulette_bet_wager := COALESCE((NULLIF(v_roulette_bet->>'wager', ''))::numeric(12,2), 0);

            IF v_roulette_bet_type NOT IN ('red', 'black', 'odd', 'even', 'low', 'high') THEN
                RAISE EXCEPTION 'Unsupported roulette bet type: %', v_roulette_bet_type USING ERRCODE = '23514';
            END IF;

            IF v_roulette_bet_wager IS NULL OR v_roulette_bet_wager <= 0 THEN
                RAISE EXCEPTION 'Roulette bet wager must be positive.' USING ERRCODE = '23514';
            END IF;

            IF v_roulette_bet_type IN ('red', 'black') THEN
                IF v_roulette_seen_color THEN
                    RAISE EXCEPTION 'Roulette color bets must be mutually exclusive.' USING ERRCODE = '23514';
                END IF;
                v_roulette_seen_color := true;
            ELSIF v_roulette_bet_type IN ('odd', 'even') THEN
                IF v_roulette_seen_parity THEN
                    RAISE EXCEPTION 'Roulette parity bets must be mutually exclusive.' USING ERRCODE = '23514';
                END IF;
                v_roulette_seen_parity := true;
            ELSIF v_roulette_bet_type IN ('low', 'high') THEN
                IF v_roulette_seen_range THEN
                    RAISE EXCEPTION 'Roulette range bets must be mutually exclusive.' USING ERRCODE = '23514';
                END IF;
                v_roulette_seen_range := true;
            END IF;

            v_roulette_total_wager := round((v_roulette_total_wager + v_roulette_bet_wager)::numeric(12,2), 2);
            v_roulette_bet_won := false;
            v_roulette_bet_payout := 0;

            IF v_roulette_bet_type = 'red' AND v_roulette_color = 'RED' THEN
                v_roulette_bet_won := true;
                v_roulette_bet_payout := round((v_roulette_bet_wager * 2.00)::numeric(12,2), 2);
            ELSIF v_roulette_bet_type = 'black' AND v_roulette_color = 'BLACK' THEN
                v_roulette_bet_won := true;
                v_roulette_bet_payout := round((v_roulette_bet_wager * 2.00)::numeric(12,2), 2);
            ELSIF v_roulette_bet_type = 'odd' AND v_roulette_spin <> 0 AND NOT v_roulette_is_even THEN
                v_roulette_bet_won := true;
                v_roulette_bet_payout := round((v_roulette_bet_wager * 2.00)::numeric(12,2), 2);
            ELSIF v_roulette_bet_type = 'even' AND v_roulette_is_even THEN
                v_roulette_bet_won := true;
                v_roulette_bet_payout := round((v_roulette_bet_wager * 2.00)::numeric(12,2), 2);
            ELSIF v_roulette_bet_type = 'low' AND v_roulette_is_low THEN
                v_roulette_bet_won := true;
                v_roulette_bet_payout := round((v_roulette_bet_wager * 2.00)::numeric(12,2), 2);
            ELSIF v_roulette_bet_type = 'high' AND v_roulette_is_high THEN
                v_roulette_bet_won := true;
                v_roulette_bet_payout := round((v_roulette_bet_wager * 2.00)::numeric(12,2), 2);
            END IF;

            v_roulette_total_payout := round((v_roulette_total_payout + v_roulette_bet_payout)::numeric(12,2), 2);
            v_roulette_bet_result := v_roulette_bet_result || jsonb_build_array(jsonb_build_object(
                'type', v_roulette_bet_type,
                'label', CASE v_roulette_bet_type
                    WHEN 'red' THEN 'Red'
                    WHEN 'black' THEN 'Black'
                    WHEN 'odd' THEN 'Odd'
                    WHEN 'even' THEN 'Even'
                    WHEN 'low' THEN 'Low (1–18)'
                    WHEN 'high' THEN 'High (19–36)'
                    ELSE initcap(v_roulette_bet_type)
                END,
                'wager', v_roulette_bet_wager,
                'won', v_roulette_bet_won,
                'result', CASE WHEN v_roulette_bet_won THEN 'WIN' ELSE 'LOSS' END,
                'payout', v_roulette_bet_payout,
                'multiplier', CASE WHEN v_roulette_bet_won THEN 2 ELSE 0 END
            ));
        END LOOP;

        IF v_roulette_total_wager <> v_wager THEN
            RAISE EXCEPTION 'Roulette total wager must match the round total.' USING ERRCODE = '23514';
        END IF;

        v_payout := v_roulette_total_payout;
        v_result := jsonb_build_object(
            'summary', 'Roulette round complete',
            'spin', v_roulette_spin,
            'number', v_roulette_spin,
            'color', v_roulette_color,
            'is_even', v_roulette_is_even,
            'is_odd', v_roulette_spin <> 0 AND NOT v_roulette_is_even,
            'is_low', v_roulette_is_low,
            'is_high', v_roulette_is_high,
            'bets', v_roulette_bet_result,
            'total_wager', v_roulette_total_wager,
            'total_payout', v_roulette_total_payout
        );
    ELSIF v_game_type = 'blackjack' THEN
        v_player_total := floor(random() * 10) + 10;
        v_dealer_total := floor(random() * 10) + 10;

        IF v_player_total < 17 THEN
            v_player_total := v_player_total + (floor(random() * 9) + 2);
        END IF;

        IF v_dealer_total < 17 THEN
            v_dealer_total := v_dealer_total + (floor(random() * 9) + 2);
        END IF;

        IF v_player_total > 21 THEN
            v_result := jsonb_build_object(
                'summary', 'Player busts',
                'player_total', v_player_total,
                'dealer_total', v_dealer_total,
                'multiplier', 0
            );
        ELSIF v_player_total = v_dealer_total THEN
            v_payout := v_wager;
            v_result := jsonb_build_object(
                'summary', 'Push',
                'player_total', v_player_total,
                'dealer_total', v_dealer_total,
                'multiplier', 1
            );
        ELSIF v_player_total > v_dealer_total THEN
            v_payout := round((v_wager * 2.00)::numeric(12,2), 2);
            v_result := jsonb_build_object(
                'summary', 'Player wins',
                'player_total', v_player_total,
                'dealer_total', v_dealer_total,
                'multiplier', 2
            );
        ELSE
            v_result := jsonb_build_object(
                'summary', 'Dealer wins',
                'player_total', v_player_total,
                'dealer_total', v_dealer_total,
                'multiplier', 0
            );
        END IF;
    END IF;

    v_net_change := round((v_payout - v_wager)::numeric(12,2), 2);
    v_balance_after := round((v_citizen_private.balance - v_wager + v_payout)::numeric(12,2), 2);

    PERFORM set_config('app.store_purchase_authorized', 'on', true);
    UPDATE public.citizen_private AS cp
       SET balance = v_balance_after
     WHERE cp.citizen_id = v_citizen_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Citizen private record not found during settlement.' USING ERRCODE = '23503';
    END IF;

    PERFORM set_config('app.store_purchase_authorized', 'off', true);

    INSERT INTO public.lucky7_transaction_history (
        citizen_id,
        game_type,
        wager,
        payout,
        net_change,
        balance_after,
        status,
        idempotency_key,
        result
    )
    VALUES (
        v_citizen_id,
        v_game_type,
        v_wager,
        v_payout,
        v_net_change,
        v_balance_after,
        'posted',
        p_idempotency_key,
        v_result
    )
    RETURNING *
    INTO v_ledger_record;

    RETURN QUERY
    SELECT v_ledger_record.id,
           v_ledger_record.game_type,
           v_ledger_record.wager,
           v_ledger_record.payout,
           v_ledger_record.net_change,
           v_ledger_record.balance_after,
           v_ledger_record.result;
END;
$$;

ALTER FUNCTION public.process_lucky7_game(text, numeric(12,2), text, jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.process_lucky7_game(text, numeric(12,2), text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_lucky7_game(text, numeric(12,2), text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.process_lucky7_game(text, numeric(12,2), text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_lucky7_game(text, numeric(12,2), text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_lucky7_game(text, numeric(12,2), text, jsonb) TO service_role;

COMMIT;
