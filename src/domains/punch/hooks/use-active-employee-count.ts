import { useQuery } from '@tanstack/react-query';
import { punchQueryKeys, ActiveEmployeesService } from '../services';
import type { ActiveEmployeesParams } from '../types/active-employees.types';

export type UseActiveEmployeeCountOptions = {
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number;
  refetchOnWindowFocus?: boolean;
  refetchOnMount?: boolean;
};

/**
 * Fetch active employee count (Client time & attendance).
 * API returns count of currently clocked-in employees for the given job(s) and shift.
 */
export function useActiveEmployeeCount(
  params: ActiveEmployeesParams,
  options?: UseActiveEmployeeCountOptions
) {
  const jobIdsKey = params.jobIds?.slice().sort().join(',') ?? '';
  const shiftSlug = params.shiftSlug ?? 'all';

  return useQuery({
    queryKey: punchQueryKeys.activeCount(jobIdsKey, shiftSlug),
    queryFn: () => ActiveEmployeesService.getActiveCount(params),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 60 * 1000, // 1 minute
    refetchInterval: options?.refetchInterval ?? 120000, // 2 minutes
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchOnMount: options?.refetchOnMount ?? false,
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
