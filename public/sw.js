// Service Worker — PedidApp
// Maneja notificaciones push cuando el browser está cerrado o la pantalla bloqueada

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Recibe un push desde el servidor (Supabase Edge Function)
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: '🍽️ Nuevo Pedido', body: event.data.text() };
  }

  const options = {
    body: data.body ?? 'Ha llegado un pedido nuevo',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'nuevo-pedido',
    data: { url: data.url ?? '/cocina' },
    vibrate: [200, 100, 200],
    actions: [
      { action: 'open', title: '👁 Ver Cocina' },
      { action: 'dismiss', title: 'Cerrar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title ?? '🍽️ Nuevo Pedido', options)
  );
});

// Al tocar la notificación — abre la app en /cocina
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url ?? '/cocina';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si ya hay una pestaña abierta, enfócala y navega
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      // Si no hay pestaña abierta, abre una nueva
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
