import { useMutation, useQueryClient } from '@tanstack/react-query';
import { NotificationApiService, notificationQueryKeys } from '../services';
import { Notification } from '../types';

export const useDeleteNotification = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => NotificationApiService.deleteNotification(id),

    // Optimistic update for delete
    onMutate: async () => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: [...notificationQueryKeys.all],
      });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData([
        ...notificationQueryKeys.all,
      ]);

      // Optimistically remove from cache
      queryClient.setQueryData(
        [...notificationQueryKeys.all],
        (old: { data: { notifications: Notification[]; count: number } }) => {
          if (!old?.data?.notifications) return old;

          return {
            ...old,
            data: {
              ...old.data,
              notifications: old.data.notifications.filter(
                (notification: Notification) => notification._id !== id
              ),
              count: Math.max(0, (old.data.count || 0) - 1),
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
      console.error('Failed to delete notification:', err);
    },

    // Always refetch to ensure consistency
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [...notificationQueryKeys.all],
      });
    },
  });
};
