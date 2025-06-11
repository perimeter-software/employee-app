import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NotificationApiService, notificationQueryKeys } from "../services";
import { Notification } from "../types";

export const useUpdateNotification = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Notification>) =>
      NotificationApiService.updateNotification(id, data),
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all });
    },
  });
};
