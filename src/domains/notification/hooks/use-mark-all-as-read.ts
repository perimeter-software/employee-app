import { useMutation, useQueryClient } from '@tanstack/react-query';
import { NotificationApiService, notificationQueryKeys } from '../services';
import { Notification } from '../types';

export const useMarkAllAsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => NotificationApiService.markAllAsRead(),

    // Optimistic update for mark all as read
    onMutate: async () => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: [...notificationQueryKeys.all],
      });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData([
        ...notificationQueryKeys.all,
      ]);

      // Optimistically mark all as read
      queryClient.setQueryData(
        [...notificationQueryKeys.all],
        (old: { data: { notifications: Notification[] } }) => {
          if (!old?.data?.notifications) return old;

          return {
            ...old,
            data: {
              ...old.data,
              notifications: old.data.notifications.map(
                (notification: Notification) =>
                  notification.status === 'unread'
                    ? { ...notification, status: 'read' }
                    : notification
              ),
            },
          };
        }
      );

      return { previousData };
    },

    // Rollback on error
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          [...notificationQueryKeys.all],
          context.previousData
        );
      }
      console.error('Failed to mark all notifications as read:', err);
    },

    // Always refetch to ensure consistency
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [...notificationQueryKeys.all],
      });
    },
  });
};
