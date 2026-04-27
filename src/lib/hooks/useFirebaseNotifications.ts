import { useEffect } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { toast } from 'sonner';
import { useAppUser } from '@/domains/user/hooks/useAppUser';
import { getFirebaseMessaging } from '@/lib/firebase/client';

export function useFirebaseNotifications() {
  const { user, isLoading } = useAppUser();

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

      // Handle notifications while the app is open
      onMessage(messaging, (payload) => {
        const { title, body } = payload.notification ?? {};
        toast(title ?? 'New Notification', {
          description: body,
        });
      });
    }

    init().catch(console.error);
  }, [user, isLoading]);
}
