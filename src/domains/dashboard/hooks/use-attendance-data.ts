import { useQuery } from '@tanstack/react-query';
import {
  dashboardQueryKeys,
  DashboardApiService,
} from '../services/dashboard-service';
import { DashboardParams } from '../types';

export const useAttendanceData = (
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
          'attendance',
          params.userId,
          params.view,
          params.startDate,
          params.endDate,
          params.selectedEmployeeId || 'all',
        ]
      : ['dashboard-attendance-disabled'],
    queryFn: () => {
      if (!params) throw new Error('No params provided');
      return DashboardApiService.getAttendanceData({
        userId: params.userId,
        view: params.view,
        startDate: params.startDate,
        endDate: params.endDate,
        weekStartsOn: params.weekStartsOn,
        selectedEmployeeId: params.selectedEmployeeId,
      });
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
