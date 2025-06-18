import { useQuery } from '@tanstack/react-query';
import { PunchApiService, punchQueryKeys } from '../services';

interface FindPunchesParams {
  userId: string;
  jobIds: string[];
  startDate: string;
  endDate: string;
  status?: string;
}

export const useFindPunches = (params: FindPunchesParams) => {
  const enabled = !!params.userId && !!params.jobIds.length;

  return useQuery({
    queryKey: [...punchQueryKeys.list(), params],
    queryFn: async () => {
      const result = await PunchApiService.findPunchesByDateRange(params);
      return result;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    enabled,
    retry: (failureCount, error) => {
      // Don't retry on auth errors (handled by interceptor)
      if (error.message.includes('401') || error.message.includes('403')) {
        return false;
      }
      return failureCount < 2;
    },
  });
};
