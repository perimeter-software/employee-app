import { useQuery } from '@tanstack/react-query';
import { NotificationApiService, notificationQueryKeys } from '../services';

export interface UserNotificationsOptions {
  /**
   * Opt out of the `refetchOnMount: false` default below. `/notifications` is rate
   * limited to 30/min (tighter than the 60/min default), so this stays opt-in —
   * only pass `'always'` on a screen the user navigates to, never on one that
   * remounts in a loop.
   */
  refetchOnMount?: boolean | 'always';
}

export const useUserNotifications = (options: UserNotificationsOptions = {}) => {
  return useQuery({
    queryKey: notificationQueryKeys.list(),
    queryFn: () => NotificationApiService.getUserNotifications(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false, // ERROR-PROOF: Disabled to prevent rate limiting
    refetchOnMount: false, // ERROR-PROOF: Don't refetch on remount
    refetchOnReconnect: false, // ERROR-PROOF: Don't refetch on reconnect
    ...options,
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
