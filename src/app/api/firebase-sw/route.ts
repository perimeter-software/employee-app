import { NextResponse } from 'next/server';

// Serves the Firebase service worker (rewritten from /firebase-messaging-sw.js).
// Uses the native Web Push API — no importScripts, no CSP issues.
// Firebase's getToken() only requires a valid registered service worker.
//
// Deep links: the push payload carries the same `data.link` the mobile app
// received (`gignology://events/<id>/details`, …). The worker does NOT resolve
// it — src/lib/notifications/deep-links.ts is the single source of truth — so
// it either hands the raw link to an already-open tab via postMessage, or
// opens /link?to=<raw link>, which resolves it and redirects.
export async function GET() {
  const script = `
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const notification = data.notification ?? {};
  const title = notification.title ?? 'New Notification';
  const options = {
    body: notification.body ?? '',
    icon: notification.icon ?? '/favicon.ico',
    data: data.data ?? {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

function readDeepLink(data) {
  if (!data) return '';
  var candidates = [data.link, data.click_action, data.deepLink, data.url];
  for (var i = 0; i < candidates.length; i++) {
    if (typeof candidates[i] === 'string' && candidates[i].trim()) {
      return candidates[i].trim();
    }
  }
  return '';
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  var link = readDeepLink(event.notification.data);
  var target = link ? '/link?to=' + encodeURIComponent(link) : '/home';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (windowClients) {
        // Reuse an open tab when there is one: focus it and let the app do a
        // client-side navigation. Keeps auth state and avoids a full reload.
        for (var i = 0; i < windowClients.length; i++) {
          var client = windowClients[i];
          if (new URL(client.url).origin !== self.location.origin) continue;
          return Promise.resolve(client.focus()).then(function (focused) {
            (focused || client).postMessage({
              type: 'NOTIFICATION_CLICK',
              link: link,
              target: target,
            });
          });
        }
        return self.clients.openWindow(target);
      })
  );
});
`;

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'application/javascript',
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'no-store',
    },
  });
}
