BEGIN;

-- MoneyTree reward ledger.
-- Purpose:
--   - record each qualifying reward event for later payout processing
--   - preserve public.citizen_private.balance as the canonical balance
--   - prevent browser clients from directly writing reward records
--   - leave citizen_private permissions and protected-field triggers unchanged
--
-- Important:
--   - no payout function is created here
--   - no balance update is performed here
--   - no contribution table is created here
--   - the future contribution UUID will be stored as the ledger's unique contribution_key

CREATE TABLE public.moneytree_reward_ledger (
    id uuid primary key default gen_random_uuid(),
    citizen_id uuid not null references public.citizens(id) on delete restrict,
    contribution_key text not null,
    reward_category text not null check (
        reward_category in (
            'question_answer',
            'career_answer',
            'open_discussion',
            'challenge',
            'reply'
        )
    ),
    amount numeric(12,2) not null default 10.00 check (amount = 10.00),
    created_at timestamptz not null default now(),
    constraint moneytree_reward_ledger_contribution_key_unique unique (contribution_key)
);

CREATE INDEX idx_moneytree_reward_ledger_citizen_created_at
    ON public.moneytree_reward_ledger (citizen_id, created_at desc);

CREATE INDEX idx_moneytree_reward_ledger_category_created_at
    ON public.moneytree_reward_ledger (reward_category, created_at desc);

ALTER TABLE public.moneytree_reward_ledger ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.moneytree_reward_ledger FROM PUBLIC;
REVOKE ALL ON TABLE public.moneytree_reward_ledger FROM anon;
REVOKE ALL ON TABLE public.moneytree_reward_ledger FROM authenticated;

-- The trusted server-side path is the only role that should be able to insert ledger rows.
-- This is intentionally narrower than ALL privileges and is sufficient for the future trusted
-- function or service role worker that records reward events.
GRANT INSERT (citizen_id, contribution_key, reward_category, amount, created_at)
    ON TABLE public.moneytree_reward_ledger TO service_role;

GRANT SELECT
    ON TABLE public.moneytree_reward_ledger TO service_role;

-- No browser-access policies are created.
-- With RLS enabled and no auth role privileges, browser access is denied by default.
-- This preserves the table as a private server-side ledger.

COMMIT;
