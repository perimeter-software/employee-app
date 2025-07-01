import { Notification } from '../types';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export interface NotificationState {
  notifications: Notification[];
  current: Notification | null;

  // Actions
  add: (
    message: string,
    type?: Notification['type'],
    options?: Partial<Notification>
  ) => void;
  remove: (id: string) => void;
  next: () => void;
  clear: () => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>()(
  subscribeWithSelector(
    immer((set, get) => ({
      notifications: [],
      current: null,

      add: (message, type = 'info', options = {}) =>
        set((state) => {
          const id = `notification-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`;

          const notification: Notification = {
            _id: id,
            fromUserId: 'system',
            fromFirstName: 'System',
            fromLastName: 'Notification',
            recipient: {
              applicantId: 'system',
              userId: 'system',
              firstName: 'System',
              lastName: 'User',
            },
            sendTime: new Date(),
            msgType: 'system',
            subject: message,
            msgTemplate: 'system',
            body: message,
            profileImg: '',
            status: 'active',
            type,
            duration: 5000,
            persistent: false,
            message,
            ...options,
          };

          state.notifications.push(notification);

          if (!state.current) {
            state.current = notification;
          }

          // Auto-remove after duration if not persistent
          if (!notification.persistent && notification.duration) {
            setTimeout(() => {
              get().remove(id);
            }, notification.duration);
          }
        }),

      remove: (id) =>
        set((state) => {
          state.notifications = state.notifications.filter(
            (n: Notification) => n._id !== id
          );

          if (state.current?._id === id) {
            state.current =
              state.notifications.length > 0 ? state.notifications[0] : null;
          }
        }),

      next: () =>
        set((state) => {
          if (state.notifications.length > 0) {
            state.current = state.notifications[0];
            state.notifications.shift();
          } else {
            state.current = null;
          }
        }),

      clear: () =>
        set((state) => {
          state.current = null;
        }),

      clearAll: () =>
        set((state) => {
          state.notifications = [];
          state.current = null;
        }),
    }))
  )
);

// Utility functions for common notification patterns
export const notify = {
  success: (message: string, options?: Partial<Notification>) =>
    useNotificationStore.getState().add(message, 'success', options),

  error: (message: string, options?: Partial<Notification>) =>
    useNotificationStore
      .getState()
      .add(message, 'error', { persistent: true, ...options }),

  warning: (message: string, options?: Partial<Notification>) =>
    useNotificationStore.getState().add(message, 'warning', options),

  info: (message: string, options?: Partial<Notification>) =>
    useNotificationStore.getState().add(message, 'info', options),
};
