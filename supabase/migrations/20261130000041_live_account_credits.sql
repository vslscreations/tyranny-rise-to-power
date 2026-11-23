BEGIN;

-- Authorize receipt only on the signed-in user's private balance topic.
-- No browser access to citizen_private or adjustment history is introduced.
CREATE POLICY citizen_receive_own_balance_signal ON realtime.messages
FOR SELECT TO authenticated
USING (
  extension = 'broadcast'
  AND topic = 'citizen-balance:' || (SELECT auth.uid())::text
  AND (SELECT realtime.topic()) = 'citizen-balance:' || (SELECT auth.uid())::text
);

CREATE FUNCTION public.broadcast_account_credit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE recipient_user uuid;
BEGIN
  SELECT c.auth_user_id INTO recipient_user FROM public.citizens c WHERE c.id=NEW.target_citizen_id;
  IF recipient_user IS NOT NULL THEN
    PERFORM realtime.send('{}'::jsonb, 'balance_changed', 'citizen-balance:' || recipient_user::text, true);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.broadcast_account_credit() FROM PUBLIC, anon, authenticated;

-- The signal is delivered after commit, when the credited balance is available.
CREATE TRIGGER broadcast_owner_account_credit AFTER INSERT ON public.owner_balance_adjustments
FOR EACH ROW EXECUTE FUNCTION public.broadcast_account_credit();
COMMIT;
