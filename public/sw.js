// 🔔 網頁原生離線背景推播 Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// 監聽來自 Apple/Google 伺服器發射的離線 Push 訊號
self.addEventListener('push', (event) => {
  console.log('[PUSH Trace] 1. Push event received in Service Worker!', event);

  const defaultData = {
    title: '🛒 有人線上下單囉！',
    body: '收到最新線上下單，請點擊開啟審核',
    url: './#pendingOrders',
    orderId: ''
  };

  let data = { ...defaultData };

  if (event.data) {
    try {
      const parsed = event.data.json();
      console.log('[PUSH Trace] 2. Payload parsed:', parsed);
      data = {
        title: parsed.title || defaultData.title,
        body: parsed.body || defaultData.body,
        url: parsed.url || defaultData.url,
        orderId: parsed.orderId || defaultData.orderId
      };
    } catch (e) {
      data.body = event.data.text() || defaultData.body;
      console.log('[PUSH Trace] 2. Payload text parsed:', data.body);
    }
  }

  const options = {
    body: data.body,
    icon: './logo192.png',
    badge: './logo192.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: data.orderId || `push_${Date.now()}`,
    renotify: true,
    data: {
      url: data.url
    },
    actions: [
      { action: 'open', title: '一鍵開啟審核 ➔' }
    ]
  };

  console.log('[PUSH Trace] 3. Calling showNotification with options:', options);

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
