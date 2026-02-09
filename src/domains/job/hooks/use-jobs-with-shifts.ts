import { useQuery } from '@tanstack/react-query';
import { jobQueryKeys, JobsWithShiftsService } from '../services/job-service';
import type { GignologyJob, JobsWithShiftsParams } from '../types/job.types';

export type UseJobsWithShiftsOptions = {
  enabled?: boolean;
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchOnMount?: boolean;
  refetchOnReconnect?: boolean;
};

/**
 * Fetch jobs with shifts (Client time & attendance).
 * API filters by hideThisJob when includeHiddenJobs is false (default).
 */
export function useJobsWithShifts(
  params: JobsWithShiftsParams,
  options?: UseJobsWithShiftsOptions
) {
  const includeHiddenJobs = params.includeHiddenJobs === true;

  return useQuery<GignologyJob[]>({
    queryKey: jobQueryKeys.withShifts(includeHiddenJobs),
    queryFn: () => JobsWithShiftsService.getJobsWithShifts(params),
    enabled: options?.enabled ?? true,
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
