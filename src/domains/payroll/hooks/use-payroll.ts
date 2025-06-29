import { useQuery } from '@tanstack/react-query';
import { PayrollService, payrollQueryKeys } from '../services';
import { PayrollBatchParams } from '../types';

/**
 * Hook to get all payroll batches
 */
export function usePayrollBatches(params?: PayrollBatchParams) {
  return useQuery({
    queryKey: [...payrollQueryKeys.batches(), params],
    queryFn: () => PayrollService.getPayrollBatches(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: true,
  });
}

/**
 * Hook to get a single payroll batch
 */
export function usePayrollBatch(id: string) {
  return useQuery({
    queryKey: payrollQueryKeys.batch(id),
    queryFn: () => PayrollService.getPayrollBatch(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to check if a timecard/punch is in a processed payroll batch
 * This is the key hook for determining if punch editing should be disabled
 */
export function useTimecardPayrollStatus(timecardId: string | undefined) {
  return useQuery({
    queryKey: payrollQueryKeys.batchByTimecard(timecardId || ''),
    queryFn: () => PayrollService.checkTimecardInProcessedBatch(timecardId!),
    enabled: !!timecardId,
    staleTime: 10 * 60 * 1000, // 10 minutes - longer cache since payroll status doesn't change often
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (error.message.includes('401') || error.message.includes('403')) {
        return false;
      }
      // On other errors, fail open for better UX (assume can edit)
      console.warn('Failed to check payroll status, allowing edit:', error);
      return failureCount < 1; // Only retry once
    },
  });
}
