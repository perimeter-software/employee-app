import { useQuery } from '@tanstack/react-query';
import { punchQueryKeys, EmployeePunchesService } from '../services';
import type { EmployeePunchesParams } from '../types/employee-punches.types';

export type UseEmployeePunchesOptions = {
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchOnReconnect?: boolean;
  refetchOnMount?: boolean;
};

/**
 * Fetch employee punches by date range (Client time & attendance).
 * API returns punches filtered by job(s) and optional shift.
 */
export function useEmployeePunches(
  params: EmployeePunchesParams,
  options?: UseEmployeePunchesOptions
) {
  const jobIdsKey = params.jobIds?.slice().sort().join(',') ?? '';
  const shiftSlug = params.shiftSlug ?? 'all';

  return useQuery({
    queryKey: punchQueryKeys.employeePunches(
      params.startDate,
      params.endDate,
      jobIdsKey,
      shiftSlug
    ),
    queryFn: () => EmployeePunchesService.getEmployeePunches(params),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 120000, // 2 minutes
    gcTime: options?.gcTime ?? 300000, // 5 minutes
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchOnReconnect: options?.refetchOnReconnect ?? false,
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
