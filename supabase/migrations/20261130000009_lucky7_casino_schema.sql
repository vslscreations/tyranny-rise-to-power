BEGIN;

CREATE TABLE public.lucky7_transaction_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_id uuid NOT NULL REFERENCES public.citizens(id) ON DELETE CASCADE,
    game_type text NOT NULL CHECK (game_type IN ('slots', 'roulette', 'blackjack')),
    wager numeric(12,2) NOT NULL CHECK (wager > 0),
    payout numeric(12,2) NOT NULL DEFAULT 0 CHECK (payout >= 0),
    net_change numeric(12,2) NOT NULL CHECK (net_change >= -1000000),
    balance_after numeric(12,2) NOT NULL CHECK (balance_after >= 0),
    status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
    idempotency_key text NOT NULL,
    result jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_lucky7_history_unique_idempotency
    ON public.lucky7_transaction_history (citizen_id, idempotency_key);

CREATE INDEX idx_lucky7_history_citizen_created_at
    ON public.lucky7_transaction_history (citizen_id, created_at DESC);

CREATE INDEX idx_lucky7_history_game_type_created_at
    ON public.lucky7_transaction_history (game_type, created_at DESC);

ALTER TABLE public.lucky7_transaction_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.lucky7_transaction_history FROM PUBLIC;
REVOKE ALL ON TABLE public.lucky7_transaction_history FROM anon;
REVOKE ALL ON TABLE public.lucky7_transaction_history FROM authenticated;
REVOKE ALL ON TABLE public.lucky7_transaction_history FROM service_role;

GRANT SELECT ON TABLE public.lucky7_transaction_history TO authenticated;
GRANT ALL ON TABLE public.lucky7_transaction_history TO service_role;

CREATE POLICY lucky7_transaction_history_self_read
    ON public.lucky7_transaction_history
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
              FROM public.citizens AS c
             WHERE c.id = lucky7_transaction_history.citizen_id
               AND c.auth_user_id = auth.uid()
        )
    );

CREATE POLICY lucky7_transaction_history_no_browser_write
    ON public.lucky7_transaction_history
    FOR INSERT
    TO authenticated
    WITH CHECK (false);

CREATE POLICY lucky7_transaction_history_no_browser_update
    ON public.lucky7_transaction_history
    FOR UPDATE
    TO authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY lucky7_transaction_history_no_browser_delete
    ON public.lucky7_transaction_history
    FOR DELETE
    TO authenticated
    USING (false);

COMMENT ON TABLE public.lucky7_transaction_history IS
    'Server-side ledger for LUCKY 7 wagers, payouts, and game results. All wallet changes flow through server-side settlement functions only.';

COMMIT;
