const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const read=name=>fs.readFileSync(path.join(__dirname,'../supabase/migrations/'+name),'utf8');
const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
const ua='10000000-0000-0000-0000-000000000001',ub='10000000-0000-0000-0000-000000000002';
test('activity XP and exactly-once level cash in isolated PostgreSQL',async t=>{
  const db=await PGlite.create();t.after(()=>db.close());
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    CREATE TABLE citizens(id uuid PRIMARY KEY,auth_user_id uuid NOT NULL,public_name text,registration_date timestamptz DEFAULT now());
    CREATE TABLE citizen_private(citizen_id uuid PRIMARY KEY REFERENCES citizens(id) ON DELETE CASCADE,balance numeric DEFAULT 50,
      profession text DEFAULT 'Civilian',social_class text DEFAULT 'Homeless',education text DEFAULT 'No Diploma',account_status text DEFAULT 'active',privileges jsonb DEFAULT '[]');
    INSERT INTO citizens VALUES('${a}','${ua}','Citizen A',now()),('${b}','${ub}','Citizen B',now());
    INSERT INTO citizen_private(citizen_id) VALUES('${a}'),('${b}');
    CREATE SCHEMA realtime; CREATE TABLE realtime.signals(payload jsonb,event text,topic text,private boolean);
    CREATE FUNCTION realtime.send(jsonb,text,text,boolean) RETURNS void LANGUAGE sql AS $$ INSERT INTO realtime.signals VALUES($1,$2,$3,$4) $$;
    CREATE TABLE moneytree_contributions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),citizen_id uuid,moderation_state text DEFAULT 'pending',content text);
    CREATE TABLE social_posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),citizen_id uuid,content text,deleted_at timestamptz);
    CREATE TABLE social_comments(LIKE social_posts INCLUDING DEFAULTS);
    CREATE TABLE social_chat_messages(LIKE social_posts INCLUDING DEFAULTS);
    CREATE TABLE social_post_reactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),citizen_id uuid,post_id uuid,reaction_type text);
    CREATE TABLE social_follows(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),follower_citizen_id uuid,following_citizen_id uuid);
    CREATE TABLE citizen_relationships(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_citizen_id uuid,target_citizen_id uuid,relationship_type text);
    CREATE TABLE messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sender_citizen_id uuid,content text,read_at timestamptz);
    CREATE TABLE poll_votes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),citizen_id uuid,poll_id uuid);
    CREATE TABLE store_purchases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),citizen_id uuid,status text DEFAULT 'completed',idempotency_key text);
    CREATE TABLE lucky7_transaction_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),citizen_id uuid,status text DEFAULT 'posted',idempotency_key text);
    CREATE TABLE moneytree_clock_in_claims(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),citizen_id uuid,window_start timestamptz);
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;`);
  const audit=read('20261130000043_world_activity.sql');
  await db.exec(audit.slice(0,audit.indexOf('CREATE FUNCTION public.get_world_activity'))+'COMMIT;');
  const notifications=read('20261130000035_game_notifications.sql');
  await db.exec(notifications.slice(0,notifications.indexOf('CREATE FUNCTION public.get_game_notifications'))+'COMMIT;');
  await db.exec(read('20261130000044_citizen_leveling.sql'));
  await db.exec(read('20261130000045_activity_xp_and_level_rewards.sql'));
  await db.exec('CREATE TRIGGER guard BEFORE UPDATE ON citizen_private FOR EACH ROW EXECUTE FUNCTION prevent_protected_citizen_changes()');
  const value=async(sql,params=[])=>(await db.query(sql,params)).rows[0].value;
  const xp=id=>value('SELECT total_xp::text AS value FROM citizen_xp WHERE citizen_id=$1',[id]);
  const balance=id=>value('SELECT balance::integer AS value FROM citizen_private WHERE citizen_id=$1',[id]);
  const award=(id,key)=>db.query('SELECT award_citizen_xp($1,$2,$3) AS value',[id,'fixture',key]);
  await t.test('activation awards nothing retroactively and configures precisely the approved values',async()=>{
    assert.equal(await xp(a),'0');assert.equal(await balance(a),50);
    assert.equal(await value('SELECT count(*)::integer AS value FROM citizen_level_rewards'),0);
    assert.equal(await value('SELECT bool_and(enabled AND xp_amount=1) AS value FROM xp_activity_rules'),true);
    assert.equal(await value('SELECT xp_per_level::integer AS value FROM xp_level_config'),100);
    assert.equal(await value("SELECT definition->>'amount' AS value FROM xp_level_milestones WHERE milestone_key='level_up_cash'"),'100');
  });
  await t.test('every configured gameplay source awards 1 XP; MoneyTree waits for approval',async()=>{
    const post=await value('INSERT INTO social_posts(citizen_id) VALUES($1) RETURNING id AS value',[b]);
    await db.query('INSERT INTO social_comments(citizen_id) VALUES($1)',[b]);
    await db.query('INSERT INTO social_chat_messages(citizen_id) VALUES($1)',[b]);
    await db.query("INSERT INTO social_post_reactions(citizen_id,post_id,reaction_type) VALUES($1,$2,'like')",[b,post]);
    await db.query('INSERT INTO social_follows(follower_citizen_id,following_citizen_id) VALUES($1,$2)',[b,a]);
    await db.query("INSERT INTO citizen_relationships(owner_citizen_id,target_citizen_id,relationship_type) VALUES($1,$2,'friend')",[b,a]);
    await db.query('INSERT INTO messages(sender_citizen_id) VALUES($1)',[b]);
    await db.query('INSERT INTO poll_votes(citizen_id,poll_id) VALUES($1,$2)',[b,post]);
    await db.query("INSERT INTO store_purchases(citizen_id,idempotency_key) VALUES($1,'purchase-1')",[b]);
    await db.query("INSERT INTO lucky7_transaction_history(citizen_id,idempotency_key) VALUES($1,'round-1')",[b]);
    await db.query("INSERT INTO moneytree_clock_in_claims(citizen_id,window_start) VALUES($1,'2026-01-01T00:00:00Z')",[b]);
    const submission=await value('INSERT INTO moneytree_contributions(citizen_id) VALUES($1) RETURNING id AS value',[b]);
    assert.equal(await xp(b),'11');
    await db.query("UPDATE moneytree_contributions SET moderation_state='approved' WHERE id=$1",[submission]);
    assert.equal(await xp(b),'12');assert.equal(await balance(b),50);
    assert.equal(await value('SELECT count(DISTINCT activity_key)::integer AS value FROM citizen_xp_ledger WHERE citizen_id=$1',[b]),12);
    assert.equal(await value("SELECT count(*)::integer AS value FROM realtime.signals WHERE event='xp_changed' AND private AND topic=$1",['citizen-balance:'+ub]),12);
    assert.equal(await value("SELECT bool_and((payload->>'balance_changed')::boolean=false) AS value FROM realtime.signals"),true);
  });
  await t.test('edits, reads, re-approval, re-following, re-associating and repeat reactions cannot farm XP',async()=>{
    await db.query("UPDATE moneytree_contributions SET moderation_state='rejected' WHERE citizen_id=$1",[b]);
    await db.query("UPDATE moneytree_contributions SET moderation_state='approved',content='edited' WHERE citizen_id=$1",[b]);
    await db.query("UPDATE social_posts SET content='edited' WHERE citizen_id=$1",[b]);
    await db.query('UPDATE messages SET read_at=now() WHERE sender_citizen_id=$1',[b]);
    await db.exec(`INSERT INTO social_post_reactions(citizen_id,post_id,reaction_type) SELECT citizen_id,post_id,reaction_type FROM social_post_reactions;
      DELETE FROM social_follows;INSERT INTO social_follows(follower_citizen_id,following_citizen_id) VALUES('${b}','${a}');
      DELETE FROM citizen_relationships;INSERT INTO citizen_relationships(owner_citizen_id,target_citizen_id,relationship_type) VALUES('${b}','${a}','enemy');
      INSERT INTO poll_votes(citizen_id,poll_id) SELECT citizen_id,poll_id FROM poll_votes;
      INSERT INTO store_purchases(citizen_id,idempotency_key) VALUES('${b}','purchase-1');
      INSERT INTO lucky7_transaction_history(citizen_id,idempotency_key) VALUES('${b}','round-1');
      INSERT INTO moneytree_clock_in_claims(citizen_id,window_start) VALUES('${b}','2026-01-01T01:00:00+01:00');`);
    assert.equal(await xp(b),'12');
    await db.query("UPDATE xp_activity_rules SET enabled=false WHERE activity_key='social_post'");
    await db.query('INSERT INTO social_posts(citizen_id) VALUES($1)',[b]);assert.equal(await xp(b),'12');
    await db.query("UPDATE xp_activity_rules SET enabled=true WHERE activity_key='social_post'");
  });
  await t.test('100 XP pays $100 once; a single award can pay multiple distinct levels',async()=>{
    await db.exec("INSERT INTO xp_activity_rules VALUES('fixture',99,true)");await award(a,'setup');
    assert.equal(await balance(a),50);
    await db.query('INSERT INTO social_posts(citizen_id) VALUES($1)',[a]);
    assert.equal(await xp(a),'100');assert.equal(await balance(a),150);
    assert.equal(await value("SELECT citizen_level_state($1)->>'level' AS value",[a]),'2');
    await db.exec("UPDATE xp_activity_rules SET xp_amount=200 WHERE activity_key='fixture'");
    await award(a,'multi');assert.equal(await xp(a),'300');assert.equal(await balance(a),350);
    await award(a,'multi');assert.equal(await balance(a),350);
    assert.deepEqual((await db.query('SELECT level,amount::integer FROM citizen_level_rewards WHERE citizen_id=$1 ORDER BY level',[a])).rows,
      [{level:2,amount:100},{level:3,amount:100},{level:4,amount:100}]);
    assert.equal(await value("SELECT count(*)::integer AS value FROM game_notifications WHERE recipient_id=$1 AND event_key LIKE 'level-reward:%'",[a]),2);
  });
  await t.test('a previously paid level cannot pay again after a curve change',async()=>{
    await db.exec("UPDATE xp_level_config SET xp_per_level=200;UPDATE xp_activity_rules SET xp_amount=100 WHERE activity_key='fixture'");
    await award(a,'relevel');assert.equal(await xp(a),'400');assert.equal(await balance(a),350);
    await db.exec('UPDATE xp_level_config SET xp_per_level=100');
  });
  await t.test('end-of-transaction rewards survive later wallet settlement; failed credit rolls everything back',async()=>{
    await db.exec("UPDATE xp_activity_rules SET xp_amount=88 WHERE activity_key='fixture'");await award(b,'to-boundary');
    assert.equal(await xp(b),'100');assert.equal(await balance(b),150);
    await db.exec("UPDATE xp_activity_rules SET xp_amount=99 WHERE activity_key='fixture'");await award(b,'next-boundary');
    await db.exec(`BEGIN; INSERT INTO store_purchases(citizen_id,idempotency_key) VALUES('${b}','settlement');
      SELECT set_config('app.store_purchase_authorized','on',true);
      UPDATE citizen_private SET balance=125 WHERE citizen_id='${b}';
      SELECT set_config('app.store_purchase_authorized','off',true); COMMIT;`);
    assert.equal(await xp(b),'200');assert.equal(await balance(b),225,'Level cash must add to the settled wallet, not get overwritten');
    await db.exec('ALTER TABLE citizen_private ADD CONSTRAINT fixture_balance_limit CHECK(balance<=350)');
    await db.exec("UPDATE xp_activity_rules SET xp_amount=200 WHERE activity_key='fixture'");
    await assert.rejects(award(b,'failed-credit'),e=>e.code==='23514');
    assert.equal(await xp(b),'200');assert.equal(await balance(b),225);
    assert.equal(await value("SELECT count(*)::integer AS value FROM citizen_xp_ledger WHERE event_key='failed-credit'"),0);
    await db.exec('ALTER TABLE citizen_private DROP CONSTRAINT fixture_balance_limit');
  });
  await t.test('player roles cannot claim rewards or forge XP, even by setting the authorization flag',async()=>{
    for(const role of ['anon','authenticated']){
      assert.equal(await value("SELECT has_table_privilege($1,'citizen_level_rewards','INSERT,UPDATE,DELETE,SELECT') AS value",[role]),false);
      assert.equal(await value("SELECT has_function_privilege($1,'award_citizen_xp(uuid,text,text)','EXECUTE') AS value",[role]),false);
      for(const signature of ['finish_citizen_xp_event()','capture_activity_xp()'])assert.equal(await value('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS value',[role,signature]),false);
    }
    await db.exec('GRANT SELECT,UPDATE ON citizen_private TO authenticated;SET ROLE authenticated');
    try{
      await db.exec("SELECT set_config('app.level_reward_credit','on',false)");
      await assert.rejects(db.exec('UPDATE citizen_private SET balance=9999'),/Balance cannot be changed/);
    }finally{await db.exec("RESET ROLE;SELECT set_config('app.level_reward_credit','off',false);REVOKE SELECT,UPDATE ON citizen_private FROM authenticated");}
    assert.equal(await balance(b),225);
  });
  await t.test('MoneyTree rate update awards 5 XP only on new approvals and preserves prior awards',async()=>{
    const beforeXp=await xp(b),beforeBalance=await balance(b);
    const beforeCount=await value('SELECT count(*)::integer AS value FROM citizen_xp_ledger');
    await db.exec(read('20261130000046_moneytree_five_xp.sql'));
    assert.equal(await xp(b),beforeXp);assert.equal(await balance(b),beforeBalance);
    assert.equal(await value('SELECT count(*)::integer AS value FROM citizen_xp_ledger'),beforeCount);
    assert.equal(await value("SELECT xp_amount::integer AS value FROM xp_activity_rules WHERE activity_key='moneytree_approved'"),5);
    assert.equal(await value("SELECT bool_and(xp_amount=1 AND enabled) AS value FROM xp_activity_rules WHERE activity_key NOT IN ('moneytree_approved','fixture')"),true);
    const submission=await value('INSERT INTO moneytree_contributions(citizen_id) VALUES($1) RETURNING id AS value',[b]);
    assert.equal(await xp(b),'200');
    await db.query("UPDATE moneytree_contributions SET moderation_state='approved' WHERE id=$1",[submission]);
    assert.equal(await xp(b),'205');assert.equal(await balance(b),225);
    // Even the old 1-XP submission cannot be topped up through re-approval.
    await db.query("UPDATE moneytree_contributions SET moderation_state='rejected' WHERE citizen_id=$1",[b]);
    await db.query("UPDATE moneytree_contributions SET moderation_state='approved' WHERE citizen_id=$1",[b]);
    assert.equal(await xp(b),'205');
    assert.equal(await value("SELECT count(*)::integer AS value FROM citizen_xp_ledger WHERE activity_key='moneytree_approved' AND amount=1"),1);
    await db.exec("UPDATE xp_activity_rules SET xp_amount=91 WHERE activity_key='fixture'");await award(b,'near-moneytree-level');
    assert.equal(await xp(b),'296');
    await db.query("INSERT INTO moneytree_contributions(citizen_id,moderation_state) VALUES($1,'approved')",[b]);
    assert.equal(await xp(b),'301');assert.equal(await balance(b),325);
    assert.equal(await value("SELECT citizen_level_state($1)->>'level' AS value",[b]),'4');
    await db.query('INSERT INTO social_posts(citizen_id) VALUES($1)',[b]);assert.equal(await xp(b),'302');
  });
});
