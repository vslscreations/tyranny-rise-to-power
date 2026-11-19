BEGIN;

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

CREATE OR REPLACE FUNCTION public.purchase_store_item(
    p_product_id uuid,
    p_quantity integer,
    p_idempotency_key text
)
RETURNS TABLE (
    purchase_id uuid,
    result text,
    receipt jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
    v_citizen_id uuid;
    v_citizen_private public.citizen_private%ROWTYPE;
    v_existing_purchase public.store_purchases%ROWTYPE;
    v_category_id uuid;
    v_category public.store_categories%ROWTYPE;
    v_product public.store_catalog%ROWTYPE;
    v_active_settings public.economic_settings%ROWTYPE;
    v_approved_count integer;
    v_subtotal numeric(12,2);
    v_tax_amount numeric(12,2);
    v_final_amount numeric(12,2);
    v_new_balance numeric(12,2);
    v_new_education text;
    v_now timestamptz;
    v_purchase_id uuid;
    v_receipt jsonb;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
    END IF;

    IF p_product_id IS NULL THEN
        RAISE EXCEPTION 'Product id is required.' USING ERRCODE = '23502';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be greater than zero.' USING ERRCODE = '23514';
    END IF;

    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'Idempotency key is required.' USING ERRCODE = '23502';
    END IF;

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

    SELECT sp.*
      INTO v_existing_purchase
      FROM public.store_purchases AS sp
     WHERE sp.citizen_id = v_citizen_id
       AND sp.idempotency_key = p_idempotency_key
     LIMIT 1;

    IF FOUND THEN
        IF v_existing_purchase.item_id = p_product_id
           AND v_existing_purchase.quantity = p_quantity THEN
            v_receipt := jsonb_build_object(
                'purchase_id', v_existing_purchase.receipt_purchase_id,
                'citizen_id', v_existing_purchase.receipt_citizen_id,
                'item_id', v_existing_purchase.receipt_item_id,
                'item_name', v_existing_purchase.receipt_item_name,
                'quantity', v_existing_purchase.receipt_quantity,
                'original_item_price', v_existing_purchase.receipt_original_item_price,
                'original_total', v_existing_purchase.receipt_original_total,
                'sales_tax_rate', v_existing_purchase.receipt_sales_tax_rate,
                'tax_amount', v_existing_purchase.receipt_tax_amount,
                'final_amount', v_existing_purchase.receipt_final_amount,
                'currency', v_existing_purchase.receipt_currency,
                'balance_after_purchase', v_existing_purchase.receipt_balance_after_purchase,
                'education_after_purchase', v_existing_purchase.receipt_education_after_purchase,
                'purchased_at', v_existing_purchase.receipt_purchased_at,
                'one_time_purchase', v_existing_purchase.receipt_one_time_purchase,
                'idempotency_key', v_existing_purchase.receipt_idempotency_key
            );

            RETURN QUERY
            SELECT v_existing_purchase.id,
                   'duplicate_request'::text,
                   v_receipt;
            RETURN;
        END IF;

        RAISE EXCEPTION 'Idempotency key already used with a different product or quantity.' USING ERRCODE = '23505';
    END IF;

    SELECT sc.category_id
      INTO v_category_id
      FROM public.store_catalog AS sc
     WHERE sc.id = p_product_id
     LIMIT 1;

    IF v_category_id IS NULL THEN
        RAISE EXCEPTION 'Product not found.' USING ERRCODE = '23503';
    END IF;

    SELECT sc.*
      INTO v_category
      FROM public.store_categories AS sc
     WHERE sc.id = v_category_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product category not found.' USING ERRCODE = '23503';
    END IF;

    SELECT sc.*
      INTO v_product
      FROM public.store_catalog AS sc
     WHERE sc.id = p_product_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Catalog product not found.' USING ERRCODE = '23503';
    END IF;

    IF v_product.category_id IS DISTINCT FROM v_category.id THEN
        RAISE EXCEPTION 'Product category mismatch detected.' USING ERRCODE = '23514';
    END IF;

    IF v_category.is_visible IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Category is not visible.' USING ERRCODE = '23514';
    END IF;

    IF v_category.is_locked IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'Category is locked.' USING ERRCODE = '23514';
    END IF;

    IF v_product.is_visible IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Product is not visible.' USING ERRCODE = '23514';
    END IF;

    IF v_product.is_locked IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'Product is locked.' USING ERRCODE = '23514';
    END IF;

    IF v_product.is_purchasable IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Product is not purchasable.' USING ERRCODE = '23514';
    END IF;

    IF v_product.price IS NULL THEN
        RAISE EXCEPTION 'Product price is not available.' USING ERRCODE = '23514';
    END IF;

    IF v_product.currency IS DISTINCT FROM 'USD' THEN
        RAISE EXCEPTION 'Only USD purchases are supported.' USING ERRCODE = '23514';
    END IF;

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be greater than zero.' USING ERRCODE = '23514';
    END IF;

    IF v_product.one_time_purchase = true AND p_quantity <> 1 THEN
        RAISE EXCEPTION 'One-time purchase products require a quantity of 1.' USING ERRCODE = '23514';
    END IF;

    IF v_product.one_time_purchase = true THEN
        IF EXISTS (
            SELECT 1
              FROM public.store_purchases AS sp
             WHERE sp.citizen_id = v_citizen_id
               AND sp.item_id = v_product.id
               AND sp.one_time_purchase = true
               AND sp.status IN ('completed', 'reversed')
        ) THEN
            RAISE EXCEPTION 'One-time purchase entitlement has already been consumed.' USING ERRCODE = '23505';
        END IF;
    END IF;

    SELECT es.*
      INTO v_active_settings
      FROM public.economic_settings AS es
     WHERE es.active = true
     FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active economic settings row exists.' USING ERRCODE = '23514';
    END IF;

    IF v_product.product_key = 'high_school_diploma' THEN
        SELECT count(*)
          INTO v_approved_count
          FROM public.moneytree_contributions AS mc
         WHERE mc.citizen_id = v_citizen_id
           AND mc.moderation_state = 'approved';

        IF v_approved_count < 200 THEN
            RAISE EXCEPTION 'High School Diploma requires 200 approved MoneyTree contributions.' USING ERRCODE = '23514';
        END IF;
    END IF;

    v_subtotal := round((v_product.price * p_quantity)::numeric(12,2), 2);
    v_tax_amount := round((v_subtotal * v_active_settings.tax_rate)::numeric(12,2), 2);
    v_final_amount := round((v_subtotal + v_tax_amount)::numeric(12,2), 2);

    IF v_citizen_private.balance < v_final_amount THEN
        RAISE EXCEPTION 'Insufficient balance for this purchase.' USING ERRCODE = '23514';
    END IF;

    v_new_balance := round((v_citizen_private.balance - v_final_amount)::numeric(12,2), 2);
    v_new_education := v_citizen_private.education;

    IF v_product.product_key = 'high_school_diploma' THEN
        v_new_education := 'High School Diploma';
    END IF;

    v_now := now();
    v_purchase_id := gen_random_uuid();

    BEGIN
        PERFORM set_config('app.store_purchase_authorized', 'on', true);

        UPDATE public.citizen_private AS cp
           SET balance = v_new_balance,
               education = v_new_education
         WHERE cp.citizen_id = v_citizen_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Citizen private record not found during wallet update.' USING ERRCODE = '23503';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        PERFORM set_config('app.store_purchase_authorized', 'off', true);
        RAISE;
    END;

    PERFORM set_config('app.store_purchase_authorized', 'off', true);

    INSERT INTO public.store_purchases (
        id,
        citizen_id,
        item_id,
        item_name,
        quantity,
        original_item_price,
        original_total,
        sales_tax_rate,
        tax_amount,
        final_amount,
        currency,
        balance_after_purchase,
        education_after_purchase,
        purchased_at,
        one_time_purchase,
        status,
        idempotency_key,
        receipt_purchase_id,
        receipt_citizen_id,
        receipt_item_id,
        receipt_item_name,
        receipt_quantity,
        receipt_original_item_price,
        receipt_original_total,
        receipt_sales_tax_rate,
        receipt_tax_amount,
        receipt_final_amount,
        receipt_currency,
        receipt_balance_after_purchase,
        receipt_education_after_purchase,
        receipt_purchased_at,
        receipt_one_time_purchase,
        receipt_idempotency_key,
        created_at,
        updated_at
    )
    VALUES (
        v_purchase_id,
        v_citizen_id,
        v_product.id,
        v_product.product_name,
        p_quantity,
        v_product.price,
        v_subtotal,
        v_active_settings.tax_rate,
        v_tax_amount,
        v_final_amount,
        v_product.currency,
        v_new_balance,
        v_new_education,
        v_now,
        v_product.one_time_purchase,
        'completed',
        p_idempotency_key,
        v_purchase_id,
        v_citizen_id,
        v_product.id,
        v_product.product_name,
        p_quantity,
        v_product.price,
        v_subtotal,
        v_active_settings.tax_rate,
        v_tax_amount,
        v_final_amount,
        v_product.currency,
        v_new_balance,
        v_new_education,
        v_now,
        v_product.one_time_purchase,
        p_idempotency_key,
        v_now,
        v_now
    );

    INSERT INTO public.citizen_inventory (
        citizen_id,
        purchase_id,
        item_id,
        item_name,
        quantity,
        granted_at,
        is_active,
        created_at,
        updated_at
    )
    VALUES (
        v_citizen_id,
        v_purchase_id,
        v_product.id,
        v_product.product_name,
        p_quantity,
        v_now,
        true,
        v_now,
        v_now
    );

    v_receipt := jsonb_build_object(
        'purchase_id', v_purchase_id,
        'citizen_id', v_citizen_id,
        'item_id', v_product.id,
        'item_name', v_product.product_name,
        'quantity', p_quantity,
        'original_item_price', v_product.price,
        'original_total', v_subtotal,
        'sales_tax_rate', v_active_settings.tax_rate,
        'tax_amount', v_tax_amount,
        'final_amount', v_final_amount,
        'currency', v_product.currency,
        'balance_after_purchase', v_new_balance,
        'education_after_purchase', v_new_education,
        'purchased_at', v_now,
        'one_time_purchase', v_product.one_time_purchase,
        'idempotency_key', p_idempotency_key
    );

    RETURN QUERY
    SELECT v_purchase_id,
           'completed'::text,
           v_receipt;
END;
$$;

ALTER FUNCTION public.purchase_store_item(uuid, integer, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.purchase_store_item(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purchase_store_item(uuid, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.purchase_store_item(uuid, integer, text) TO authenticated;

COMMIT;
