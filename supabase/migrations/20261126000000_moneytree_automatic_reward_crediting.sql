BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_protected_citizen_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
begin
  if current_user = 'service_role' then
    return new;
  end if;

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
        and current_setting('app.moneytree_reward_credit', true) = 'on'
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
      raise exception 'Education cannot be changed by browser clients.';
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
$function$;

CREATE OR REPLACE FUNCTION public.moderate_moneytree_contribution(
    p_contribution_id uuid,
    p_decision text,
    p_reason text DEFAULT NULL
)
RETURNS TABLE (
    contribution_id uuid,
    moderation_state text,
    result text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
    v_caller_citizen_id uuid;
    v_contribution record;
    v_clean_reason text;
BEGIN
    v_user := auth.uid();
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
    END IF;

    IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Decision must be approved or rejected.' USING ERRCODE = '23514';
    END IF;

    SELECT c.id
      INTO v_caller_citizen_id
      FROM public.citizens AS c
     WHERE c.auth_user_id = v_user;

    IF v_caller_citizen_id IS NULL THEN
        RAISE EXCEPTION 'Authenticated citizen record not found.' USING ERRCODE = '23503';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.moneytree_moderators AS mm
         WHERE mm.citizen_id = v_caller_citizen_id
    ) THEN
        RAISE EXCEPTION 'Moderator access required.' USING ERRCODE = '42501';
    END IF;

    SELECT mc.*
      INTO v_contribution
      FROM public.moneytree_contributions AS mc
     WHERE mc.id = p_contribution_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contribution not found.' USING ERRCODE = '23503';
    END IF;

    IF v_contribution.moderation_state <> 'pending' THEN
        RAISE EXCEPTION 'Only pending contributions can be moderated.' USING ERRCODE = '23514';
    END IF;

    v_clean_reason := NULLIF(trim(p_reason), '');

    IF p_decision = 'approved' THEN
        IF EXISTS (
            SELECT 1
              FROM public.moneytree_reward_ledger AS rl
             WHERE rl.contribution_key = v_contribution.id::text
        ) THEN
            RAISE EXCEPTION 'Reward already recorded for this contribution.' USING ERRCODE = '23505';
        END IF;

        INSERT INTO public.moneytree_reward_ledger (
            citizen_id,
            contribution_key,
            reward_category,
            amount,
            created_at
        )
        VALUES (
            v_contribution.citizen_id,
            v_contribution.id::text,
            v_contribution.contribution_type,
            10.00,
            now()
        );

        PERFORM set_config('app.moneytree_reward_credit', 'on', true);

        UPDATE public.citizen_private AS cp
           SET balance = cp.balance + 10.00
         WHERE cp.citizen_id = v_contribution.citizen_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Citizen balance record not found.' USING ERRCODE = '23503';
        END IF;

        PERFORM set_config('app.moneytree_reward_credit', 'off', true);
    END IF;

    UPDATE public.moneytree_contributions AS mc
       SET moderation_state = p_decision,
           moderated_by_citizen_id = v_caller_citizen_id,
           moderated_at = now(),
           moderation_reason = v_clean_reason
     WHERE mc.id = p_contribution_id;

    RETURN QUERY
    SELECT p_contribution_id,
           p_decision,
           'moderated'::text;
END;
$$;

ALTER FUNCTION public.moderate_moneytree_contribution(uuid, text, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.moderate_moneytree_contribution(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moderate_moneytree_contribution(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.moderate_moneytree_contribution(uuid, text, text) TO authenticated;

COMMIT;
