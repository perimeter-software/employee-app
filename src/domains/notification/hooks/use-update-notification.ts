import { useMutation, useQueryClient } from '@tanstack/react-query';
import { NotificationApiService, notificationQueryKeys } from '../services';
import { Notification } from '../types';

export const useUpdateNotification = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Notification>) =>
      NotificationApiService.updateNotification(id, data),

    // Optimistic update
    onMutate: async (updateData) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({
        queryKey: [...notificationQueryKeys.all],
      });

      // Snapshot the previous value for rollback
      const previousData = queryClient.getQueryData([
        ...notificationQueryKeys.all,
      ]);

      // Optimistically update the cache
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
                  notification._id === id
                    ? { ...notification, ...updateData }
                    : notification
              ),
            },
          };
        }
      );

      // Return a context object with the snapshotted value
      return { previousData };
    },

    // If the mutation fails, use the context returned from onMutate to roll back
    onError: (err, updateData, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          [...notificationQueryKeys.all],
          context.previousData
        );
      }
      console.error('Failed to update notification:', err);
    },

    // Always refetch after error or success to ensure we have the latest data
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [...notificationQueryKeys.all],
      });
    },
  });
};
