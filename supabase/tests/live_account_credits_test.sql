-- Validates a real owner adjustment and recipient isolation, then rolls it back.
BEGIN;
DO $$
DECLARE owner_id uuid; owner_user uuid; recipient_id uuid; recipient_user uuid;
  balance_before numeric; adjustment uuid; signal_count integer; message_id uuid;
BEGIN
  SELECT c.id,c.auth_user_id INTO owner_id,owner_user FROM public.moneytree_owners o
    JOIN public.citizens c ON c.id=o.citizen_id WHERE c.auth_user_id IS NOT NULL LIMIT 1;
  SELECT c.id,c.auth_user_id INTO recipient_id,recipient_user FROM public.citizens c
    JOIN public.citizen_private cp ON cp.citizen_id=c.id
    WHERE c.id<>owner_id AND c.auth_user_id IS NOT NULL LIMIT 1;
  IF owner_user IS NULL OR recipient_user IS NULL THEN RAISE EXCEPTION 'Test requires an owner and another citizen'; END IF;
  SELECT balance INTO balance_before FROM public.citizen_private WHERE citizen_id=recipient_id;
  PERFORM set_config('request.jwt.claim.sub',owner_user::text,true);
  SELECT adjustment_id INTO adjustment FROM public.owner_adjust_citizen_balance(recipient_id,1.00,'Rollback-only live balance test','live-test:'||gen_random_uuid());
  IF (SELECT balance FROM public.citizen_private WHERE citizen_id=recipient_id) <> balance_before+1 THEN
    RAISE EXCEPTION 'Adjustment did not update balance';
  END IF;
  SELECT id INTO message_id FROM realtime.messages
    WHERE topic='citizen-balance:'||recipient_user::text AND event='balance_changed'
      AND private=true AND (payload - 'id')='{}'::jsonb AND inserted_at>=transaction_timestamp()
    ORDER BY inserted_at DESC LIMIT 1;
  IF message_id IS NULL THEN RAISE EXCEPTION 'Private credit signal missing'; END IF;
  IF has_table_privilege('authenticated','public.citizen_private','SELECT') THEN
    RAISE EXCEPTION 'Private balance table access must remain restricted';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',recipient_user::text,true);
  PERFORM set_config('realtime.topic','citizen-balance:'||recipient_user::text,true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO signal_count FROM realtime.messages WHERE id=message_id;
  IF signal_count<>1 THEN RAISE EXCEPTION 'Recipient cannot receive own signal'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',owner_user::text,true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO signal_count FROM realtime.messages WHERE id=message_id;
  IF signal_count<>0 THEN RAISE EXCEPTION 'Another citizen can receive recipient signal'; END IF;
  RESET ROLE;
END;
$$;
SELECT 'Credit signal and recipient isolation passed; test changes rolled back' AS result;
ROLLBACK;
