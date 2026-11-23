BEGIN;

-- Rare destructive operation. All changes run in one transaction. Foreign-key
-- or immutable-history failures roll back the entire operation.
CREATE OR REPLACE FUNCTION public.owner_delete_citizen(p_citizen_id uuid, p_confirmation text, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user uuid;
  v_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.citizens c JOIN public.moneytree_owners o ON o.citizen_id = c.id
    WHERE c.auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Owner access required.' USING ERRCODE = '42501';
  END IF;
  IF p_citizen_id IS NULL OR length(trim(coalesce(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'Select a citizen and provide a reason of at least five characters.';
  END IF;
  -- Stabilize shared-content checks against concurrent replies and new records.
  LOCK TABLE public.citizens, public.moneytree_owners, public.moneytree_contributions,
    public.moneytree_discussions, public.social_posts, public.social_comments,
    public.social_post_reactions, public.social_reports, public.message_threads,
    public.messages, public.polls, public.poll_votes
    IN SHARE ROW EXCLUSIVE MODE;
  SELECT c.auth_user_id, c.public_name INTO v_user, v_name
    FROM public.citizens c WHERE c.id = p_citizen_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Citizen no longer exists.'; END IF;
  IF v_user = auth.uid() OR EXISTS (SELECT 1 FROM public.moneytree_owners o WHERE o.citizen_id = p_citizen_id) THEN
    RAISE EXCEPTION 'Owner accounts cannot be deleted with this tool.';
  END IF;
  IF p_confirmation IS DISTINCT FROM ('DELETE ' || p_citizen_id::text) THEN
    RAISE EXCEPTION 'Deletion confirmation does not match the selected citizen.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.social_comments c JOIN public.social_posts p ON p.id = c.post_id
    WHERE p.citizen_id = p_citizen_id AND c.citizen_id <> p_citizen_id
  ) OR EXISTS (
    SELECT 1 FROM public.messages m JOIN public.message_threads t ON t.id = m.thread_id
    WHERE (t.participant_a_citizen_id = p_citizen_id OR t.participant_b_citizen_id = p_citizen_id)
      AND m.sender_citizen_id <> p_citizen_id
  ) OR EXISTS (
    SELECT 1 FROM public.moneytree_contributions child
    LEFT JOIN public.moneytree_contributions parent ON parent.id = child.parent_contribution_id
    JOIN public.moneytree_discussions d ON d.id = child.discussion_id
    WHERE child.citizen_id <> p_citizen_id
      AND (parent.citizen_id = p_citizen_id OR d.created_by_citizen_id = p_citizen_id)
  ) OR EXISTS (
    SELECT 1 FROM public.poll_votes v JOIN public.polls p ON p.id = v.poll_id
    WHERE p.created_by_citizen_id = p_citizen_id AND v.citizen_id <> p_citizen_id
  ) OR EXISTS (
    SELECT 1 FROM public.social_reports r
    WHERE r.reporter_citizen_id <> p_citizen_id AND (
      (r.target_type = 'post' AND EXISTS (SELECT 1 FROM public.social_posts p WHERE p.id = r.target_id AND p.citizen_id = p_citizen_id))
      OR (r.target_type = 'comment' AND EXISTS (SELECT 1 FROM public.social_comments c WHERE c.id = r.target_id AND c.citizen_id = p_citizen_id))
    )
  ) THEN
    RAISE EXCEPTION 'Deletion blocked because it would remove another citizen''s content, conversation, report, or vote.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.store_purchases p WHERE p.citizen_id = p_citizen_id OR p.reversed_by_citizen_id = p_citizen_id) THEN
    RAISE EXCEPTION 'Deletion blocked by permanent Store purchase history. This account needs a separate history-retention migration before it can be deleted.';
  END IF;

  DELETE FROM public.moneytree_reward_ledger WHERE citizen_id = p_citizen_id;
  -- Delete only the target's contributions, from leaves to roots.
  LOOP
    DELETE FROM public.moneytree_contributions c
    WHERE c.citizen_id = p_citizen_id AND NOT EXISTS (
      SELECT 1 FROM public.moneytree_contributions child WHERE child.parent_contribution_id = c.id
    );
    EXIT WHEN NOT FOUND;
  END LOOP;
  DELETE FROM public.moneytree_discussions WHERE created_by_citizen_id = p_citizen_id;
  DELETE FROM public.citizen_inventory WHERE citizen_id = p_citizen_id;
  DELETE FROM public.store_reversal_admins WHERE citizen_id = p_citizen_id;
  -- Auth deletion cascades to the citizen and its remaining personal records.
  IF v_user IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_user;
    IF NOT FOUND THEN RAISE EXCEPTION 'Linked login account is missing. No changes were saved.'; END IF;
  ELSE
    DELETE FROM public.citizens WHERE id = p_citizen_id;
  END IF;
END;
$$;
ALTER FUNCTION public.owner_delete_citizen(uuid, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.owner_delete_citizen(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_delete_citizen(uuid, text, text) TO authenticated;
COMMIT;
