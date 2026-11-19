BEGIN;

-- Store & Economy baseline.
-- Purpose:
--   - provide a single authoritative source for future Presidential sales tax configuration
--   - keep tax configuration separate from citizen wallet and education records
--   - prevent browser access to tax configuration while leaving the data available to trusted
--     server-side admin workflows and future purchase RPCs
--
-- Important:
--   - no seeded tax rate is inserted here; the value remains undecided by design
--   - the future purchase RPC must reject purchases unless exactly one active, valid config exists
--   - this table is intentionally not exposed to browser clients or any self-service admin route

CREATE TABLE public.economic_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_rate numeric(5,4) NOT NULL CHECK (tax_rate > 0 AND tax_rate < 1),
    active boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_economic_settings_single_active
    ON public.economic_settings (active)
    WHERE active = true;

CREATE OR REPLACE FUNCTION public.set_economic_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

CREATE TRIGGER economic_settings_set_updated_at
BEFORE UPDATE ON public.economic_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_economic_settings_updated_at();

ALTER TABLE public.economic_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.economic_settings FROM PUBLIC;
REVOKE ALL ON TABLE public.economic_settings FROM anon;
REVOKE ALL ON TABLE public.economic_settings FROM authenticated;
REVOKE ALL ON TABLE public.economic_settings FROM service_role;

-- Trusted administrative access only. Browser clients are intentionally denied all access.
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.economic_settings TO service_role;

CREATE POLICY economic_settings_no_anon_access
    ON public.economic_settings
    FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);

CREATE POLICY economic_settings_no_browser_access
    ON public.economic_settings
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);

COMMENT ON TABLE public.economic_settings IS
    'Authoritative tax configuration for the future Presidential economic system. This table is intentionally not seeded with a default rate. The trusted server-side purchase flow must require exactly one valid active configuration before any purchase succeeds.';

COMMENT ON COLUMN public.economic_settings.tax_rate IS
    'Sales tax rate expressed as a decimal fraction, such as 0.075 for 7.5%. Must be greater than zero and less than one.';

COMMENT ON COLUMN public.economic_settings.active IS
    'Whether this configuration is the active Presidential tax setting. At most one row may be active.';

COMMENT ON COLUMN public.economic_settings.created_at IS
    'Timestamp when this tax configuration row was created.';

COMMENT ON COLUMN public.economic_settings.updated_at IS
    'Timestamp of the last modification to the tax configuration row.';

COMMIT;
