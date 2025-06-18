import { useQuery } from '@tanstack/react-query';
import {
  dashboardQueryKeys,
  DashboardApiService,
} from '../services/dashboard-service';
import { DashboardParams } from '../types';

export const useAttendanceData = (
  params: Pick<DashboardParams, 'userId' | 'view' | 'startDate' | 'endDate'> | null,
  options?: {
    enabled?: boolean;
    staleTime?: number;
    refetchOnWindowFocus?: boolean;
  }
) => {
  return useQuery({
    queryKey: params ? dashboardQueryKeys.attendance(params.userId) : ['dashboard-attendance-disabled'],
    queryFn: () => {
      if (!params) throw new Error('No params provided');
      return DashboardApiService.getAttendanceData(params);
    },
    staleTime: options?.staleTime ?? 10 * 60 * 1000, // 10 minutes
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
