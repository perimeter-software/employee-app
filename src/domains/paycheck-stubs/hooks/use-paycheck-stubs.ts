import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PaycheckStub } from '../types';
import {
  paycheckStubQueryKeys,
  PaycheckStubService,
} from '../services/paycheck-stub-service';

/**
 * Get all paycheck stubs for the current user
 */
export function usePaycheckStubs(applicantId?: string) {
  return useQuery({
    queryKey: paycheckStubQueryKeys.list(applicantId),
    queryFn: () => PaycheckStubService.getPaycheckStubs(applicantId!),
    enabled: !!applicantId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * Get pre-signed URL for a paycheck stub PDF
 */
export function useGetPaycheckStubPresignedUrl() {
  return useMutation({
    mutationFn: ({
      applicantId,
      stubId,
    }: {
      applicantId: string;
      stubId: string;
    }) => PaycheckStubService.getPresignedUrl(applicantId, stubId),
    onError: (error) => {
      console.error('❌ Failed to get pre-signed URL:', error);
    },
  });
}

/**
 * Update view status of a paycheck stub
 */
export function useUpdatePaycheckStubViewStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      applicantId,
      stubId,
      viewStatus,
    }: {
      applicantId: string;
      stubId: string;
      viewStatus: 'viewed' | 'unviewed';
    }) =>
      PaycheckStubService.updateViewStatus(applicantId, stubId, viewStatus),
    onSuccess: (_, variables) => {
      // Invalidate and refetch paycheck stubs
      queryClient.invalidateQueries({
        queryKey: paycheckStubQueryKeys.list(variables.applicantId),
      });
    },
    onError: (error) => {
      console.error('❌ Failed to update view status:', error);
    },
  });
}

