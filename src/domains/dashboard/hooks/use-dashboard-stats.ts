import { useQuery } from '@tanstack/react-query';
import {
  dashboardQueryKeys,
  DashboardApiService,
} from '../services/dashboard-service';
import { DashboardParams } from '../types';

export const useDashboardStats = (
  params: Pick<
    DashboardParams,
    'userId' | 'view' | 'startDate' | 'endDate'
  > | null,
  options?: {
    enabled?: boolean;
    staleTime?: number;
    refetchOnWindowFocus?: boolean;
  }
) => {
  return useQuery({
    queryKey: params
      ? dashboardQueryKeys.stats(params.userId, params.view)
      : ['dashboard-stats-disabled'],
    queryFn: () => {
      if (!params) throw new Error('No params provided');
      return DashboardApiService.getDashboardStats(params);
    },
    staleTime: options?.staleTime ?? 2 * 60 * 1000, // 2 minutes
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
