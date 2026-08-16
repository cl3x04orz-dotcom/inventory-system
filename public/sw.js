// 🔔 網頁原生離線背景推播 Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// 監聽來自 Apple/Google 伺服器發射的離線 Push 訊號
self.addEventListener('push', (event) => {
  let data = {
    title: '🛒 有人線上下單囉！',
    body: '收到最新線上下單，請點擊開啟審核',
    url: '/#pendingOrders',
    orderId: ''
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || '收到新訂單，點擊進行審核',
    icon: '/logo.png',
    badge: '/logo.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: data.orderId || `push_${Date.now()}`,
    renotify: true,
    data: {
      url: data.url || '/#pendingOrders'
    },
    actions: [
      { action: 'open', title: '一鍵開啟審核 ➔' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 點擊通知跳轉至後台審核頁
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/#pendingOrders';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
