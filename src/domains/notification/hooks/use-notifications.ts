import { useMemo } from 'react';
import { useNotificationStore } from '../stores';
import type { Notification } from '../types';

export function useNotifications() {
  const { notifications, current, add, remove, next, clear, clearAll } =
    useNotificationStore();

  const actions = useMemo(
    () => ({
      success: (message: string, options?: Partial<Notification>) =>
        add(message, 'success', options),
      error: (message: string, options?: Partial<Notification>) =>
        add(message, 'error', { persistent: true, ...options }),
      warning: (message: string, options?: Partial<Notification>) =>
        add(message, 'warning', options),
      info: (message: string, options?: Partial<Notification>) =>
        add(message, 'info', options),
      remove,
      next,
      clear,
      clearAll,
    }),
    [add, remove, next, clear, clearAll]
  );

  return useMemo(
    () => ({
      notifications,
      current,
      hasNotifications: notifications.length > 0,
      notificationCount: notifications.length,
      ...actions,
    }),
    [notifications, current, actions]
  );
}
