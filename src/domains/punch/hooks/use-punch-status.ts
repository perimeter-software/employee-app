import { useQuery } from '@tanstack/react-query';
import { PunchApiService, punchQueryKeys } from '../services';

export const usePunchStatus = (id: string) => {
  return useQuery({
    queryKey: punchQueryKeys.status(id),
    queryFn: () => PunchApiService.getPunchStatus(id),
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
