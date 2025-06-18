import { useQuery } from '@tanstack/react-query';
import {
  dashboardQueryKeys,
  DashboardApiService,
} from '../services/dashboard-service';

export const useTodayAttendance = (options?: {
  enabled?: boolean;
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchInterval?: number;
}) => {
  return useQuery({
    queryKey: dashboardQueryKeys.all,
    queryFn: () => {
      return DashboardApiService.getTodayAttendance();
    },
    staleTime: options?.staleTime ?? 30 * 1000, // 30 seconds
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
    refetchInterval: options?.refetchInterval ?? 60 * 1000, // 1 minute
    enabled: options?.enabled ?? true,
    retry: (failureCount, error) => {
      if (error.message.includes('401') || error.message.includes('403')) {
        return false;
      }
      return failureCount < 3;
    },
  });
};
