import { useQuery } from '@tanstack/react-query';
import { punchQueryKeys, ActiveEmployeesService } from '../services';
import type { ActiveEmployeesParams } from '../types/active-employees.types';

export type UseActiveEmployeesOptions = {
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number;
  refetchOnWindowFocus?: boolean;
  refetchOnMount?: boolean;
};

/**
 * Fetch active employees list (Client time & attendance).
 * API returns full list of currently clocked-in employees for the given job(s) and shift.
 */
export function useActiveEmployees(
  params: ActiveEmployeesParams,
  options?: UseActiveEmployeesOptions
) {
  const jobIdsKey = params.jobIds?.slice().sort().join(',') ?? '';
  const shiftSlug = params.shiftSlug ?? 'all';

  return useQuery({
    queryKey: punchQueryKeys.activeEmployees(jobIdsKey, shiftSlug),
    queryFn: () => ActiveEmployeesService.getActiveEmployees(params),
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
