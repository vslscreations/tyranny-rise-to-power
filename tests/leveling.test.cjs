const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../leveling.js'),'utf8');
const payload=(id='citizen-a',overrides={})=>({citizen_id:id,level:1,total_xp:'0',xp_into_level:'0',next_level:null,xp_for_next_level:null,xp_remaining:null,progress_percent:0,...overrides});
function fixture(rpc=async()=>({data:payload()})){
  const nodes=Object.fromEntries(['playerLevel','playerXpTotal','playerXpProgress','playerXpHint','profileWidget'].map(id=>[id,{textContent:'',value:0,attributes:{},setAttribute(key,value){this.attributes[key]=value;}}]));
  const calls=[];
  const context={window:{},document:{getElementById:id=>nodes[id]},getAuthClient:()=>({rpc:(...args)=>{calls.push(args);return rpc(...args);}})};
  vm.runInNewContext(source,context);
  return {api:context.window.TyrannyLeveling,nodes,calls,context};
}
test('server-confirmed Level 1, 0 XP and unset next level render without invented thresholds',async()=>{
  const {api,nodes,calls}=fixture();await api.start('citizen-a');
  assert.equal(nodes.playerLevel.textContent,'Level 1');assert.equal(nodes.playerXpTotal.textContent,'0 XP');
  assert.equal(nodes.playerXpProgress.value,0);assert.equal(nodes.playerXpHint.textContent,'Next level coming soon');
  assert.match(nodes.profileWidget.attributes['aria-label'],/Level 1, 0 total XP/);
  assert.deepEqual(calls,[['get_my_level_progress']]);
  await api.start('citizen-a');assert.equal(calls.length,1,'Repeated profile renders must not reload XP');
});
test('configured progress and large XP totals retain integer precision',async()=>{
  const {api,nodes}=fixture(async()=>({data:payload('citizen-a',{level:5,total_xp:'9007199254740993',xp_into_level:'25',next_level:6,xp_for_next_level:'100',xp_remaining:'75',progress_percent:25})}));
  await api.start('citizen-a');assert.equal(nodes.playerXpProgress.value,25);
  assert.match(nodes.playerXpTotal.textContent,/9,007,199,254,740,993/);
  assert.equal(nodes.playerXpHint.textContent,'25 / 100 XP to Level 6');
});
test('the next-level cash offer comes from server configuration',async()=>{
  const {api,nodes}=fixture(async()=>({data:payload('citizen-a',{next_level:2,xp_for_next_level:'100',xp_remaining:'100',next_level_reward_amount:'100'})}));
  await api.start('citizen-a');assert.equal(nodes.playerXpHint.textContent,'0 / 100 XP to Level 2 · $100 level-up reward');
});
test('overlapping refreshes share one request; switching accounts drops stale responses',async()=>{
  const waiting=[];const {api,nodes,calls}=fixture(()=>new Promise(resolve=>waiting.push(resolve)));
  const first=api.start('citizen-a');await Promise.resolve();const same=api.refresh();
  assert.equal(first,same);assert.equal(calls.length,1);
  const second=api.start('citizen-b');await Promise.resolve();
  waiting[1]({data:payload('citizen-b',{level:2,total_xp:'100'})});await second;
  waiting[0]({data:payload('citizen-a',{level:99,total_xp:'9999'})});await first;
  assert.equal(nodes.playerLevel.textContent,'Level 2');
});
test('signout clears progress and prevents an in-flight response from restoring it',async()=>{
  let resolve;const {api,nodes}=fixture(()=>new Promise(r=>resolve=r));
  const pending=api.start('citizen-a');await Promise.resolve();api.reset();
  resolve({data:payload()});await pending;assert.equal(nodes.playerLevel.textContent,'Level —');
  assert.equal(nodes.playerXpTotal.textContent,'— XP');
});
test('XP earned during a progress fetch triggers one catch-up read',async()=>{
  const waiting=[];const {api,nodes,calls}=fixture(()=>new Promise(resolve=>waiting.push(resolve)));
  const first=api.start('citizen-a');await Promise.resolve();api.invalidate();api.invalidate();
  waiting.shift()({data:payload()});await first;await Promise.resolve();
  assert.equal(calls.length,2);
  waiting.shift()({data:payload('citizen-a',{total_xp:'2',xp_into_level:'2',next_level:2,xp_for_next_level:'100',xp_remaining:'98',progress_percent:2})});
  await api.refresh();assert.equal(nodes.playerXpTotal.textContent,'2 XP');
});
test('backend absence, sync failures and invalid responses never fabricate zero XP and can retry',async()=>{
  let mode='throw';const {api,nodes,calls}=fixture(()=>{
    if(mode==='throw')throw Error('Client not ready');
    if(mode==='missing')return {error:{code:'PGRST202'}};
    if(mode==='wrong')return {data:payload('another-citizen')};
    if(mode==='invalid')return {data:payload('citizen-a',{total_xp:'<script>'})};
    return {data:payload()};
  });
  for(mode of ['throw','missing','wrong','invalid']){
    await api.start('citizen-a');assert.equal(nodes.playerLevel.textContent,'Level —');assert.equal(nodes.playerXpTotal.textContent,'XP unavailable');
  }
  mode='ready';await api.start('citizen-a');assert.equal(nodes.playerLevel.textContent,'Level 1');assert.equal(calls.length,5);
});
