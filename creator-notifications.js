/* Separate owner inbox; authorization and read state are enforced by server RPCs. */
window.TyrannyCreatorNotifications = (() => {
  const state = { citizenId: null, enabled: false, items: [], unread: 0, hasMore: false, serverTime: null, loading: false, reading: false, error: '' };
  let generation = 0, request = null, dirty = false, timer = null, nextPoll = 0, failures = 0;
  let lastFocus = null;
  const panel = () => document.getElementById('creatorNotificationCenter');
  const button = () => document.getElementById('creatorNotificationToggle');
  const isOpen = () => !panel().classList.contains('hidden');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function render() {
    button().hidden = !state.enabled;
    button().setAttribute('aria-expanded', String(isOpen()));
    button().setAttribute('aria-label', `Creator notifications${state.unread ? ', '+state.unread+' unread' : ''}`);
    const badge = document.getElementById('creatorNotificationBubble');
    badge.hidden = !state.enabled || state.unread === 0;
    badge.textContent = state.unread > 99 ? '99+' : String(state.unread);
    if (!isOpen()) return;
    document.getElementById('creatorNotificationList').innerHTML = `
      <p class="creator-inbox-description">New citizens and incoming MoneyTree submissions. Only your creator account can see this inbox.</p>
      <div class="notification-toolbar">
        <button type="button" data-creator-action="refresh" ${state.loading ? 'disabled' : ''}>Refresh</button>
        <button type="button" data-creator-action="read-all" ${state.loading || state.reading || !state.unread || !state.serverTime ? 'disabled' : ''}>Mark all read</button>
      </div>
      ${state.error ? `<p class="notification-error" role="alert">${escape(state.error)}</p>` : ''}
      ${!state.items.length ? `<p class="notification-empty" role="status">${state.loading ? 'Loading creator notifications…' : 'No creator notifications yet. New activity will appear here.'}</p>` : ''}
      <div class="notification-feed">${state.items.map(item => `
        <article class="notification-item ${item.read_at ? '' : 'unread'}">
          <span class="notification-kind creator" aria-hidden="true">${item.kind === 'citizen' ? '♙' : '▤'}</span>
          <div class="notification-item-content">
            <button type="button" class="notification-open" data-creator-open="${escape(item.id)}" ${state.reading ? 'disabled' : ''}>
              <span class="notification-category">${item.kind === 'citizen' ? 'Citizen registration' : 'MoneyTree submission'}</span>
              <strong>${escape(item.title)}</strong><span>${escape(item.body)}</span>
              <time datetime="${escape(item.created_at)}">${escape(new Date(item.created_at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}</time>
              <span class="creator-inbox-link">${item.kind === 'citizen' ? 'Open Citizen Management' : 'Open Submission Review'} →</span>
            </button>
            ${item.read_at ? '' : `<button type="button" class="notification-read" data-creator-read="${escape(item.id)}" ${state.reading ? 'disabled' : ''}>Mark read</button>`}
          </div>
        </article>`).join('')}</div>
      ${state.hasMore ? `<button type="button" class="notification-more" data-creator-action="more" ${state.loading || state.reading ? 'disabled' : ''}>Load older notifications</button>` : ''}`;
  }

  function refresh(append = false) {
    if (!state.citizenId) return Promise.resolve();
    if (request) { dirty = true; return request; }
    const epoch = generation;
    const full = state.enabled && isOpen();
    state.loading = true; state.error = ''; dirty = false; render();
    const pending = (async () => {
      try {
        const {data,error} = await getAuthClient().rpc(full ? 'get_creator_notifications' : 'get_creator_notification_status', full ? {p_offset:append ? state.items.length : 0} : {});
        if (epoch !== generation) return;
        if (error) throw error;
        if (!full) state.enabled = data?.enabled === true;
        if (!state.enabled) {
          clearInterval(timer); timer = null;
          state.items = []; state.unread = 0; panel().classList.add('hidden');
          document.getElementById('creatorNotificationList').innerHTML = '';
          return;
        }
        if (!timer) timer = setInterval(poll,30000);
        state.unread = Number(data?.unread_count || 0);
        if (full) {
          const items = Array.isArray(data?.items) ? data.items : [];
          state.items = append ? [...new Map([...state.items,...items].map(item=>[item.id,item])).values()] : items;
          state.hasMore = Boolean(data?.has_more); state.serverTime = data?.server_time || null;
        }
        failures = 0; nextPoll = Date.now()+60000;
      } catch (error) {
        if (epoch !== generation) return;
        if (error?.code === '42501') { stop(); return; }
        state.error = 'Creator notifications could not be loaded. Please try again.';
        failures++; nextPoll = Date.now()+Math.min(300000,30000 * 2**failures);
        if (!timer) timer = setInterval(poll,30000);
      } finally {
        if (epoch === generation) {
          request = null; state.loading = false; render();
          if (dirty || (!full && state.enabled && isOpen())) void refresh();
        }
      }
    })();
    request = pending;
    return pending;
  }

  async function markRead(id = null) {
    if (!state.enabled || state.reading) return false;
    const epoch = generation;
    state.reading = true; render();
    try {
      const args = {p_id:id}; if (!id && state.serverTime) args.p_before=state.serverTime;
      const {error} = await getAuthClient().rpc('read_creator_notifications',args);
      if (epoch !== generation) return false;
      if (error) throw error;
      // Let an existing history request finish, then replace it with persisted read state.
      if (request) await request;
      if (epoch !== generation) return false;
      await refresh();
      return epoch === generation;
    } catch {
      if (epoch === generation) { state.error='Read status could not be saved. Please try again.'; render(); }
      return false;
    } finally { if (epoch === generation) { state.reading=false; render(); } }
  }

  function close(restoreFocus = true) {
    const wasOpen=isOpen(); panel().classList.add('hidden'); render();
    if (wasOpen && restoreFocus) lastFocus?.focus({preventScroll:true});
  }
  function toggle() {
    if (!state.enabled) return;
    if (isOpen()) { close(); return; }
    window.TyrannyNotifications?.close();
    lastFocus=button(); panel().classList.remove('hidden'); render();
    document.getElementById('closeCreatorNotifications').focus(); void refresh();
  }
  function stop() {
    generation++; request=null; dirty=false; failures=0; nextPoll=0;
    clearInterval(timer); timer=null;
    Object.assign(state,{citizenId:null,enabled:false,items:[],unread:0,hasMore:false,serverTime:null,loading:false,reading:false,error:''});
    panel().classList.add('hidden'); document.getElementById('creatorNotificationList').innerHTML=''; render();
  }
  function start(id) {
    if (state.citizenId===id) return;
    stop(); if (!id) return;
    state.citizenId=id; void refresh();
  }
  function poll() {
    if (state.citizenId && !document.hidden && navigator.onLine !== false && Date.now()>=nextPoll) void refresh();
  }
  button().addEventListener('click',toggle);
  document.getElementById('closeCreatorNotifications').addEventListener('click',()=>close());
  document.addEventListener('visibilitychange',poll);
  window.addEventListener('online',poll);
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && isOpen())close();});
  panel().addEventListener('click',async event=>{
    const target=event.target instanceof Element ? event.target : null;
    if(!target)return;
    const action=target.closest('[data-creator-action]')?.dataset.creatorAction;
    if(action==='refresh')void refresh();
    if(action==='more')void refresh(true);
    if(action==='read-all')void markRead();
    const readId=target.closest('[data-creator-read]')?.dataset.creatorRead;
    if(readId)void markRead(readId);
    const openId=target.closest('[data-creator-open]')?.dataset.creatorOpen;
    if(openId){
      const item=state.items.find(row=>row.id===openId);
      if(item && await markRead(openId)) { close(false); openCreatorNotificationTarget(item); }
    }
  });
  return {start,stop,refresh,close};
})();
