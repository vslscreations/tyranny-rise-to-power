BEGIN;

-- Asset Map catalog placeholders. These remain visible but cannot be purchased
-- until a real price and product activation decision are supplied.
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
        (SELECT id FROM public.store_categories WHERE category_key = 'real_estate'),
        'basic_home',
        'Basic Home',
        'Coming soon. A basic home will be available after its price and purchase configuration are finalized.',
        NULL,
        'USD',
        true,
        false,
        false,
        true,
        '{}'::jsonb,
        now(),
        now()
    ),
    (
        (SELECT id FROM public.store_categories WHERE category_key = 'vehicles'),
        'basic_vehicle',
        'Basic Vehicle',
        'Coming soon. A basic vehicle will be available after its price and purchase configuration are finalized.',
        NULL,
        'USD',
        true,
        false,
        false,
        true,
        '{}'::jsonb,
        now(),
        now()
    )
ON CONFLICT (product_key) DO NOTHING;

COMMIT;
