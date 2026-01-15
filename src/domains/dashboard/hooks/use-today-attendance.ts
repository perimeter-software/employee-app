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
    staleTime: options?.staleTime ?? 60 * 1000, // ERROR-PROOF: Increased to 1 minute (from 30 seconds)
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false, // ERROR-PROOF: Disabled by default to prevent rate limiting
    refetchOnMount: false, // ERROR-PROOF: Don't refetch on remount
    refetchInterval: options?.refetchInterval ?? 120 * 1000, // ERROR-PROOF: Increased to 2 minutes (from 1 minute)
    enabled: options?.enabled ?? true,
    retry: (failureCount, error) => {
      if (error.message.includes('401') || error.message.includes('403')) {
        return false;
      }
      // Don't retry on rate limit errors
      if (error.message.includes('429')) {
        return false;
      }
      return failureCount < 3;
    },
  });
};
