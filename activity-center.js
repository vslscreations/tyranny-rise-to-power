/* Owner-only, cursor-paged audit history. No requests while the tool is closed. */
window.TyrannyActivityCenter = (() => {
  const categories = {citizens:'Citizens',moneytree:'MoneyTree',social:'Social',messages:'Messages',economy:'Money & accounts',store:'Store & assets',casino:'Casino',politics:'Voting',news:'News',administration:'Administration',notifications:'Notifications'};
  const state = { filters:{category:'',query:'',range:'24'}, before:null, previous:[], items:[], next:null, more:false, loading:false, error:'', denied:false, started:null, refreshed:null, live:false };
  let host=null, generation=0, timer=null, sequence=0, since=null;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label=value=>String(value).replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
  const date=value=>value ? new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'}) : '—';
  const valueText=value=>value===null ? 'None' : typeof value==='object' ? JSON.stringify(value) : String(value);

  function details(item) {
    const before=item.details?.before||{},after=item.details?.after||{};
    const fields=[...new Set([...Object.keys(before),...Object.keys(after)])];
    const changes=Array.isArray(item.details?.changed_fields)?item.details.changed_fields:[];
    return `<details class="activity-details"><summary>Event details</summary>
      ${fields.length?`<dl class="activity-values">${fields.map(key=>`<div><dt>${escape(label(key))}</dt><dd>${key in before?`<span>${escape(valueText(before[key]))}</span>`:''}${key in before&&key in after?'<span aria-label="changed to"> → </span>':''}${key in after?`<strong>${escape(valueText(after[key]))}</strong>`:''}</dd></div>`).join('')}</dl>`:'<p>No content or sensitive values are copied into this event.</p>'}
      ${changes.length?`<p>Changed: ${escape(changes.map(label).join(', '))}</p>`:''}
      <p>Event #${escape(item.id)} · Related transaction ${escape(item.transaction_id)}</p>
      ${item.entity_id?`<p>Record ID: <code>${escape(item.entity_id)}</code></p>`:''}
      </details>`;
  }
  function renderResults() {
    if(!host?.isConnected)return;
    const output=host.querySelector('[data-activity-results]');
    host.querySelector('[data-activity-refresh]').disabled=state.loading;
    host.querySelector('[data-activity-apply]').disabled=state.loading;
    host.querySelector('[data-activity-live]').disabled=state.denied;
    const status=host.querySelector('[data-activity-status]');
    status.textContent=state.loading?'Loading activity…':state.denied?'Owner access required':`${state.items.length} events shown${state.refreshed?' · Updated '+date(state.refreshed):''}`;
    host.querySelector('[data-activity-started]').textContent=state.started?'Recording began '+date(state.started)+'. Earlier activity is not reconstructed.':'History begins when activity recording is enabled.';
    host.querySelector('[data-activity-live-note]').textContent=state.live?(state.previous.length?'Live refresh pauses while viewing older activity.':'Latest activity refreshes every 30 seconds while this tool is open.'):'Refresh when needed, or turn on live updates.';
    output.innerHTML=`${state.error?`<div class="notification-error" role="alert">${escape(state.error)}</div>`:''}
      ${!state.loading&&!state.items.length&&!state.error?'<div class="activity-empty"><strong>No matching activity yet</strong><p>New saved actions will appear here. Try a wider time range or clear the filters.</p></div>':''}
      <div class="activity-feed">${state.items.map(item=>`<article class="activity-event">
        <div class="activity-event-meta"><span class="activity-category" data-category="${escape(item.category)}">${escape(categories[item.category]||'World')}</span><time datetime="${escape(item.occurred_at)}">${escape(date(item.occurred_at))}</time></div>
        <h4>${escape(item.summary)}</h4>
        <p class="activity-people"><strong>${escape(item.actor_name)}</strong>${item.subject_name&&item.subject_name!==item.actor_name?` <span>→ ${escape(item.subject_name)}</span>`:''}</p>
        ${details(item)}
      </article>`).join('')}</div>
      <nav class="activity-pagination" aria-label="Activity pages">
        <button type="button" data-activity-newer ${!state.previous.length||state.loading?'disabled':''}>← Newer</button>
        <span>Page ${state.previous.length+1}</span>
        <button type="button" data-activity-older ${!state.more||state.loading?'disabled':''}>Older →</button>
      </nav>`;
  }
  function updateSince() {
    since=state.filters.range==='all'?null:new Date(Date.now()-Number(state.filters.range)*3600000).toISOString();
  }
  async function load() {
    if(!host?.isConnected||state.loading)return;
    const epoch=generation,token=++sequence;
    state.loading=true;state.error='';renderResults();
    try {
      const {data,error}=await getAuthClient().rpc('get_world_activity',{
        p_before_id:state.before,p_category:state.filters.category||null,p_query:state.filters.query||null,p_since:since,p_limit:50
      });
      if(epoch!==generation||token!==sequence)return;
      if(error)throw error;
      state.items=Array.isArray(data?.items)?data.items:[];
      state.next=data?.next_cursor||null;state.more=Boolean(data?.has_more);
      state.started=data?.recording_started_at;state.refreshed=data?.server_time;state.denied=false;
    }catch(error){
      if(epoch!==generation||token!==sequence)return;
      state.denied=error?.code==='42501';
      state.error=state.denied?'Only the project owner can view world activity.':'Activity could not be loaded. Use Refresh to try again.';
      if(state.denied){state.items=[];state.more=false;state.next=null;state.live=false;clearInterval(timer);timer=null;host.querySelector('[data-activity-live]').checked=false;}
    }finally{
      if(epoch===generation&&token===sequence){state.loading=false;renderResults();}
    }
  }
  function latest() {
    if(state.loading)return;
    state.before=null;state.previous=[];updateSince();void load();
  }
  function tick() {
    if(state.live&&!state.previous.length&&!document.hidden&&navigator.onLine!==false&&host?.isConnected)void load();
  }
  function deactivate() {
    generation++;sequence++;state.loading=false;clearInterval(timer);timer=null;host=null;
  }
  function reset() {
    deactivate();Object.assign(state,{filters:{category:'',query:'',range:'24'},before:null,previous:[],items:[],next:null,more:false,error:'',denied:false,started:null,refreshed:null,live:false});
  }
  function mount(element) {
    if(host===element&&host?.isConnected)return;
    deactivate();host=element;if(!host)return;
    state.before=null;state.previous=[];state.items=[];state.next=null;state.more=false;state.error='';state.denied=false;updateSince();
    host.innerHTML=`<section class="activity-center">
      <header class="activity-heading"><div><span class="moderator-panel-kicker">Owner tool · World history</span><h3>Activity Center</h3><p>Follow saved actions across Tyranny.</p></div><button type="button" data-activity-refresh>Refresh</button></header>
      <form class="activity-filters">
        <label class="activity-search">Search<input name="query" type="search" maxlength="120" placeholder="Citizen name, action, or record ID" value="${escape(state.filters.query)}" /></label>
        <label>Area<select name="category"><option value="">All areas</option>${Object.entries(categories).map(([key,name])=>`<option value="${key}" ${key===state.filters.category?'selected':''}>${name}</option>`).join('')}</select></label>
        <label>Time<select name="range">${[['24','Last 24 hours'],['168','Last 7 days'],['720','Last 30 days'],['all','All recorded activity']].map(([key,name])=>`<option value="${key}" ${key===state.filters.range?'selected':''}>${name}</option>`).join('')}</select></label>
        <button type="submit" data-activity-apply>Apply filters</button>
      </form>
      <div class="activity-live"><label><input type="checkbox" data-activity-live ${state.live?'checked':''} /> Live updates</label><span data-activity-live-note></span></div>
      <details class="activity-coverage"><summary>What is recorded?</summary><p>Citizen profiles, MoneyTree, social interactions, message activity, money, purchases, inventory, casino rounds, polls, news, administration, announcements and notification preferences.</p><p>Private messages are recorded as actions without their text. Passwords, device credentials and individual ballot choices are excluded. Page views, typing, failed attempts and sign-in logs are not recorded here.</p><p data-activity-started></p></details>
      <p class="activity-status" data-activity-status role="status"></p><div data-activity-results></div>
    </section>`;
    host.querySelector('form').addEventListener('submit',event=>{
      event.preventDefault();if(state.loading)return;
      const form=event.currentTarget;
      state.filters={query:form.elements.query.value.trim(),category:form.elements.category.value,range:form.elements.range.value};latest();
    });
    host.querySelector('[data-activity-refresh]').addEventListener('click',latest);
    host.querySelector('[data-activity-live]').addEventListener('change',event=>{
      state.live=event.target.checked;renderResults();if(state.live)tick();
    });
    host.querySelector('[data-activity-results]').addEventListener('click',event=>{
      if(state.loading)return;
      if(event.target.closest('[data-activity-older]')&&state.more){state.previous.push(state.before);state.before=state.next;void load();}
      if(event.target.closest('[data-activity-newer]')&&state.previous.length){state.before=state.previous.pop();void load();}
    });
    timer=setInterval(tick,30000);void load();
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
  window.addEventListener('online',tick);
  return {mount,deactivate,reset};
})();
