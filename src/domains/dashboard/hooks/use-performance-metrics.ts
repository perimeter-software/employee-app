import { useQuery } from '@tanstack/react-query';
import {
  dashboardQueryKeys,
  DashboardApiService,
} from '../services/dashboard-service';
import { DashboardParams } from '../types';

export const usePerformanceMetrics = (
  params: Pick<
    DashboardParams,
    'userId' | 'view' | 'startDate' | 'endDate' | 'weekStartsOn'
  > | null,
  options?: {
    enabled?: boolean;
    staleTime?: number;
    refetchOnWindowFocus?: boolean;
  }
) => {
  return useQuery({
    queryKey: params
      ? dashboardQueryKeys.performance(
          params.userId,
          params.view,
          params.startDate,
          params.endDate
        )
      : ['dashboard-performance-disabled'],
    queryFn: () => {
      if (!params) throw new Error('No params provided');
      return DashboardApiService.getPerformanceMetrics(params);
    },
    staleTime: options?.staleTime ?? 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    enabled: (options?.enabled ?? true) && !!params,
    retry: (failureCount, error) => {
      if (error.message.includes('401') || error.message.includes('403')) {
        return false;
      }
      return failureCount < 3;
    },
  });
};
