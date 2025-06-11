import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NotificationApiService, notificationQueryKeys } from "../services";

export const useMarkAllAsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => NotificationApiService.markAllAsRead(),
    onSuccess: () => {
      // Invalidate all notification queries
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all });
    },
  });
};
