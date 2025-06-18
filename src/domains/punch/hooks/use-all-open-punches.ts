import { useQuery } from '@tanstack/react-query';
import { PunchApiService, punchQueryKeys } from '../services';

export const useAllOpenPunches = (userId: string) => {
  return useQuery({
    queryKey: punchQueryKeys.allOpen(userId),
    queryFn: () => PunchApiService.getAllOpenPunches(userId),
    // Only run the query when we have a valid userId
    enabled: !!userId && userId.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => {
      // Don't retry on auth errors (handled by interceptor)
      if (error.message.includes('401') || error.message.includes('403')) {
        return false;
      }
      return failureCount < 2;
    },
  });
};
