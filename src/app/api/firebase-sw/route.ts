import { NextResponse } from 'next/server';

// Serves the Firebase service worker (rewritten from /firebase-messaging-sw.js).
// Uses the native Web Push API — no importScripts, no CSP issues.
// Firebase's getToken() only requires a valid registered service worker.
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

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
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
