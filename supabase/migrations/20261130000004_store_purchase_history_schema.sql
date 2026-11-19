BEGIN;

-- Store purchase history foundation.
-- Purpose:
--   - preserve a permanent, immutable financial record of Store purchases
--   - capture the server-side receipt snapshot at the moment the purchase succeeds
--   - keep the canonical wallet and education data in citizen_private and not here
--   - keep inventory tied to the purchase that created it, while preserving purchase history
--
-- Important:
--   - no purchase processing is implemented here
--   - no wallet or education fields are created here
--   - no duplicate source of truth is introduced for citizen balances or education
--   - purchase rows are intentionally not deleted or cascaded away in a destructive way
--   - citizen_inventory is created after store_purchases so the FK can point to the purchase record

CREATE TABLE public.store_purchases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_id uuid NOT NULL REFERENCES public.citizens(id) ON DELETE RESTRICT,
    item_id uuid NOT NULL REFERENCES public.store_catalog(id) ON DELETE RESTRICT,
    item_name text NOT NULL CHECK (length(trim(item_name)) > 0),
    quantity integer NOT NULL CHECK (quantity > 0),
    original_item_price numeric(12,2) NOT NULL CHECK (original_item_price >= 0),
    original_total numeric(12,2) NOT NULL CHECK (original_total >= 0),
    sales_tax_rate numeric(5,4) NOT NULL CHECK (sales_tax_rate >= 0 AND sales_tax_rate < 1),
    tax_amount numeric(12,2) NOT NULL CHECK (tax_amount >= 0),
    final_amount numeric(12,2) NOT NULL CHECK (final_amount >= 0),
    currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
    balance_after_purchase numeric(12,2) NOT NULL CHECK (balance_after_purchase >= 0),
    education_after_purchase text NOT NULL DEFAULT 'No Diploma',
    purchased_at timestamptz NOT NULL DEFAULT now(),
    one_time_purchase boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'reversed')),
    idempotency_key text NOT NULL,
    receipt_purchase_id uuid NOT NULL UNIQUE,
    receipt_citizen_id uuid NOT NULL,
    receipt_item_id uuid NOT NULL,
    receipt_item_name text NOT NULL,
    receipt_quantity integer NOT NULL CHECK (receipt_quantity > 0),
    receipt_original_item_price numeric(12,2) NOT NULL CHECK (receipt_original_item_price >= 0),
    receipt_original_total numeric(12,2) NOT NULL CHECK (receipt_original_total >= 0),
    receipt_sales_tax_rate numeric(5,4) NOT NULL CHECK (receipt_sales_tax_rate >= 0 AND receipt_sales_tax_rate < 1),
    receipt_tax_amount numeric(12,2) NOT NULL CHECK (receipt_tax_amount >= 0),
    receipt_final_amount numeric(12,2) NOT NULL CHECK (receipt_final_amount >= 0),
    receipt_currency text NOT NULL DEFAULT 'USD' CHECK (receipt_currency = 'USD'),
    receipt_balance_after_purchase numeric(12,2) NOT NULL CHECK (receipt_balance_after_purchase >= 0),
    receipt_education_after_purchase text NOT NULL,
    receipt_purchased_at timestamptz NOT NULL,
    receipt_one_time_purchase boolean NOT NULL,
    receipt_idempotency_key text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (receipt_purchase_id = id),
    CHECK (receipt_citizen_id = citizen_id),
    CHECK (receipt_item_id = item_id),
    CHECK (receipt_item_name = item_name),
    CHECK (receipt_quantity = quantity),
    CHECK (receipt_original_item_price = original_item_price),
    CHECK (receipt_original_total = original_total),
    CHECK (receipt_sales_tax_rate = sales_tax_rate),
    CHECK (receipt_tax_amount = tax_amount),
    CHECK (receipt_final_amount = final_amount),
    CHECK (receipt_currency = currency),
    CHECK (receipt_balance_after_purchase = balance_after_purchase),
    CHECK (receipt_education_after_purchase = education_after_purchase),
    CHECK (receipt_purchased_at = purchased_at),
    CHECK (receipt_one_time_purchase = one_time_purchase),
    CHECK (receipt_idempotency_key = idempotency_key),
    UNIQUE (id, citizen_id, item_id)
);

CREATE UNIQUE INDEX idx_store_purchases_citizen_idempotency_unique
    ON public.store_purchases (citizen_id, idempotency_key);

CREATE INDEX idx_store_purchases_citizen_purchased_at
    ON public.store_purchases (citizen_id, purchased_at DESC);

CREATE INDEX idx_store_purchases_item_status
    ON public.store_purchases (item_id, status, purchased_at DESC);

CREATE INDEX idx_store_purchases_status_purchased_at
    ON public.store_purchases (status, purchased_at DESC);

CREATE OR REPLACE FUNCTION public.set_store_purchases_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

CREATE TRIGGER store_purchases_set_updated_at
BEFORE UPDATE ON public.store_purchases
FOR EACH ROW
EXECUTE FUNCTION public.set_store_purchases_updated_at();

CREATE TABLE public.citizen_inventory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_id uuid NOT NULL REFERENCES public.citizens(id) ON DELETE RESTRICT,
    purchase_id uuid NOT NULL,
    item_id uuid NOT NULL REFERENCES public.store_catalog(id) ON DELETE RESTRICT,
    item_name text NOT NULL CHECK (length(trim(item_name)) > 0),
    quantity integer NOT NULL CHECK (quantity > 0),
    granted_at timestamptz NOT NULL DEFAULT now(),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (purchase_id),
    CONSTRAINT citizen_inventory_purchase_origin_fk
        FOREIGN KEY (purchase_id, citizen_id, item_id)
        REFERENCES public.store_purchases (id, citizen_id, item_id)
        ON DELETE RESTRICT
);

CREATE INDEX idx_citizen_inventory_citizen_active
    ON public.citizen_inventory (citizen_id, is_active, granted_at DESC);

CREATE INDEX idx_citizen_inventory_purchase_id
    ON public.citizen_inventory (purchase_id);

CREATE OR REPLACE FUNCTION public.set_citizen_inventory_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

CREATE TRIGGER citizen_inventory_set_updated_at
BEFORE UPDATE ON public.citizen_inventory
FOR EACH ROW
EXECUTE FUNCTION public.set_citizen_inventory_updated_at();

ALTER TABLE public.store_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citizen_inventory ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.store_purchases FROM PUBLIC;
REVOKE ALL ON TABLE public.store_purchases FROM anon;
REVOKE ALL ON TABLE public.store_purchases FROM authenticated;
REVOKE ALL ON TABLE public.store_purchases FROM service_role;

REVOKE ALL ON TABLE public.citizen_inventory FROM PUBLIC;
REVOKE ALL ON TABLE public.citizen_inventory FROM anon;
REVOKE ALL ON TABLE public.citizen_inventory FROM authenticated;
REVOKE ALL ON TABLE public.citizen_inventory FROM service_role;

GRANT SELECT ON TABLE public.store_purchases TO authenticated;
GRANT SELECT ON TABLE public.citizen_inventory TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.store_purchases TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.citizen_inventory TO service_role;

CREATE POLICY store_purchases_no_anon_access
    ON public.store_purchases
    FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);

CREATE POLICY store_purchases_no_browser_write
    ON public.store_purchases
    FOR INSERT
    TO authenticated
    WITH CHECK (false);

CREATE POLICY store_purchases_no_browser_update
    ON public.store_purchases
    FOR UPDATE
    TO authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY store_purchases_no_browser_delete
    ON public.store_purchases
    FOR DELETE
    TO authenticated
    USING (false);

CREATE POLICY store_purchases_private_to_own_citizen
    ON public.store_purchases
    FOR SELECT
    TO authenticated
    USING (citizen_id = (
        SELECT c.id
          FROM public.citizens AS c
         WHERE c.auth_user_id = auth.uid()
         LIMIT 1
    ));

CREATE POLICY citizen_inventory_no_anon_access
    ON public.citizen_inventory
    FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);

CREATE POLICY citizen_inventory_no_browser_write
    ON public.citizen_inventory
    FOR INSERT
    TO authenticated
    WITH CHECK (false);

CREATE POLICY citizen_inventory_no_browser_update
    ON public.citizen_inventory
    FOR UPDATE
    TO authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY citizen_inventory_no_browser_delete
    ON public.citizen_inventory
    FOR DELETE
    TO authenticated
    USING (false);

CREATE POLICY citizen_inventory_private_to_own_citizen
    ON public.citizen_inventory
    FOR SELECT
    TO authenticated
    USING (citizen_id = (
        SELECT c.id
          FROM public.citizens AS c
         WHERE c.auth_user_id = auth.uid()
         LIMIT 1
    ));

REVOKE ALL ON FUNCTION public.set_store_purchases_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_store_purchases_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.set_store_purchases_updated_at() FROM authenticated;

REVOKE ALL ON FUNCTION public.set_citizen_inventory_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_citizen_inventory_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.set_citizen_inventory_updated_at() FROM authenticated;

COMMENT ON TABLE public.store_purchases IS
    'Permanent purchase ledger for Store purchases. This table stores the immutable financial receipt snapshot and the trusted financial state at purchase time.';

COMMIT;
