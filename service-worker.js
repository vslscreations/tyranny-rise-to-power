/* Push only: no caching of authenticated pages, responses, or account data. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let id = '';
  try { id = String(event.data?.json()?.id || ''); } catch { /* Generic fallback. */ }
  event.waitUntil(self.registration.showNotification('Tyranny: Rise to Power', {
    body: 'You have new activity. Open your notification inbox to see it.',
    icon: new URL('images/icons/pwa-192.png', self.registration.scope).href,
    tag: /^[a-f0-9-]{36}$/i.test(id) ? id : 'tyranny-activity',
    data: { url: new URL('./?push=inbox', self.registration.scope).href },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const destination = new URL('./?push=inbox', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing = windows.find(client => client.url.startsWith(self.registration.scope));
    if (existing) {
      await existing.focus();
      existing.postMessage({type:'TYRANNY_PUSH_INBOX'});
    } else await self.clients.openWindow(destination);
  })());
});
