BEGIN;

-- Store catalog foundation.
-- Purpose:
--   - create the visible Store category taxonomy used by the future Store UI
--   - create the catalog rows for the Beta release without inventing unsupported systems
--   - isolate all catalog and category writes to trusted server-side admin workflows
--
-- Important:
--   - no purchase processing is implemented here
--   - no wallet or education fields are created here
--   - no duplicate source of truth is introduced for citizen balances or education
--   - citizen_inventory is intentionally deferred because it must reference store_purchases,
--     which is created in the following migration. This is the smallest safe sequencing change.

CREATE TABLE public.store_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_key text NOT NULL UNIQUE,
    display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
    display_order integer NOT NULL CHECK (display_order >= 0),
    is_visible boolean NOT NULL DEFAULT true,
    is_locked boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_store_categories_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

CREATE TRIGGER store_categories_set_updated_at
BEFORE UPDATE ON public.store_categories
FOR EACH ROW
EXECUTE FUNCTION public.set_store_categories_updated_at();

CREATE TABLE public.store_catalog (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id uuid NOT NULL REFERENCES public.store_categories(id) ON DELETE RESTRICT,
    product_key text NOT NULL UNIQUE,
    product_name text NOT NULL CHECK (length(trim(product_name)) > 0),
    description text NULL,
    price numeric(12,2) NULL CHECK (price IS NULL OR price >= 0),
    currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
    is_visible boolean NOT NULL DEFAULT true,
    is_purchasable boolean NOT NULL DEFAULT false,
    is_locked boolean NOT NULL DEFAULT false,
    one_time_purchase boolean NOT NULL DEFAULT false,
    requirements jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(requirements) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (is_purchasable = true AND price IS NOT NULL)
        OR (is_purchasable = false)
    ),
    CHECK (
        is_locked = false OR is_purchasable = false
    )
);

CREATE OR REPLACE FUNCTION public.set_store_catalog_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

CREATE TRIGGER store_catalog_set_updated_at
BEFORE UPDATE ON public.store_catalog
FOR EACH ROW
EXECUTE FUNCTION public.set_store_catalog_updated_at();

CREATE INDEX idx_store_categories_visible_order
    ON public.store_categories (is_visible, display_order, category_key);

CREATE INDEX idx_store_catalog_category_visible_purchase
    ON public.store_catalog (category_id, is_visible, is_purchasable, product_key);

ALTER TABLE public.store_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_catalog ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.store_categories FROM PUBLIC;
REVOKE ALL ON TABLE public.store_categories FROM anon;
REVOKE ALL ON TABLE public.store_categories FROM authenticated;
REVOKE ALL ON TABLE public.store_categories FROM service_role;

REVOKE ALL ON TABLE public.store_catalog FROM PUBLIC;
REVOKE ALL ON TABLE public.store_catalog FROM anon;
REVOKE ALL ON TABLE public.store_catalog FROM authenticated;
REVOKE ALL ON TABLE public.store_catalog FROM service_role;

-- Trusted administrative maintenance only. Browser clients are intentionally denied all access.
GRANT SELECT ON TABLE public.store_categories TO authenticated;
GRANT SELECT ON TABLE public.store_catalog TO authenticated;
GRANT ALL ON TABLE public.store_categories TO service_role;
GRANT ALL ON TABLE public.store_catalog TO service_role;

CREATE POLICY store_categories_no_anon_access
    ON public.store_categories
    FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);

CREATE POLICY store_categories_no_browser_write
    ON public.store_categories
    FOR INSERT
    TO authenticated
    WITH CHECK (false);

CREATE POLICY store_categories_no_browser_update
    ON public.store_categories
    FOR UPDATE
    TO authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY store_categories_no_browser_delete
    ON public.store_categories
    FOR DELETE
    TO authenticated
    USING (false);

CREATE POLICY store_categories_visible_to_authenticated
    ON public.store_categories
    FOR SELECT
    TO authenticated
    USING (is_visible = true);

REVOKE ALL ON FUNCTION public.set_store_categories_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_store_categories_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.set_store_categories_updated_at() FROM authenticated;

REVOKE ALL ON FUNCTION public.set_store_catalog_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_store_catalog_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.set_store_catalog_updated_at() FROM authenticated;

CREATE POLICY store_catalog_no_anon_access
    ON public.store_catalog
    FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);

CREATE POLICY store_catalog_no_browser_write
    ON public.store_catalog
    FOR INSERT
    TO authenticated
    WITH CHECK (false);

CREATE POLICY store_catalog_no_browser_update
    ON public.store_catalog
    FOR UPDATE
    TO authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY store_catalog_no_browser_delete
    ON public.store_catalog
    FOR DELETE
    TO authenticated
    USING (false);

CREATE POLICY store_catalog_visible_to_authenticated
    ON public.store_catalog
    FOR SELECT
    TO authenticated
    USING (
        is_visible = true
        AND EXISTS (
            SELECT 1
              FROM public.store_categories AS sc
             WHERE sc.id = store_catalog.category_id
               AND sc.is_visible = true
        )
    );

INSERT INTO public.store_categories (
    category_key,
    display_name,
    display_order,
    is_visible,
    is_locked,
    created_at,
    updated_at
)
VALUES
    ('education', 'Education', 1, true, false, now(), now()),
    ('career_handbooks', 'Career & Handbooks', 2, true, false, now(), now()),
    ('technology_equipment', 'Technology & Equipment', 3, true, false, now(), now()),
    ('special_access', 'Special Access', 4, true, false, now(), now()),
    ('real_estate', 'Real Estate', 5, true, true, now(), now()),
    ('vehicles', 'Vehicles', 6, true, true, now(), now()),
    ('businesses', 'Businesses', 7, true, true, now(), now()),
    ('cosmetics', 'Cosmetics', 8, true, true, now(), now());

INSERT INTO public.store_catalog (
    category_id,
    product_key,
    product_name,
    description,
    price,
    currency,
    is_visible,
    is_purchasable,
    is_locked,
    one_time_purchase,
    requirements,
    created_at,
    updated_at
)
VALUES
    (
        (SELECT id FROM public.store_categories WHERE category_key = 'education'),
        'high_school_diploma',
        'High School Diploma',
        'Earn a verified high school diploma through the approved advancement process.',
        1000.00,
        'USD',
        true,
        true,
        false,
        true,
        '{"moneytree_approved_contributions": 200}'::jsonb,
        now(),
        now()
    ),
    (
        (SELECT id FROM public.store_categories WHERE category_key = 'technology_equipment'),
        'laptop',
        'Laptop',
        'A portable workstation for future productivity. Available to view in Beta, but not purchasable during the Beta period.',
        1500.00,
        'USD',
        true,
        false,
        true,
        false,
        '{}'::jsonb,
        now(),
        now()
    ),
    (
        (SELECT id FROM public.store_categories WHERE category_key = 'education'),
        'bachelors_degree',
        'Bachelor''s Degree',
        'Coming Soon. This educational advancement is visible, but not available for purchase during Beta.',
        NULL,
        'USD',
        true,
        false,
        true,
        false,
        '{}'::jsonb,
        now(),
        now()
    ),
    (
        (SELECT id FROM public.store_categories WHERE category_key = 'technology_equipment'),
        'tablet',
        'Tablet',
        'A compact learning and productivity device for the future. It is visible, but locked during Beta.',
        NULL,
        'USD',
        true,
        false,
        true,
        false,
        '{}'::jsonb,
        now(),
        now()
    );

COMMIT;
