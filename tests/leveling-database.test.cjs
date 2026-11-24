const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261130000044_citizen_leveling.sql'),'utf8');
const audit=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261130000043_world_activity.sql'),'utf8');
const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
const ua='10000000-0000-0000-0000-000000000001',ub='10000000-0000-0000-0000-000000000002';
test('isolated PostgreSQL migration, access rules and future leveling behavior',async t=>{
  const db=await PGlite.create();t.after(()=>db.close());
  // Minimal existing citizen/auth contract, with Supabase-like default grants.
  // No production credentials, data, network calls or Docker are used.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
    CREATE TABLE public.citizens(id uuid PRIMARY KEY,auth_user_id uuid UNIQUE NOT NULL,public_name text NOT NULL);
    CREATE TABLE public.citizen_private(citizen_id uuid PRIMARY KEY REFERENCES public.citizens(id) ON DELETE CASCADE,balance numeric DEFAULT 0);
    GRANT INSERT ON public.citizens TO service_role;
    INSERT INTO public.citizens VALUES('${a}','${ua}','Existing Citizen');
    INSERT INTO public.citizen_private VALUES('${a}',42);
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;`);
  // Use the real existing audit tables and trigger function; unrelated world
  // tables and the owner feed endpoint are not needed for this isolated test.
  await db.exec(audit.slice(0,audit.indexOf('CREATE FUNCTION public.get_world_activity'))+'COMMIT;');
  await db.exec(migration);
  const value=async(sql,params=[])=>(await db.query(sql,params)).rows[0].value;
  const asRole=async(role,sql,params=[])=>{
    await db.exec(`SET ROLE ${role}`);
    try{return await db.query(sql,params);}finally{await db.exec('RESET ROLE');}
  };
  const rejected=async(role,sql,params=[],code='42501')=>assert.rejects(asRole(role,sql,params),e=>e.code===code);
  await t.test('existing and newly created citizens initialize with no grants or game changes',async()=>{
    await asRole('service_role','INSERT INTO public.citizens VALUES($1,$2,$3)',[b,ub,'New Citizen']);
    const rows=(await db.query('SELECT total_xp::text FROM public.citizen_xp ORDER BY citizen_id')).rows;
    assert.deepEqual(rows,[{total_xp:'0'},{total_xp:'0'}]);
    for(const table of ['xp_activity_rules','xp_level_milestones','citizen_xp_ledger'])assert.equal(await value(`SELECT count(*)::integer AS value FROM public.${table}`),0);
    assert.equal(await value('SELECT balance::integer AS value FROM public.citizen_private'),42);
    assert.equal(await value('SELECT count(*)::integer AS value FROM public.world_activity'),0,'Initialization must not create fake earned XP events');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[ua]);
    const result=await asRole('authenticated','SELECT public.get_my_level_progress() AS value');
    assert.equal(result.rows[0].value.level,1);assert.equal(result.rows[0].value.total_xp,'0');assert.equal(result.rows[0].value.next_level,null);
  });
  await t.test('browser roles cannot edit XP, configuration or ledger, or call private helpers',async()=>{
    for(const role of ['anon','authenticated']){
      for(const table of ['citizen_xp','citizen_xp_ledger','xp_level_config','xp_activity_rules','xp_level_milestones']){
        await rejected(role,`SELECT * FROM public.${table}`);
        await rejected(role,`DELETE FROM public.${table}`);
        assert.equal(await value(`SELECT has_table_privilege($1,'public.${table}','INSERT,UPDATE,TRUNCATE') AS value`,[role]),false);
      }
      await rejected(role,'UPDATE public.citizen_xp SET total_xp=500');
      await rejected(role,'SELECT public.award_citizen_xp($1,$2,$3)',[a,'fixture','forged']);
      await rejected(role,'SELECT public.citizen_level_state($1)',[b]);
    }
    await rejected('anon','SELECT public.get_my_level_progress()');
    await db.exec("SELECT set_config('request.jwt.claim.sub','',false)");
    await rejected('authenticated','SELECT public.get_my_level_progress()');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[ub]);
    assert.equal((await asRole('authenticated','SELECT public.get_my_level_progress() AS value')).rows[0].value.citizen_id,b);
    await rejected('service_role','UPDATE public.citizen_xp SET total_xp=500');
  });
  await t.test('no XP is awarded until an explicit rule is configured and enabled',async()=>{
    await rejected('service_role','SELECT public.award_citizen_xp($1,$2,$3)',[a,'fixture','event-0'],'22023');
    await asRole('service_role',"INSERT INTO public.xp_activity_rules(activity_key) VALUES('fixture')");
    await rejected('service_role','SELECT public.award_citizen_xp($1,$2,$3)',[a,'fixture','event-0'],'22023');
    await rejected('service_role',"UPDATE public.xp_activity_rules SET enabled=true WHERE activity_key='fixture'",[],'23514');
    await rejected('service_role',"UPDATE public.xp_activity_rules SET xp_amount=0 WHERE activity_key='fixture'",[],'23514');
    assert.equal(await value('SELECT total_xp::text AS value FROM public.citizen_xp WHERE citizen_id=$1',[a]),'0');
  });
  await t.test('curve validation rejects missing, descending, duplicate and invalid thresholds',async()=>{
    for(const curve of ['{}','{1}','{0,0}','{0,-1}','{0,100,50}','{0,NULL}','{{0,1},{2,3}}']){
      await rejected('service_role','UPDATE public.xp_level_config SET thresholds=$1::bigint[]',[curve],'23514');
    }
    await asRole('service_role',"UPDATE public.xp_level_config SET thresholds='{0,100,250,500}'");
  });
  await t.test('test-only awards cross exact and multiple levels, deduplicate retries, and preserve money',async()=>{
    // These values exist only in this disposable test database, never in seeds.
    await asRole('service_role',"UPDATE public.xp_activity_rules SET xp_amount=100,enabled=true WHERE activity_key='fixture'");
    const first=(await asRole('service_role','SELECT public.award_citizen_xp($1,$2,$3) AS value',[a,'fixture','event-1'])).rows[0].value;
    assert.equal(first.progress.level,2);assert.equal(first.progress.total_xp,'100');assert.equal(first.progress.progress_percent,0);
    await asRole('service_role',"UPDATE public.xp_activity_rules SET xp_amount=25 WHERE activity_key='fixture'");
    const retry=(await asRole('service_role','SELECT public.award_citizen_xp($1,$2,$3) AS value',[a,'fixture','event-1'])).rows[0].value;
    assert.equal(retry.duplicate,true);assert.equal(retry.awarded_xp,'100');assert.equal(retry.progress.total_xp,'100');
    const partial=(await asRole('service_role','SELECT public.award_citizen_xp($1,$2,$3) AS value',[a,'fixture','event-2'])).rows[0].value;
    assert.equal(partial.progress.xp_into_level,'25');assert.equal(partial.progress.xp_for_next_level,'150');assert.equal(partial.progress.progress_percent,16.67);
    await asRole('service_role',"UPDATE public.xp_activity_rules SET xp_amount=500 WHERE activity_key='fixture'");
    const jumped=(await asRole('service_role','SELECT public.award_citizen_xp($1,$2,$3) AS value',[a,'fixture','event-3'])).rows[0].value;
    assert.equal(jumped.progress.level,4);assert.equal(jumped.progress.total_xp,'625');assert.equal(jumped.progress.next_level,null);
    assert.equal(await value('SELECT count(*)::integer AS value FROM public.citizen_xp_ledger'),3);
    assert.equal(await value("SELECT count(*)::integer AS value FROM public.world_activity WHERE entity_type='citizen_xp'"),3);
    assert.equal(await value("SELECT (details->'after'->>'total_xp')::text AS value FROM public.world_activity WHERE entity_type='citizen_xp' ORDER BY id DESC LIMIT 1"),'625');
    assert.equal(await value('SELECT balance::integer AS value FROM public.citizen_private'),42);
    assert.equal(await value('SELECT count(*)::integer AS value FROM public.xp_level_milestones'),0);
  });
  await t.test('disabled rule still permits safe replay; failures roll back and integers never lose precision',async()=>{
    await asRole('service_role',"UPDATE public.xp_activity_rules SET enabled=false WHERE activity_key='fixture'");
    assert.equal((await asRole('service_role','SELECT public.award_citizen_xp($1,$2,$3) AS value',[a,'fixture','event-1'])).rows[0].value.duplicate,true);
    await rejected('service_role','SELECT public.award_citizen_xp($1,$2,$3)',[a,'fixture','event-4'],'22023');
    await asRole('service_role',"UPDATE public.xp_activity_rules SET xp_amount=9007199254740993,enabled=true WHERE activity_key='fixture'");
    const large=(await asRole('service_role','SELECT public.award_citizen_xp($1,$2,$3) AS value',[b,'fixture','large'])).rows[0].value;
    assert.equal(large.progress.total_xp,'9007199254740993');
    await asRole('service_role',"UPDATE public.xp_activity_rules SET xp_amount=9223372036854775807 WHERE activity_key='fixture'");
    await rejected('service_role','SELECT public.award_citizen_xp($1,$2,$3)',[b,'fixture','overflow'],'22003');
    assert.equal(await value('SELECT total_xp::text AS value FROM public.citizen_xp WHERE citizen_id=$1',[b]),'9007199254740993');
    assert.equal(await value("SELECT count(*)::integer AS value FROM public.citizen_xp_ledger WHERE event_key='overflow'"),0);
  });
  await t.test('citizen deletion cascades personal XP and history without blocking existing deletion',async()=>{
    await db.query('DELETE FROM public.citizens WHERE id=$1',[b]);
    assert.equal(await value('SELECT count(*)::integer AS value FROM public.citizen_xp WHERE citizen_id=$1',[b]),0);
    assert.equal(await value('SELECT count(*)::integer AS value FROM public.citizen_xp_ledger WHERE citizen_id=$1',[b]),0);
  });
});
