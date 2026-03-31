// ─── Célula Ágape Service Worker ───
const CACHE = 'agape-v1';
const ASSETS = ['/', '/index.html', '/manifest.json'];

// ── INSTALL: cache assets ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ── ACTIVATE: clean old caches ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── FETCH: serve from cache, fallback network ──
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }))
  );
});

// ── PUSH: receive push from server (future Supabase integration) ──
self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  const title = data.title || 'Célula Ágape';
  const options = {
    body: data.body || 'Você tem uma nova notificação.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    actions: data.actions || [],
    tag: data.tag || 'agape-notification',
    renotify: true
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// ── NOTIFICATION CLICK ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  if (e.action === 'dismiss') return;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(url); }
      else clients.openWindow(url);
    })
  );
});

// ── SCHEDULED NOTIFICATIONS (via postMessage from app) ──
// The app sends { type:'SCHEDULE', notifications:[{id, title, body, timestamp}] }
self.addEventListener('message', e => {
  if (e.data?.type === 'SCHEDULE') {
    scheduleNotifications(e.data.notifications);
  }
  if (e.data?.type === 'CANCEL') {
    cancelNotification(e.data.id);
  }
  if (e.data?.type === 'CANCEL_ALL') {
    cancelAllNotifications();
  }
});

// Store scheduled timers in memory (persist in IndexedDB for reliability)
const timers = {};

async function scheduleNotifications(list) {
  const db = await openDB();
  for (const notif of list) {
    const delay = notif.timestamp - Date.now();
    // Save to IndexedDB
    await dbPut(db, notif);
    if (delay <= 0) continue;
    // Clear existing timer for same id
    if (timers[notif.id]) clearTimeout(timers[notif.id]);
    timers[notif.id] = setTimeout(() => {
      self.registration.showNotification(notif.title, {
        body: notif.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        vibrate: [300, 100, 300, 100, 300],
        tag: 'lanche-' + notif.id,
        renotify: true,
        data: { url: '/?page=escala' },
        actions: [
          { action: 'open', title: 'Ver Escala' },
          { action: 'dismiss', title: 'Dispensar' }
        ]
      });
      dbDelete(db, notif.id);
    }, delay);
  }
}

async function cancelNotification(id) {
  if (timers[id]) { clearTimeout(timers[id]); delete timers[id]; }
  const db = await openDB();
  await dbDelete(db, id);
}

async function cancelAllNotifications() {
  Object.keys(timers).forEach(id => clearTimeout(timers[id]));
  Object.keys(timers).forEach(id => delete timers[id]);
  const db = await openDB();
  const store = db.transaction('notifications', 'readwrite').objectStore('notifications');
  store.clear();
}

// ── Re-schedule on SW restart (reads from IndexedDB) ──
async function restoreScheduled() {
  const db = await openDB();
  const all = await dbGetAll(db);
  const future = all.filter(n => n.timestamp > Date.now());
  if (future.length) scheduleNotifications(future);
}
restoreScheduled();

// ── IndexedDB helpers ──
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('agape-notifs', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('notifications', { keyPath: 'id' });
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e);
  });
}
function dbPut(db, item) {
  return new Promise((res, rej) => {
    const tx = db.transaction('notifications', 'readwrite');
    tx.objectStore('notifications').put(item).onsuccess = () => res();
    tx.onerror = rej;
  });
}
function dbDelete(db, id) {
  return new Promise((res, rej) => {
    const tx = db.transaction('notifications', 'readwrite');
    tx.objectStore('notifications').delete(id).onsuccess = () => res();
    tx.onerror = rej;
  });
}
function dbGetAll(db) {
  return new Promise((res, rej) => {
    const tx = db.transaction('notifications', 'readonly');
    const req = tx.objectStore('notifications').getAll();
    req.onsuccess = e => res(e.target.result);
    req.onerror = rej;
  });
}
