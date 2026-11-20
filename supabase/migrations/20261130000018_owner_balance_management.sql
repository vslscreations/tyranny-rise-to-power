BEGIN;

-- Secure owner enrollment procedure:
-- 1) Confirm the owner citizen record in the database, not from the browser.
--    SELECT id, auth_user_id, public_name FROM public.citizens WHERE auth_user_id = '<auth-user-id>';
-- 2) Insert that citizen id directly into public.moneytree_owners from a trusted backend or service_role context.
--    INSERT INTO public.moneytree_owners (citizen_id) VALUES ('<citizen-id>')
--    ON CONFLICT (citizen_id) DO NOTHING;
-- 3) Do not grant ownership to every authenticated user or moderator automatically.
--    Keep this table private to the database and service role; browser clients cannot edit it.
CREATE TABLE IF NOT EXISTS public.moneytree_owners (
    citizen_id uuid PRIMARY KEY REFERENCES public.citizens(id) ON DELETE CASCADE,
    granted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.moneytree_owners ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.moneytree_owners FROM PUBLIC;
REVOKE ALL ON TABLE public.moneytree_owners FROM anon;
REVOKE ALL ON TABLE public.moneytree_owners FROM authenticated;
REVOKE ALL ON TABLE public.moneytree_owners FROM service_role;
GRANT SELECT ON TABLE public.moneytree_owners TO service_role;

CREATE POLICY moneytree_owners_no_browser_insert
    ON public.moneytree_owners
    FOR INSERT
    TO authenticated
    WITH CHECK (false);

CREATE POLICY moneytree_owners_no_browser_update
    ON public.moneytree_owners
    FOR UPDATE
    TO authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY moneytree_owners_no_browser_delete
    ON public.moneytree_owners
    FOR DELETE
    TO authenticated
    USING (false);

CREATE TABLE IF NOT EXISTS public.owner_balance_adjustments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_citizen_id uuid NOT NULL REFERENCES public.citizens(id) ON DELETE CASCADE,
    target_citizen_id uuid NOT NULL REFERENCES public.citizens(id) ON DELETE CASCADE,
    amount numeric(12,2) NOT NULL CHECK (amount <> 0),
    reason text NOT NULL CHECK (length(trim(reason)) > 0),
    idempotency_key text NOT NULL,
    balance_before numeric(12,2) NOT NULL,
    balance_after numeric(12,2) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_citizen_id, idempotency_key)
);

ALTER TABLE public.owner_balance_adjustments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.owner_balance_adjustments FROM PUBLIC;
REVOKE ALL ON TABLE public.owner_balance_adjustments FROM anon;
REVOKE ALL ON TABLE public.owner_balance_adjustments FROM authenticated;
REVOKE ALL ON TABLE public.owner_balance_adjustments FROM service_role;
GRANT ALL ON TABLE public.owner_balance_adjustments TO service_role;

CREATE POLICY owner_balance_adjustments_no_browser_access
    ON public.owner_balance_adjustments
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.owner_balance_self_check()
RETURNS TABLE (
    is_owner boolean,
    citizen_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
    v_citizen_id uuid;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL THEN
        is_owner := false;
        citizen_id := null;
        RETURN NEXT;
        RETURN;
    END IF;

    SELECT c.id
      INTO v_citizen_id
      FROM public.citizens AS c
     WHERE c.auth_user_id = v_user
     LIMIT 1;

    IF v_citizen_id IS NULL THEN
        is_owner := false;
        citizen_id := null;
        RETURN NEXT;
        RETURN;
    END IF;

    is_owner := EXISTS (
        SELECT 1
          FROM public.moneytree_owners AS mo
         WHERE mo.citizen_id = v_citizen_id
    );
    citizen_id := v_citizen_id;

    RETURN NEXT;
END;
$$;

ALTER FUNCTION public.owner_balance_self_check() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.owner_balance_self_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_balance_self_check() FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_balance_self_check() TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_protected_citizen_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
begin
  if tg_table_name = 'citizens' then
    if new.citizen_id is distinct from old.citizen_id then
      raise exception 'Citizen ID cannot be changed.';
    end if;

    if new.auth_user_id is distinct from old.auth_user_id then
      raise exception 'Auth user link cannot be changed.';
    end if;

    if new.registration_date is distinct from old.registration_date then
      raise exception 'Registration date cannot be changed.';
    end if;
  end if;

  if tg_table_name = 'citizen_private' then
    if new.balance is distinct from old.balance then
      if not (
        current_user = 'postgres'
        and (
          current_setting('app.moneytree_reward_credit', true) = 'on'
          or current_setting('app.store_purchase_authorized', true) = 'on'
          or current_setting('app.owner_balance_adjustment', true) = 'on'
        )
        and tg_table_name = 'citizen_private'
      ) then
        raise exception 'Balance cannot be changed by browser clients.';
      end if;
    end if;

    if new.profession is distinct from old.profession then
      raise exception 'Profession cannot be changed by browser clients.';
    end if;

    if new.social_class is distinct from old.social_class then
      raise exception 'Social class cannot be changed by browser clients.';
    end if;

    if new.education is distinct from old.education then
      if not (
        current_user = 'postgres'
        and current_setting('app.store_purchase_authorized', true) = 'on'
      ) then
        raise exception 'Education cannot be changed by browser clients.';
      end if;
    end if;

    if new.account_status is distinct from old.account_status then
      raise exception 'Account status cannot be changed by browser clients.';
    end if;

    if new.privileges is distinct from old.privileges then
      raise exception 'Privileges cannot be changed by browser clients.';
    end if;
  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.owner_adjust_citizen_balance(
    p_target_citizen_id uuid,
    p_amount numeric(12,2),
    p_reason text,
    p_idempotency_key text
)
RETURNS TABLE (
    adjustment_id uuid,
    target_citizen_id uuid,
    amount numeric(12,2),
    reason text,
    balance_before numeric(12,2),
    balance_after numeric(12,2),
    result text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
    v_requester_citizen_id uuid;
    v_target_citizen_id uuid;
    v_target_private public.citizen_private%ROWTYPE;
    v_clean_reason text;
    v_amount numeric(12,2);
    v_balance_before numeric(12,2);
    v_balance_after numeric(12,2);
    v_adjustment_id uuid;
    v_existing record;
    v_inserted boolean := false;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
    END IF;

    IF p_target_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Target citizen is required.' USING ERRCODE = '23502';
    END IF;

    IF p_amount IS NULL OR p_amount = 0 THEN
        RAISE EXCEPTION 'Adjustment amount must be non-zero.' USING ERRCODE = '23514';
    END IF;

    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'A reason is required for the balance adjustment.' USING ERRCODE = '23502';
    END IF;

    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'Idempotency key is required.' USING ERRCODE = '23502';
    END IF;

    v_clean_reason := NULLIF(trim(p_reason), '');
    v_amount := round(p_amount::numeric(12,2), 2);

    SELECT c.id
      INTO v_requester_citizen_id
      FROM public.citizens AS c
     WHERE c.auth_user_id = v_user
     LIMIT 1;

    IF v_requester_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Authenticated citizen record not found.' USING ERRCODE = '23503';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.moneytree_owners AS mo
         WHERE mo.citizen_id = v_requester_citizen_id
    ) THEN
        RAISE EXCEPTION 'Owner access required.' USING ERRCODE = '42501';
    END IF;

    SELECT cp.*
      INTO v_target_private
      FROM public.citizen_private AS cp
     WHERE cp.citizen_id = p_target_citizen_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target citizen private record not found.' USING ERRCODE = '23503';
    END IF;

    SELECT oba.*
      INTO v_existing
      FROM public.owner_balance_adjustments AS oba
     WHERE oba.owner_citizen_id = v_requester_citizen_id
       AND oba.idempotency_key = p_idempotency_key
     LIMIT 1;

    IF FOUND THEN
        RETURN QUERY
        SELECT
            v_existing.id,
            v_existing.target_citizen_id,
            v_existing.amount,
            v_existing.reason,
            v_existing.balance_before,
            v_existing.balance_after,
            'duplicate_request'::text;
        RETURN;
    END IF;

    v_balance_before := v_target_private.balance;
    v_balance_after := round((v_balance_before + v_amount)::numeric(12,2), 2);
    v_adjustment_id := gen_random_uuid();

    BEGIN
        INSERT INTO public.owner_balance_adjustments (
            id,
            owner_citizen_id,
            target_citizen_id,
            amount,
            reason,
            idempotency_key,
            balance_before,
            balance_after,
            created_at
        )
        VALUES (
            v_adjustment_id,
            v_requester_citizen_id,
            p_target_citizen_id,
            v_amount,
            v_clean_reason,
            p_idempotency_key,
            v_balance_before,
            v_balance_after,
            now()
        )
        ON CONFLICT (owner_citizen_id, idempotency_key) DO NOTHING
        RETURNING id INTO v_adjustment_id;

        v_inserted := v_adjustment_id IS NOT NULL;
    EXCEPTION WHEN unique_violation THEN
        v_inserted := false;
    END;

    IF NOT v_inserted THEN
        SELECT oba.id,
               oba.target_citizen_id,
               oba.amount,
               oba.reason,
               oba.balance_before,
               oba.balance_after,
               'duplicate_request'::text
          INTO v_existing
          FROM public.owner_balance_adjustments AS oba
         WHERE oba.owner_citizen_id = v_requester_citizen_id
           AND oba.idempotency_key = p_idempotency_key
         LIMIT 1;

        IF FOUND THEN
            RETURN QUERY
            SELECT
                v_existing.id,
                v_existing.target_citizen_id,
                v_existing.amount,
                v_existing.reason,
                v_existing.balance_before,
                v_existing.balance_after,
                'duplicate_request'::text;
            RETURN;
        END IF;
    END IF;

    PERFORM set_config('app.owner_balance_adjustment', 'on', true);
    UPDATE public.citizen_private AS cp
       SET balance = v_balance_after
     WHERE cp.citizen_id = p_target_citizen_id;
    PERFORM set_config('app.owner_balance_adjustment', 'off', true);

    RETURN QUERY
    SELECT
        v_adjustment_id,
        p_target_citizen_id,
        v_amount,
        v_clean_reason,
        v_balance_before,
        v_balance_after,
        'adjusted'::text;
END;
$$;

ALTER FUNCTION public.owner_adjust_citizen_balance(uuid, numeric(12,2), text, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.owner_adjust_citizen_balance(uuid, numeric(12,2), text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_adjust_citizen_balance(uuid, numeric(12,2), text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_adjust_citizen_balance(uuid, numeric(12,2), text, text) TO authenticated;

COMMIT;
