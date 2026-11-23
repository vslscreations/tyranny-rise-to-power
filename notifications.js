/* In-game inbox. Server RPCs determine recipients and persist read state. */
window.TyrannyNotifications = (() => {
  const state = { citizenId: null, items: [], unread: 0, hasMore: false, unreadOnly: false, loading: false, error: '', token: 0, serverTime: null };
  let timer = null;
  let lastFocus = null;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const panel = () => document.getElementById('notificationCenter');
  const icons = { moneytree: '✦', social: '◌', messages: '✉', account: '◈', world: '◎' };

  function render() {
    const count = state.unread > 99 ? '99+' : String(state.unread);
    for (const badge of document.querySelectorAll('[data-notification-badge], #notificationBubble')) {
      badge.textContent = count;
      badge.hidden = state.unread === 0;
    }
    for (const button of document.querySelectorAll('#notificationToggle')) {
      button.setAttribute('aria-label', state.unread ? `Notifications, ${state.unread} unread` : 'Notifications');
      button.setAttribute('aria-expanded', String(!panel().classList.contains('hidden')));
    }
    const list = document.getElementById('notificationList');
    if (!list) return;
    list.innerHTML = `
      <div class="notification-toolbar">
        <button type="button" data-notice-action="filter" aria-pressed="${state.unreadOnly}">${state.unreadOnly ? 'Unread only' : 'All notifications'}</button>
        <button type="button" data-notice-action="refresh" ${state.loading ? 'disabled' : ''}>Refresh</button>
        <button type="button" data-notice-action="read-all" ${!state.unread || state.loading ? 'disabled' : ''}>Mark all read</button>
      </div>
      ${state.error ? `<p class="notification-error" role="alert">${escape(state.error)}</p>` : ''}
      ${state.loading && !state.items.length ? '<p class="notification-empty" role="status">Loading notifications…</p>' : ''}
      ${!state.loading && !state.error && !state.items.length ? `<div class="notification-empty"><strong>${state.citizenId ? 'You’re all caught up' : 'Sign in to view notifications'}</strong><p>${state.citizenId ? 'Account activity and world announcements will appear here.' : ''}</p></div>` : ''}
      <div class="notification-feed">
        ${state.items.map(item => `<article class="notification-item ${item.read_at ? '' : 'unread'}">
          <span class="notification-kind ${escape(item.category)}" aria-hidden="true">${icons[item.category] || '◈'}</span>
          <div class="notification-item-content">
            <button type="button" class="notification-open" data-notice-open="${escape(item.id)}">
              <span class="notification-category">${escape(item.category === 'world' ? 'World announcement' : item.category)}</span>
              <strong>${escape(item.title)}</strong><span>${escape(item.body)}</span>
              <time datetime="${escape(item.created_at)}">${escape(new Date(item.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</time>
            </button>
            ${item.read_at ? '' : `<button type="button" class="notification-read" data-notice-read="${escape(item.id)}" aria-label="Mark ${escape(item.title)} as read">Mark read</button>`}
          </div>
        </article>`).join('')}
      </div>
      ${state.hasMore ? `<button type="button" class="notification-more" data-notice-action="more" ${state.loading ? 'disabled' : ''}>${state.loading ? 'Loading…' : 'Load older notifications'}</button>` : ''}
    `;
  }

  async function load(append = false) {
    if (!state.citizenId || state.loading) return;
    const token = state.token;
    state.loading = true;
    state.error = '';
    render();
    try {
      const { data, error } = await getAuthClient().rpc('get_game_notifications', {
        p_offset: append ? state.items.length : 0, p_unread_only: state.unreadOnly,
      });
      if (token !== state.token) return;
      if (error) throw error;
      const items = Array.isArray(data?.items) ? data.items : [];
      state.items = append ? [...new Map([...state.items, ...items].map(item => [item.id, item])).values()] : items;
      state.unread = Number(data?.unread_count || 0);
      state.hasMore = Boolean(data?.has_more);
      state.serverTime = data?.server_time || null;
    } catch (error) {
      if (token !== state.token) return;
      state.error = 'Notifications could not be loaded. Please try Refresh.';
      console.warn('Notification inbox failed:', error);
    } finally {
      if (token === state.token) { state.loading = false; render(); }
    }
  }

  async function markRead(id = null) {
    const token = state.token;
    if (!state.citizenId) return false;
    try {
      const args = { p_id: id };
      if (!id && state.serverTime) args.p_before = state.serverTime;
      const { error } = await getAuthClient().rpc('read_game_notifications', args);
      if (token !== state.token) return false;
      if (error) throw error;
      // Invalidate a concurrent read response so it cannot restore an old count.
      state.token++;
      state.loading = false;
      await load();
      return true;
    } catch (error) {
      if (token !== state.token) return false;
      state.error = 'Read status could not be saved. Please try again.';
      render();
      return false;
    }
  }

  function close() {
    panel().classList.add('hidden');
    render();
    lastFocus?.focus({ preventScroll: true });
  }
  function toggle() {
    if (!panel().classList.contains('hidden')) { close(); return; }
    lastFocus = document.activeElement;
    panel().classList.remove('hidden');
    render();
    document.getElementById('closeNotifications').focus();
    void load();
  }
  function stop() {
    clearInterval(timer); timer = null;
    state.token++;
    Object.assign(state, { citizenId: null, items: [], unread: 0, hasMore: false, loading: false, error: '', unreadOnly: false });
    panel()?.classList.add('hidden');
    render();
  }
  function start(citizenId) {
    if (!citizenId) { stop(); return; }
    if (state.citizenId !== citizenId) stop();
    state.citizenId = citizenId;
    if (!timer) {
      void load();
      timer = setInterval(() => { if (!document.hidden) void load(); }, 30000);
    }
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) void load(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel().classList.contains('hidden')) close();
  });
  document.addEventListener('click', async event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const action = target.closest('[data-notice-action]')?.dataset.noticeAction;
    if (action === 'refresh') void load();
    if (action === 'more') void load(true);
    if (action === 'read-all') void markRead();
    if (action === 'filter' && !state.loading) {
      state.unreadOnly = !state.unreadOnly; state.items = []; void load();
    }
    const readId = target.closest('[data-notice-read]')?.dataset.noticeRead;
    if (readId) void markRead(readId);
    const openId = target.closest('[data-notice-open]')?.dataset.noticeOpen;
    if (openId) {
      const item = state.items.find(row => row.id === openId);
      if (item && await markRead(openId)) {
        if (item.target === 'announcement') return;
        close();
        try { await openGameNotificationTarget(item); }
        catch (error) { state.error = 'The linked content is unavailable. It may have been removed.'; panel().classList.remove('hidden'); render(); }
      }
    }
  });
  return { start, stop, render, toggle, close, refresh: load };
})();
