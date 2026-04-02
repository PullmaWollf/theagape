// ─── Célula Ágape Service Worker v4 ───
const CACHE_NAME = 'agape-v4';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── FETCH: nunca cacheia — sempre vai à rede ──
self.addEventListener('fetch', e => {
  // Deixa tudo passar direto para a rede
  // (sem cache para garantir dados sempre frescos do Supabase)
  e.respondWith(fetch(e.request));
});




// ── PUSH: recebe push do servidor Vercel ──
self.addEventListener('push', e => {
  let data = { title: 'Célula Ágape', body: 'Nova notificação', url: '/' };
  try { data = { ...data, ...e.data.json() }; } catch {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    '/icons/icon-192.png',
      badge:   '/icons/icon-72.png',
      vibrate: [300, 100, 300],
      tag:     data.tag || 'agape-push',
      renotify: true,
      data:    { url: data.url || '/' },
      actions: [
        { action: 'open',    title: 'Abrir' },
        { action: 'dismiss', title: 'Fechar' }
      ]
    })
  );
});

// ── NOTIFICATION CLICK ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type:'window', includeUncontrolled:true }).then(list => {
      const win = list.find(c => c.url.startsWith(self.location.origin));
      if (win) { win.focus(); win.navigate(url); }
      else clients.openWindow(url);
    })
  );
});

// ── SCHEDULED LOCAL NOTIFICATIONS (fallback) ──
const timers = {};

self.addEventListener('message', e => {
  if (e.data?.type === 'SCHEDULE') scheduleLocal(e.data.notifications);
  if (e.data?.type === 'CANCEL')   cancelLocal(e.data.id);
});

function scheduleLocal(list) {
  for (const n of list) {
    const delay = n.timestamp - Date.now();
    if (delay <= 0) continue;
    if (timers[n.id]) clearTimeout(timers[n.id]);
    timers[n.id] = setTimeout(() => {
      self.registration.showNotification(n.title, {
        body:    n.body,
        icon:    '/icons/icon-192.png',
        badge:   '/icons/icon-72.png',
        vibrate: [300, 100, 300],
        tag:     'lanche-' + n.id,
        renotify: true,
        data:    { url: '/?page=escala' }
      });
      delete timers[n.id];
    }, delay);
  }
}

function cancelLocal(id) {
  if (timers[id]) { clearTimeout(timers[id]); delete timers[id]; }
}
