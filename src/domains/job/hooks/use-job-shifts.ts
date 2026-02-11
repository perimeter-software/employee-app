import { useQuery } from '@tanstack/react-query';
import { jobQueryKeys, JobShiftsService } from '../services/job-service';
import type { Shift } from '../types/job.types';

export type UseJobShiftsOptions = {
  enabled?: boolean;
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchOnMount?: boolean;
  refetchOnReconnect?: boolean;
};

/**
 * Fetch full shifts for a single job (includes defaultSchedule, shiftRoster).
 * Use when a job is selected and full shift data is needed (e.g. future punches).
 */
export function useJobShifts(jobId: string, options?: UseJobShiftsOptions) {
  return useQuery<Shift[]>({
    queryKey: jobQueryKeys.shifts(jobId),
    queryFn: () => JobShiftsService.getJobShifts(jobId),
    enabled: (options?.enabled ?? true) && !!jobId && jobId !== 'all',
    staleTime: options?.staleTime ?? 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchOnMount: options?.refetchOnMount ?? false,
    refetchOnReconnect: options?.refetchOnReconnect ?? false,
    retry: (failureCount, error) => {
      if (error.message.includes('401') || error.message.includes('403')) {
        return false;
      }
      if (error.message.includes('429')) {
        return false;
      }
      return failureCount < 2;
    },
  });
}
