BEGIN;

-- Store purchase reversal foundation.
-- Purpose:
--   - create a dedicated, trusted reversal administration channel
--   - preserve the original purchase and receipt facts for immutable history
--   - allow only the approved completed -> reversed transition for exceptional administrative reversals
--   - support a targeted diploma reversal review workflow without modifying canonical wallet or education architecture
--
-- Important:
--   - no reversal RPC is implemented here
--   - no sales tax rate is seeded here
--   - no reversal administrators are seeded here
--   - no automatic education downgrade is performed here
--   - the later reversal RPC must enforce authentication, authorization, purchase validation, refund, inventory deactivation, and review creation atomically

CREATE TABLE public.store_reversal_admins (
    citizen_id uuid PRIMARY KEY REFERENCES public.citizens(id) ON DELETE RESTRICT,
    granted_by_citizen_id uuid NULL REFERENCES public.citizens(id) ON DELETE RESTRICT,
    reason text NULL CHECK (reason IS NULL OR length(trim(reason)) > 0),
    granted_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_store_reversal_admins_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

CREATE TRIGGER store_reversal_admins_set_updated_at
BEFORE UPDATE ON public.store_reversal_admins
FOR EACH ROW
EXECUTE FUNCTION public.set_store_reversal_admins_updated_at();

ALTER TABLE public.store_reversal_admins ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.store_reversal_admins FROM PUBLIC;
REVOKE ALL ON TABLE public.store_reversal_admins FROM anon;
REVOKE ALL ON TABLE public.store_reversal_admins FROM authenticated;
REVOKE ALL ON TABLE public.store_reversal_admins FROM service_role;

GRANT ALL ON TABLE public.store_reversal_admins TO service_role;

CREATE POLICY store_reversal_admins_no_anon_access
    ON public.store_reversal_admins
    FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);

CREATE POLICY store_reversal_admins_no_browser_access
    ON public.store_reversal_admins
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);

REVOKE ALL ON FUNCTION public.set_store_reversal_admins_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_store_reversal_admins_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.set_store_reversal_admins_updated_at() FROM authenticated;

ALTER TABLE public.store_purchases
    ADD COLUMN IF NOT EXISTS reversed_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS reversed_by_citizen_id uuid NULL REFERENCES public.citizens(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS reversal_reason text NULL CHECK (reversal_reason IS NULL OR length(trim(reversal_reason)) > 0);

ALTER TABLE public.store_purchases
    ADD CONSTRAINT store_purchases_reversal_transition_chk
    CHECK (
        (
            status = 'completed'
            AND reversed_at IS NULL
            AND reversed_by_citizen_id IS NULL
            AND reversal_reason IS NULL
        )
        OR (
            status = 'reversed'
            AND reversed_at IS NOT NULL
            AND reversed_at >= purchased_at
            AND reversed_by_citizen_id IS NOT NULL
            AND reversal_reason IS NOT NULL
            AND length(trim(reversal_reason)) > 0
        )
    );

CREATE OR REPLACE FUNCTION public.prevent_store_purchase_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old_record record;
BEGIN
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;

    IF TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'reversed' THEN
        RAISE EXCEPTION 'A reversed purchase cannot be modified.' USING ERRCODE = '23514';
    END IF;

    IF OLD.status <> 'completed' THEN
        RAISE EXCEPTION 'Only completed purchases may transition to reversed.' USING ERRCODE = '23514';
    END IF;

    IF NEW.status = OLD.status AND NEW.status = 'completed' THEN
        RAISE EXCEPTION 'Completed purchases are immutable unless they transition to reversed.' USING ERRCODE = '23514';
    END IF;

    IF NEW.status <> 'reversed' THEN
        RAISE EXCEPTION 'Only the completed -> reversed transition is allowed.' USING ERRCODE = '23514';
    END IF;

    IF NEW.id <> OLD.id
        OR NEW.citizen_id <> OLD.citizen_id
        OR NEW.item_id <> OLD.item_id
        OR NEW.item_name <> OLD.item_name
        OR NEW.quantity <> OLD.quantity
        OR NEW.original_item_price <> OLD.original_item_price
        OR NEW.original_total <> OLD.original_total
        OR NEW.sales_tax_rate <> OLD.sales_tax_rate
        OR NEW.tax_amount <> OLD.tax_amount
        OR NEW.final_amount <> OLD.final_amount
        OR NEW.currency <> OLD.currency
        OR NEW.balance_after_purchase <> OLD.balance_after_purchase
        OR NEW.education_after_purchase <> OLD.education_after_purchase
        OR NEW.purchased_at <> OLD.purchased_at
        OR NEW.one_time_purchase <> OLD.one_time_purchase
        OR NEW.idempotency_key <> OLD.idempotency_key
        OR NEW.receipt_purchase_id <> OLD.receipt_purchase_id
        OR NEW.receipt_citizen_id <> OLD.receipt_citizen_id
        OR NEW.receipt_item_id <> OLD.receipt_item_id
        OR NEW.receipt_item_name <> OLD.receipt_item_name
        OR NEW.receipt_quantity <> OLD.receipt_quantity
        OR NEW.receipt_original_item_price <> OLD.receipt_original_item_price
        OR NEW.receipt_original_total <> OLD.receipt_original_total
        OR NEW.receipt_sales_tax_rate <> OLD.receipt_sales_tax_rate
        OR NEW.receipt_tax_amount <> OLD.receipt_tax_amount
        OR NEW.receipt_final_amount <> OLD.receipt_final_amount
        OR NEW.receipt_currency <> OLD.receipt_currency
        OR NEW.receipt_balance_after_purchase <> OLD.receipt_balance_after_purchase
        OR NEW.receipt_education_after_purchase <> OLD.receipt_education_after_purchase
        OR NEW.receipt_purchased_at <> OLD.receipt_purchased_at
        OR NEW.receipt_one_time_purchase <> OLD.receipt_one_time_purchase
        OR NEW.receipt_idempotency_key <> OLD.receipt_idempotency_key
        OR NEW.created_at <> OLD.created_at
    THEN
        RAISE EXCEPTION 'Original purchase financial and identity fields are immutable.' USING ERRCODE = '23514';
    END IF;

    IF NEW.reversed_at IS NULL OR NEW.reversed_at < OLD.purchased_at THEN
        RAISE EXCEPTION 'Reversal timestamp must be set after the original purchase moment.' USING ERRCODE = '23514';
    END IF;

    IF NEW.reversed_by_citizen_id IS NULL OR NEW.reversal_reason IS NULL OR length(trim(NEW.reversal_reason)) = 0 THEN
        RAISE EXCEPTION 'Reversal metadata is required for a reversed purchase.' USING ERRCODE = '23514';
    END IF;

    IF NEW.status <> 'reversed' OR NEW.reversed_at IS NULL OR NEW.reversed_by_citizen_id IS NULL OR NEW.reversal_reason IS NULL THEN
        RAISE EXCEPTION 'Only the reversal metadata may change during the completed -> reversed transition.' USING ERRCODE = '23514';
    END IF;

    IF OLD.reversed_at IS NOT NULL OR OLD.reversed_by_citizen_id IS NOT NULL OR OLD.reversal_reason IS NOT NULL THEN
        RAISE EXCEPTION 'Purchase already reversed; no further mutation is allowed.' USING ERRCODE = '23514';
    END IF;

    NEW.updated_at = now();

    RETURN NEW;
END;
$$;

CREATE TRIGGER store_purchases_reversal_transition_guard
BEFORE UPDATE ON public.store_purchases
FOR EACH ROW
EXECUTE FUNCTION public.prevent_store_purchase_mutation();

REVOKE ALL ON FUNCTION public.prevent_store_purchase_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_store_purchase_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_store_purchase_mutation() FROM authenticated;

CREATE OR REPLACE FUNCTION public.prevent_store_purchase_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'Store purchase history is permanent and cannot be deleted.'
        USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER store_purchases_prevent_delete
BEFORE DELETE ON public.store_purchases
FOR EACH ROW
EXECUTE FUNCTION public.prevent_store_purchase_deletion();

REVOKE ALL ON FUNCTION public.prevent_store_purchase_deletion() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_store_purchase_deletion() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_store_purchase_deletion() FROM authenticated;

CREATE UNIQUE INDEX idx_store_purchases_one_time_item_unique_active
    ON public.store_purchases (citizen_id, item_id)
    WHERE one_time_purchase = true
      AND status IN ('completed', 'reversed');

-- Required to satisfy the composite foreign key used by reversal reviews.
-- This keeps the reversal review tied to the exact purchase + citizen ownership pair
-- without weakening the relationship to purchase-only identity.

COMMIT;
