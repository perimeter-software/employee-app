import { useQuery } from '@tanstack/react-query';
import { NotificationApiService, notificationQueryKeys } from '../services';

export const useUserNotifications = () => {
  return useQuery({
    queryKey: notificationQueryKeys.list(),
    queryFn: () => NotificationApiService.getUserNotifications(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false, // ERROR-PROOF: Disabled to prevent rate limiting
    refetchOnMount: false, // ERROR-PROOF: Don't refetch on remount
    refetchOnReconnect: false, // ERROR-PROOF: Don't refetch on reconnect
    retry: (failureCount, error) => {
      // Don't retry on auth errors (handled by interceptor)
      if (error.message.includes('401') || error.message.includes('403')) {
        return false;
      }
      // Don't retry on rate limit errors
      if (error.message.includes('429')) {
        return false;
      }
      return failureCount < 2;
    },
  });
};
