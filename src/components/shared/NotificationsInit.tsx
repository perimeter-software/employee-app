'use client';

import { useFirebaseNotifications } from '@/lib/hooks/useFirebaseNotifications';

export function NotificationsInit() {
  useFirebaseNotifications();
  return null;
}
