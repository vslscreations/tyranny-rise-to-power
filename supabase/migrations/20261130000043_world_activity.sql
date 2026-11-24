BEGIN;
CREATE TABLE public.world_activity_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  recording_started_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO public.world_activity_settings DEFAULT VALUES;
CREATE TABLE public.world_activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  transaction_id bigint NOT NULL DEFAULT txid_current(),
  category text NOT NULL,
  action text NOT NULL,
  actor_id uuid,
  actor_name text NOT NULL,
  subject_id uuid,
  subject_name text,
  entity_type text NOT NULL,
  entity_id text,
  summary text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_document tsvector GENERATED ALWAYS AS
    (to_tsvector('simple',coalesce(actor_name,'')||' '||coalesce(subject_name,'')||' '||summary||' '||coalesce(entity_id,''))) STORED
);
CREATE INDEX world_activity_category_page ON public.world_activity(category,id DESC);
CREATE INDEX world_activity_time ON public.world_activity(occurred_at DESC,id DESC);
CREATE INDEX world_activity_search ON public.world_activity USING gin(search_document);
ALTER TABLE public.world_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.world_activity_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.world_activity, public.world_activity_settings FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.world_activity_id_seq FROM PUBLIC,anon,authenticated;

-- Explicit field lists keep credentials, message bodies, ballots and large media
-- out of the journal. Capture changes in the same transaction as the action.
CREATE FUNCTION public.capture_world_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prev jsonb := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  next jsonb := CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
  row_data jsonb; actor uuid; subject uuid; actor_label text; subject_label text;
  verb text; before_values jsonb:='{}'; after_values jsonb:='{}'; changed jsonb:='[]';
  key text; val jsonb; record_key text; summary_text text; category text:=TG_ARGV[0];
BEGIN
  IF TG_OP='UPDATE' AND (prev-'updated_at')=(next-'updated_at') THEN RETURN NEW; END IF;
  row_data:=CASE WHEN TG_OP='DELETE' THEN prev ELSE next END;
  -- Derived player/creator alerts and delivery retries are not additional actions.
  IF TG_TABLE_NAME='game_notifications' AND row_data->>'target' IS DISTINCT FROM 'announcement' THEN RETURN COALESCE(NEW,OLD); END IF;
  IF TG_TABLE_NAME='creator_notifications' AND (TG_OP<>'UPDATE' OR prev->'read_at'=next->'read_at') THEN RETURN COALESCE(NEW,OLD); END IF;
  IF TG_TABLE_NAME='game_notification_reads' AND TG_OP<>'INSERT' THEN RETURN COALESCE(NEW,OLD); END IF;
  IF TG_TABLE_NAME='web_push_subscriptions' AND TG_OP='UPDATE' AND (prev-'created_at')=(next-'created_at') THEN RETURN NEW; END IF;

  SELECT c.id,c.public_name INTO actor,actor_label FROM public.citizens c WHERE c.auth_user_id=auth.uid();
  IF actor IS NULL AND TG_OP='INSERT' AND TG_ARGV[3]<>'' THEN
    actor:=nullif(row_data->>TG_ARGV[3],'')::uuid;
    SELECT c.public_name INTO actor_label FROM public.citizens c WHERE c.id=actor;
  END IF;
  subject:=CASE WHEN TG_TABLE_NAME='citizens' THEN (row_data->>'id')::uuid
    ELSE coalesce(nullif(row_data->>'target_citizen_id',''),nullif(row_data->>'citizen_id',''),nullif(row_data->>'sender_citizen_id',''))::uuid END;
  SELECT c.public_name INTO subject_label FROM public.citizens c WHERE c.id=subject;
  IF TG_TABLE_NAME='citizens' THEN subject_label:=row_data->>'public_name'; END IF;
  IF actor=subject AND actor_label IS NULL THEN actor_label:=subject_label; END IF;
  actor_label:=coalesce(actor_label,CASE WHEN actor IS NULL THEN 'System / server' ELSE 'Deleted citizen' END);
  record_key:=coalesce(row_data->>'id',row_data->>'citizen_id',row_data->>'word',row_data->>'term',row_data->>'name');
  IF TG_TABLE_NAME='game_notification_reads' THEN record_key:=(row_data->>'citizen_id')||':'||(row_data->>'notification_id'); END IF;
  verb:=CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'DELETE' THEN 'deleted' ELSE 'updated' END;
  IF TG_OP='UPDATE' THEN
    IF next->>'deleted_at' IS NOT NULL AND prev->>'deleted_at' IS NULL THEN verb:='removed';
    ELSIF next->>'read_at' IS NOT NULL AND prev->>'read_at' IS NULL THEN verb:='read';
    ELSIF next->'moderation_state' IS DISTINCT FROM prev->'moderation_state' AND next->>'moderation_state' IN ('approved','rejected') THEN verb:=next->>'moderation_state';
    ELSIF next->'status' IS DISTINCT FROM prev->'status' AND next->>'status' IN ('published','open','closed','reversed','resolved','dismissed') THEN verb:=next->>'status';
    END IF;
    SELECT coalesce(jsonb_agg(k ORDER BY k),'[]'::jsonb) INTO changed FROM jsonb_object_keys(prev||next) k
      WHERE k<>'updated_at' AND prev->k IS DISTINCT FROM next->k;
    -- Store field names only for omitted text, and never credential-field names.
    changed:=changed-'auth_user_id'-'endpoint'-'p256dh'-'auth'-'option_id'-'idempotency_key'-'submission_request_id';
  END IF;
  FOREACH key IN ARRAY string_to_array(TG_ARGV[2],',') LOOP
    IF key='' THEN CONTINUE; END IF;
    IF TG_OP='UPDATE' AND prev->key IS NOT DISTINCT FROM next->key THEN CONTINUE; END IF;
    IF prev ? key THEN
      val:=prev->key; IF jsonb_typeof(val)='string' THEN val:=to_jsonb(left(prev->>key,300)); END IF;
      before_values:=before_values||jsonb_build_object(key,val);
    END IF;
    IF next ? key THEN
      val:=next->key; IF jsonb_typeof(val)='string' THEN val:=to_jsonb(left(next->>key,300)); END IF;
      after_values:=after_values||jsonb_build_object(key,val);
    END IF;
  END LOOP;
  summary_text:=TG_ARGV[1]||' '||verb;
  IF TG_TABLE_NAME IN ('moneytree_discussions','polls','news_articles','store_catalog','store_categories','game_notifications') THEN
    summary_text:=summary_text||': '||left(coalesce(row_data->>'title',row_data->>'question',row_data->>'headline',row_data->>'product_name',row_data->>'display_name',''),160);
  END IF;
  INSERT INTO public.world_activity(category,action,actor_id,actor_name,subject_id,subject_name,entity_type,entity_id,summary,details)
    VALUES(category,verb,actor,actor_label,subject,subject_label,TG_TABLE_NAME,record_key,summary_text,
      jsonb_build_object('before',before_values,'after',after_values,'changed_fields',changed));
  RETURN COALESCE(NEW,OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.capture_world_activity() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_world_activity(p_before_id bigint DEFAULT NULL,p_category text DEFAULT NULL,
  p_query text DEFAULT NULL,p_since timestamptz DEFAULT NULL,p_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; term text:=nullif(btrim(p_query),'');
BEGIN
  IF NOT public.is_owner_for_authenticated_user() THEN RAISE EXCEPTION 'Owner access required.' USING ERRCODE='42501'; END IF;
  IF p_limit IS NULL OR p_limit<1 OR p_limit>100 OR length(coalesce(term,''))>120 OR p_before_id<1 THEN
    RAISE EXCEPTION 'Invalid activity filters.' USING ERRCODE='22023'; END IF;
  WITH page AS MATERIALIZED (
    SELECT id,occurred_at,transaction_id,category,action,actor_id,actor_name,subject_id,subject_name,entity_type,entity_id,summary,details
    FROM public.world_activity
    WHERE (p_before_id IS NULL OR id<p_before_id) AND (p_category IS NULL OR category=p_category)
      AND (p_since IS NULL OR occurred_at>=p_since)
      AND (term IS NULL OR search_document @@ websearch_to_tsquery('simple',term))
    ORDER BY id DESC LIMIT p_limit+1
  ), visible AS (SELECT * FROM page ORDER BY id DESC LIMIT p_limit)
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg((to_jsonb(v)-'id'-'transaction_id')||
      jsonb_build_object('id',id::text,'transaction_id',transaction_id::text) ORDER BY id DESC) FROM visible v),'[]'::jsonb),
    'has_more',(SELECT count(*)>p_limit FROM page),
    'next_cursor',(SELECT min(id)::text FROM visible),
    'recording_started_at',(SELECT recording_started_at FROM public.world_activity_settings WHERE singleton),
    'server_time',now()) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_world_activity(bigint,text,text,timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_world_activity(bigint,text,text,timestamptz,integer) TO authenticated;

-- Gameplay trigger bindings follow. No triggers are installed on auth tables,
-- transport queues, or the journal itself.
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.citizens
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('citizens','Citizen profile','public_name,political_party,avatar_background,avatar_type','id');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.citizen_private
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('economy','Citizen account','balance,profession,social_class,education,account_status','');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.citizen_social_handles
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('citizens','Citizen handle','handle','citizen_id');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.moneytree_discussions
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('moneytree','MoneyTree discussion','title,discussion_type,is_active,profession_gate,question_category,sort_order','created_by_citizen_id');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.moneytree_contributions
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('moneytree','MoneyTree contribution','discussion_id,contribution_type,parent_contribution_id,word_count,moderation_state','citizen_id');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.moneytree_reward_ledger
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('economy','MoneyTree reward','reward_category,amount','');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.moneytree_clock_in_claims
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('economy','Daily reward','reward_amount,window_start','citizen_id');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('social','Social post','deleted_at','citizen_id');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.social_comments
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('social','Social comment','post_id,parent_comment_id,deleted_at','citizen_id');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.social_post_reactions
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('social','Social reaction','post_id,reaction_type','citizen_id');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.social_follows
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('social','Follow','following_citizen_id','follower_citizen_id');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.social_reports
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('social','Content report','target_type,target_id,status','reporter_citizen_id');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.social_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('social','Public chat message','deleted_at','citizen_id');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.citizen_relationships
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('social','Citizen relationship','target_citizen_id,relationship_type','owner_citizen_id');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('messages','Private message','thread_id,read_at','sender_citizen_id');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.message_threads
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('messages','Private conversation','','');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.store_purchases
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('store','Store purchase','item_name,quantity,final_amount,tax_amount,balance_after_purchase,status,reversed_at','citizen_id');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.citizen_inventory
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('store','Inventory item','item_name,quantity,is_active','');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.store_catalog
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('store','Store product','product_name,product_key,price,is_visible,is_purchasable,is_locked','');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.store_categories
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('store','Store category','display_name,category_key,is_visible,is_locked,display_order','');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.economic_settings
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('economy','Economic settings','tax_rate,active','');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.owner_balance_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('economy','Owner balance adjustment','target_citizen_id,amount,balance_before,balance_after','owner_citizen_id');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.lucky7_transaction_history
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('casino','Casino round','game_type,wager,payout,net_change,balance_after,status','citizen_id');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.polls
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('politics','Poll','question,status,required_diploma','created_by_citizen_id');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.poll_options
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('politics','Poll choice','poll_id,option_text,sort_order','');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.poll_votes
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('politics','Ballot','poll_id','citizen_id');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.news_articles
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('news','News article','headline,status,published_at','author_citizen_id');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.moneytree_moderators
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('administration','Moderator access','citizen_id','');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.moneytree_owners
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('administration','Owner access','citizen_id','');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.store_reversal_admins
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('administration','Purchase reversal access','citizen_id','granted_by_citizen_id');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.creator_notification_recipients
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('administration','Creator inbox access','citizen_id','');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.social_handle_blocklist
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('administration','Handle blocklist rule','word','');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.social_handle_reserved_names
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('administration','Reserved handle','name','');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.social_handle_prohibited_terms
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('administration','Prohibited handle rule','term,match_mode','');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.game_notifications
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('notifications','World announcement','title','');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.game_notification_reads
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('notifications','Player notification read','notification_id','citizen_id');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.creator_notifications
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('notifications','Creator notification','kind,read_at','');
CREATE TRIGGER audit_world_activity AFTER INSERT OR UPDATE OR DELETE ON public.web_push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.capture_world_activity('notifications','Phone notification device','','citizen_id');
COMMIT;
