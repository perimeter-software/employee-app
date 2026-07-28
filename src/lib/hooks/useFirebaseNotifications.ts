import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, onMessage } from 'firebase/messaging';
import { toast } from 'sonner';
import { useAppUser } from '@/domains/user/hooks/useAppUser';
import { getFirebaseMessaging } from '@/lib/firebase/client';
import {
  readDeepLink,
  resolveNotificationDeepLink,
} from '@/lib/notifications/deep-links';

export function useFirebaseNotifications() {
  const { user, isLoading } = useAppUser();
  const router = useRouter();

  // A notification clicked while a tab is already open: the service worker
  // focuses that tab and posts us the raw deep link, which we resolve here and
  // navigate to client-side (no reload, auth state preserved).
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'NOTIFICATION_CLICK') return;
      router.push(resolveNotificationDeepLink(event.data.link));
    };

    navigator.serviceWorker.addEventListener('message', onServiceWorkerMessage);
    return () =>
      navigator.serviceWorker.removeEventListener(
        'message',
        onServiceWorkerMessage
      );
  }, [router]);

  useEffect(() => {
    // Wait until auth state is resolved and user is logged in
    if (isLoading || !user) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    async function init() {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const messaging = getFirebaseMessaging();
      if (!messaging) return;

      const registration = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js',
        { scope: '/' }
      );

      const token = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: registration,
      });

      if (token) {
        await fetch('/api/notifications/register-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
      }

      // Handle notifications while the app is open. The OS notification is not
      // shown in this case, so the toast carries the deep link instead.
      onMessage(messaging, (payload) => {
        const { title, body } = payload.notification ?? {};
        const link = readDeepLink(payload.data);
        toast(title ?? 'New Notification', {
          description: body,
          ...(link && {
            action: {
              label: 'View',
              onClick: () => router.push(resolveNotificationDeepLink(link)),
            },
          }),
        });
      });
    }

    init().catch(console.error);
  }, [user, isLoading, router]);
}
