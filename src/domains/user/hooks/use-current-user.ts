import { useQuery } from '@tanstack/react-query';
import { userQueryKeys, UserApiService } from '../services';

export const useCurrentUser = (options?: {
  enabled?: boolean;
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
}) => {
  return useQuery({
    queryKey: userQueryKeys.current(),
    queryFn: () => {
      console.log('🚀 Query function executed');
      return UserApiService.getCurrentUser();
    },
    staleTime: options?.staleTime ?? 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchOnMount: false, // ERROR-PROOF: Don't refetch on remount to prevent rate limiting
    refetchOnReconnect: false, // ERROR-PROOF: Don't refetch on reconnect
    enabled: options?.enabled ?? true,
    retry: (failureCount, error) => {
      console.log('❌ Query retry:', { failureCount, error: error.message });
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
