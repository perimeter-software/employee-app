import { useQuery } from '@tanstack/react-query';
import {
  dashboardQueryKeys,
  DashboardApiService,
} from '../services/dashboard-service';
import { DashboardParams } from '../types';

export const usePerformanceMetrics = (
  params: Pick<
    DashboardParams,
    'userId' | 'view' | 'startDate' | 'endDate' | 'weekStartsOn' | 'selectedEmployeeId'
  > | null,
  options?: {
    enabled?: boolean;
    staleTime?: number;
    refetchOnWindowFocus?: boolean;
  }
) => {
  return useQuery({
    queryKey: params
      ? [
          ...dashboardQueryKeys.all,
          'performance',
          params.userId,
          params.view,
          params.startDate,
          params.endDate,
          params.selectedEmployeeId || 'all',
        ]
      : ['dashboard-performance-disabled'],
    queryFn: () => {
      if (!params) throw new Error('No params provided');
      return DashboardApiService.getPerformanceMetrics({
        userId: params.userId,
        startDate: params.startDate,
        endDate: params.endDate,
        weekStartsOn: params.weekStartsOn,
        selectedEmployeeId: params.selectedEmployeeId,
      });
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
