import { useQuery } from '@tanstack/react-query';
import {
  dashboardQueryKeys,
  DashboardApiService,
} from '../services/dashboard-service';
import { DashboardParams } from '../types';

export const useInsights = (
  params: Pick<DashboardParams, 'userId' | 'view'>,
  options?: {
    enabled?: boolean;
    staleTime?: number;
    refetchOnWindowFocus?: boolean;
  }
) => {
  return useQuery({
    queryKey: dashboardQueryKeys.insights(params.userId, params.view),
    queryFn: () => {
      return DashboardApiService.getInsights(params);
    },
    staleTime: options?.staleTime ?? 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    enabled: options?.enabled ?? true,
    retry: (failureCount, error) => {
      if (error.message.includes('401') || error.message.includes('403')) {
        return false;
      }
      return failureCount < 3;
    },
  });
};
