/* A private invalidation signal; balances still come from the signed-in profile API. */
window.TyrannyLiveBalance = (() => {
  let citizen = null;
  let channel = null;
  let generation = 0;
  let pending = null;
  let dirty = false;
  let fallbackTimer = null;
  let retryTimer = null;
  let retryDelay = 2000;
  const available = () => citizen && !document.hidden && navigator.onLine !== false;

  function refresh() {
    if (!available()) return Promise.resolve();
    if (pending) { dirty = true; return pending; }
    const current = generation;
    const id = citizen.id;
    dirty = false;
    clearTimeout(retryTimer); retryTimer = null;
    const request = Promise.resolve().then(() => current === generation && available() ? refreshCitizenBalanceFromSupabase(id) : undefined)
      .then(balance => {
        if (current !== generation) return;
        if (balance === null) {
          retryTimer = setTimeout(() => { retryTimer = null; void refresh(); }, retryDelay);
          retryDelay = Math.min(60000, retryDelay * 2);
        } else retryDelay = 2000;
      })
      .catch(error => console.warn('Live balance refresh failed:', error))
      .finally(() => {
        if (current !== generation) return;
        pending = null;
        if (dirty) void refresh();
      });
    pending = request;
    return request;
  }

  function disconnect() {
    generation++;
    pending = null;
    dirty = false;
    clearInterval(fallbackTimer); fallbackTimer = null;
    clearTimeout(retryTimer); retryTimer = null; retryDelay = 2000;
    const previous = channel;
    channel = null;
    if (previous) void getAuthClient()?.removeChannel(previous);
  }

  function connect() {
    if (!available() || channel) return;
    const client = getAuthClient();
    if (!client) return;
    const current = generation;
    channel = client.channel(`citizen-balance:${citizen.auth_user_id}`, { config: { private: true } });
    channel.on('broadcast', { event: 'balance_changed' }, () => {
      if (current !== generation) return;
      void refresh();
      void window.TyrannyNotifications?.refreshBadge();
    }).on('broadcast', { event: 'creator_notification' }, () => {
      if (current !== generation) return;
      void window.TyrannyCreatorNotifications?.refresh();
    }).on('broadcast', { event: 'xp_changed' }, message => {
      if (current !== generation) return;
      void window.TyrannyLeveling?.invalidate();
      if (message?.payload?.balance_changed === true) {
        void refresh();
        void window.TyrannyNotifications?.refreshBadge();
      }
    }).subscribe(status => {
      if (current !== generation) return;
      if (status === 'SUBSCRIBED') {
        clearInterval(fallbackTimer); fallbackTimer = null;
        // Covers credits made during initial loading, disconnection, or sleep.
        void refresh();
        void window.TyrannyCreatorNotifications?.refresh();
        void window.TyrannyLeveling?.refresh();
      } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status) && !fallbackTimer) {
        void refresh();
        void window.TyrannyLeveling?.refresh();
        fallbackTimer = setInterval(() => { void refresh(); void window.TyrannyLeveling?.refresh(); }, 60000);
      }
    });
  }

  function start(nextCitizen) {
    if (!nextCitizen?.id || !nextCitizen?.auth_user_id) { stop(); return; }
    if (citizen?.id !== nextCitizen.id || citizen?.auth_user_id !== nextCitizen.auth_user_id) disconnect();
    citizen = { id: nextCitizen.id, auth_user_id: nextCitizen.auth_user_id };
    connect();
  }
  function stop() { citizen = null; disconnect(); }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) disconnect();
    else connect();
  });
  window.addEventListener('offline', disconnect);
  window.addEventListener('online', () => { disconnect(); connect(); });
  return { start, stop };
})();
