BEGIN;

CREATE FUNCTION public.owner_send_announcement(p_title text, p_body text, p_request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_sender uuid; v_existing public.game_notifications%ROWTYPE; v_id uuid; v_key text;
BEGIN
  SELECT c.id INTO v_sender FROM public.citizens c
  JOIN public.moneytree_owners o ON o.citizen_id=c.id
  WHERE c.auth_user_id=auth.uid();
  IF v_sender IS NULL THEN RAISE EXCEPTION 'Owner access required.' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR p_title IS NULL OR char_length(trim(p_title)) NOT BETWEEN 1 AND 120
     OR p_body IS NULL OR char_length(trim(p_body)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Provide a title (1–120 characters), message (1–2000 characters), and request ID.' USING ERRCODE='22023';
  END IF;
  v_key := 'announcement:'||v_sender||':'||p_request_id;
  INSERT INTO public.game_notifications(category,title,body,target,event_key,payload)
  VALUES('world',trim(p_title),trim(p_body),'announcement',v_key,jsonb_build_object('sender_id',v_sender))
  ON CONFLICT(event_key) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT * INTO v_existing FROM public.game_notifications WHERE event_key=v_key;
  IF v_existing.title IS DISTINCT FROM trim(p_title) OR v_existing.body IS DISTINCT FROM trim(p_body) THEN
    RAISE EXCEPTION 'This request ID was already used for a different announcement.' USING ERRCODE='22023';
  END IF;
  RETURN v_existing.id;
END;
$$;
REVOKE ALL ON FUNCTION public.owner_send_announcement(text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.owner_send_announcement(text,text,uuid) TO authenticated;
COMMIT;
