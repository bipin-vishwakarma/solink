// Solink service worker (plain JS, no build step).
// Handles push notifications and notification clicks.

// Activate immediately on install.
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Take control of open clients as soon as we activate.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push handler.
// IMPORTANT: the server already sends a stealth-aware payload (it never sees
// plaintext), so the SW just displays whatever title/body it receives.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || 'New message';
  const body = payload.body || '';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: 'solink-push',
    })
  );
});

// Notification click: focus an existing app window, or open a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});
