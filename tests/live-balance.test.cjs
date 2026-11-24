const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'live-balance.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(refresh = async () => 100) {
  const events = {}, channels = [], calls = [], removed = [], intervals = new Map(), timeouts = new Map();
  let timerId = 0, badges = 0;
  const context = {
    console, document: { hidden: false, addEventListener: (name, fn) => { events[name] = fn; } },
    navigator: { onLine: true }, addEventListener: (name, fn) => { events[name] = fn; },
    setInterval: (fn, delay) => { const id=++timerId; intervals.set(id,{fn,delay}); return id; },
    clearInterval: id => intervals.delete(id),
    setTimeout: (fn, delay) => { const id=++timerId; timeouts.set(id,{fn,delay}); return id; },
    clearTimeout: id => timeouts.delete(id),
    refreshCitizenBalanceFromSupabase: id => { calls.push(id); return refresh(id); },
    TyrannyNotifications: { refreshBadge: () => { badges++; } },
    getAuthClient: () => ({
      channel(topic, options) {
        const channel = { topic, options, listeners: {}, on(type, filter, fn) { this.listeners[filter.event]=fn; if(filter.event==='balance_changed')this.receive=fn; return this; }, subscribe(fn) { this.status=fn; return this; } };
        channels.push(channel); return channel;
      },
      removeChannel: channel => { removed.push(channel); return Promise.resolve(); },
    }),
  };
  context.window=context;
  vm.createContext(context); vm.runInContext(source,context);
  return { context, api:context.TyrannyLiveBalance, events, channels, calls, removed, intervals, timeouts, badges:()=>badges };
}
const citizen = { id:'citizen-a', auth_user_id:'user-a' };

test('XP events refresh progress on the existing private channel, and money only on a level reward', async () => {
  const f=fixture();let xp=0;
  f.context.TyrannyLeveling={invalidate:()=>xp++,refresh:()=>xp++};
  f.api.start(citizen);const receive=f.channels[0].listeners.xp_changed;
  receive({payload:{balance_changed:false}});await tick();assert.equal(xp,1);assert.equal(f.calls.length,0);
  receive({payload:{balance_changed:true}});await tick();assert.equal(xp,2);assert.equal(f.calls.length,1);assert.equal(f.badges(),1);
  assert.equal(f.channels.length,1);f.api.stop();receive({payload:{balance_changed:true}});await tick();assert.equal(xp,2);
});

test('creator alerts reuse the connection without fetching the balance', async () => {
  const f=fixture(); let alerts=0;
  f.context.TyrannyCreatorNotifications={refresh:()=>{alerts++;}};
  f.api.start(citizen); f.channels[0].listeners.creator_notification(); await tick();
  assert.equal(alerts,1); assert.equal(f.calls.length,0); assert.equal(f.channels.length,1);
});

test('credits immediately refresh a private recipient channel without idle polling', async () => {
  const f=fixture(); f.api.start(citizen); f.api.start(citizen);
  assert.equal(f.channels.length,1); const channel=f.channels[0];
  assert.equal(channel.topic,'citizen-balance:user-a'); assert.equal(channel.options.config.private,true);
  channel.status('SUBSCRIBED'); await tick(); assert.equal(f.calls.length,1);
  channel.receive({ payload:{balance:999999} }); await tick();
  assert.equal(f.calls.length,2); assert.equal(f.calls[1],citizen.id); assert.equal(f.badges(),1);
  assert.equal(f.intervals.size,0); assert.equal(f.timeouts.size,0);
});
test('rapid credits coalesce with a final catch-up request', async () => {
  const resolvers=[]; const f=fixture(()=>new Promise(resolve=>resolvers.push(resolve)));
  f.api.start(citizen); f.channels[0].status('SUBSCRIBED'); await tick();
  f.channels[0].receive(); f.channels[0].receive(); f.channels[0].receive();
  assert.equal(f.calls.length,1); resolvers.shift()(100); await tick();
  assert.equal(f.calls.length,2); resolvers.shift()(150); await tick(); assert.equal(f.calls.length,2);
});
test('hidden and offline apps disconnect and catch up when available', async () => {
  const f=fixture(); f.api.start(citizen); const old=f.channels[0];
  f.context.document.hidden=true; f.events.visibilitychange(); old.receive(); await tick();
  assert.equal(f.calls.length,0); assert.equal(f.removed.length,1);
  f.context.document.hidden=false; f.events.visibilitychange(); f.channels[1].status('SUBSCRIBED'); await tick();
  assert.equal(f.calls.length,1);
  f.context.navigator.onLine=false; f.events.offline();
  f.context.navigator.onLine=true; f.events.online(); f.channels[2].status('SUBSCRIBED'); await tick();
  assert.equal(f.calls.length,2);
});
test('connection failure polls slowly and stops polling after reconnect', async () => {
  const f=fixture(); f.api.start(citizen); f.channels[0].status('CHANNEL_ERROR'); await tick();
  assert.equal(f.intervals.size,1); assert.equal([...f.intervals.values()][0].delay,60000);
  f.channels[0].status('SUBSCRIBED'); await tick(); assert.equal(f.intervals.size,0);
});
test('failed profile reads retry, and sign-out cancels all pending work', async () => {
  const f=fixture(async()=>null); f.api.start(citizen); f.channels[0].receive(); await tick();
  assert.equal([...f.timeouts.values()][0].delay,2000);
  f.api.stop(); assert.equal(f.timeouts.size,0); f.channels[0].receive(); await tick(); assert.equal(f.calls.length,1);
});
test('old account callbacks cannot refresh the new account', async () => {
  const f=fixture(); f.api.start(citizen); const old=f.channels[0];
  f.api.start({id:'citizen-b',auth_user_id:'user-b'}); old.status('SUBSCRIBED'); old.receive(); await tick();
  assert.equal(f.calls.length,0); f.channels[1].receive(); await tick(); assert.deepEqual(f.calls,['citizen-b']);
});

const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const refreshSource=app.slice(app.indexOf('let currentBalanceVersion = 0;'),app.indexOf('function renderAppGrid()'));
test('balance updates every displayed amount in place and rejects stale account responses', async () => {
  let resolve; const nodes=[{textContent:''},{textContent:''},{textContent:''}];
  const context={ console, authBootstrapEpoch:0, profileState:{citizen:{id:'a'},private:{balance:1}}, player:{balance:'$1'},
    formatCurrency:n=>'$'+n, formatLucky7Currency:n=>'$'+n,
    document:{querySelectorAll:()=>nodes}, __moneytreeState:{dashboardData:{available_balance:1}},
    getAuthClient:()=>({functions:{invoke:()=>new Promise(r=>resolve=r)}}),
  };
  context.window=context;vm.createContext(context);vm.runInContext(refreshSource,context);
  const first=context.refreshCitizenBalanceFromSupabase('a');resolve({data:{balance:250}});await first;
  assert.equal(context.profileState.private.balance,250);assert(nodes.every(n=>n.textContent==='$250'));
  assert.equal(context.__moneytreeState.dashboardData.available_balance,250);
  const old=context.refreshCitizenBalanceFromSupabase('a');context.authBootstrapEpoch++;context.profileState.citizen={id:'b'};
  resolve({data:{balance:500}});await old;assert.equal(context.profileState.private.balance,250);
});
