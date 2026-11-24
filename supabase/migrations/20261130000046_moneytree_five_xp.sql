BEGIN;
-- New MoneyTree approvals earn 5 XP. Existing ledger entries and their
-- idempotency keys are preserved; prior awards are not replayed or topped up.
DO $$ BEGIN
  UPDATE public.xp_activity_rules SET xp_amount=5 WHERE activity_key='moneytree_approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'MoneyTree XP rule is missing.'; END IF;
END; $$;
COMMIT;
