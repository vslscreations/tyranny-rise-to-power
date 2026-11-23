window.TyrannyPush = (() => {
  let citizenId = null;
  let publicKey = null;
  let registration = null;
  let enabled = false;
  let busy = false;
  let message = '';
  let pendingOpen = new URL(location.href).searchParams.get('push') === 'inbox';
  const supported = () => isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const isAppleMobile = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api = async body => {
    const {data,error} = await window.TYRANNY_SUPABASE.functions.invoke('web-push',{body});
    if(error || data?.error) throw Error(data?.error || 'Unable to connect. Please try again.');
    return data;
  };
  const ready = async () => {
    if(!registration) {
      await navigator.serviceWorker.register('./service-worker.js', {scope:'./'});
      registration = await navigator.serviceWorker.ready;
    }
    return registration;
  };
  function render() {
    const element = document.getElementById('phonePushSettings');
    if(!element) return;
    let help = 'Receive account and world alerts on this device. Phone previews hide account details.';
    if(isAppleMobile() && !standalone()) help = 'On iPhone or iPad (iOS 16.4+), use Share → Add to Home Screen, then open Tyranny from that icon to enable notifications.';
    else if(!supported()) help = 'Phone notifications need HTTPS and a browser that supports Web Push.';
    else if(Notification.permission === 'denied') help = 'Notifications are blocked. Allow them in your browser or phone settings, then reopen the app.';
    else if(!citizenId) help = 'Sign in to enable phone notifications for your citizen.';
    element.innerHTML = `<strong>Phone notifications</strong><p>${escape(help)}</p>
      <button type="button" id="phonePushToggle" ${busy || !citizenId || !supported() || (isAppleMobile() && !standalone()) || (!enabled && !publicKey) ? 'disabled' : ''}>${busy ? 'Updating…' : enabled ? 'Turn off on this device' : 'Enable on this device'}</button>
      <p role="status">${escape(message || (enabled ? 'Enabled on this device.' : ''))}</p>`;
    element.querySelector('button').onclick = () => void toggle();
  }
  async function start(id) {
    if(!id || busy) return;
    const changed = citizenId !== id;
    citizenId = id;
    if(!supported() || (isAppleMobile() && !standalone())) { render(); return; }
    busy = true; render();
    try {
      const reg = await ready();
      let subscription = await reg.pushManager.getSubscription();
      const owner = localStorage.getItem('tyranny-push-citizen');
      if(subscription && owner !== id) {
        await subscription.unsubscribe();
        subscription = null;
        localStorage.removeItem('tyranny-push-citizen');
      }
      const config = await api({action:'config'});
      if(citizenId !== id) return;
      publicKey = config.publicKey;
      enabled = Boolean(subscription);
      if(subscription) await api({action:'enable',...subscription.toJSON()});
      if(changed) message = '';
    } catch { message = 'Phone notifications could not connect. Reopen the inbox to retry.'; }
    finally { busy = false; render(); }
  }
  async function disable() {
    if(!supported()) return;
    const reg = await ready();
    const subscription = await reg.pushManager.getSubscription();
    if(subscription) {
      // Remove the server binding before discarding the local endpoint.
      try { await api({action:'disable',endpoint:subscription.endpoint}); }
      catch(error) {
        if(!await subscription.unsubscribe()) throw error;
      }
      await subscription.unsubscribe();
    }
    localStorage.removeItem('tyranny-push-citizen');
    enabled = false;
    render();
  }
  async function toggle() {
    if(busy || !citizenId) return;
    busy=true; message=''; render();
    const current = citizenId;
    try {
      if(enabled) await disable();
      else {
        // Permission is requested directly in response to the player's tap.
        const permission=await Notification.requestPermission();
        if(permission!=='granted') throw Error('Notifications were not allowed. You can change this in device settings.');
        if(current!==citizenId) return;
        const bytes=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
        const reg=await ready();
        const subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
        try {
          if(current!==citizenId) throw Error('Account changed. Please retry.');
          await api({action:'enable',...subscription.toJSON()});
          localStorage.setItem('tyranny-push-citizen',current);
          enabled=true;
        } catch(error) { await subscription.unsubscribe(); throw error; }
      }
    } catch(error) { message=error.message; }
    finally { busy=false; render(); }
  }
  function openInbox() {
    if(!pendingOpen || !citizenId || !window.TyrannyNotifications) return;
    pendingOpen=false;
    const url=new URL(location.href); url.searchParams.delete('push');
    history.replaceState(null,'',url);
    returnHome();
    if(document.getElementById('notificationCenter').classList.contains('hidden')) window.TyrannyNotifications.toggle();
  }
  navigator.serviceWorker?.addEventListener('message', event => {
    if(event.data?.type==='TYRANNY_PUSH_INBOX') { pendingOpen=true; openInbox(); }
  });
  async function stop() {
    citizenId=null; publicKey=null; enabled=false;
    if(supported()) {
      const reg=await navigator.serviceWorker.getRegistration('./');
      const sub=await reg?.pushManager.getSubscription();
      if(sub) await sub.unsubscribe();
    }
    localStorage.removeItem('tyranny-push-citizen');
    render();
  }
  return {start,render,disable,stop,openInbox};
})();
