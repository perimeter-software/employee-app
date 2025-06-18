import { useQuery } from '@tanstack/react-query';
import {
  dashboardQueryKeys,
  DashboardApiService,
} from '../services/dashboard-service';
import { DashboardParams } from '../types';

export const useDashboardData = (
  params: DashboardParams,
  options?: {
    enabled?: boolean;
    staleTime?: number;
    refetchOnWindowFocus?: boolean;
  }
) => {
  return useQuery({
    queryKey: dashboardQueryKeys.data(params),
    queryFn: () => {
      return DashboardApiService.getDashboardData(params);
    },
    staleTime: options?.staleTime ?? 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    enabled: options?.enabled ?? true,
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (error.message.includes('401') || error.message.includes('403')) {
        return false;
      }
      return failureCount < 3;
    },
  });
};
