'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PrivacyService, privacyQueryKeys } from '../services/privacy-service';
import { isTerminal, type CreateErasureRequestInput } from '../types';

/** "What we store about you" summary (Right to Access). */
export function useDataExport() {
  return useQuery({
    queryKey: privacyQueryKeys.dataExport(),
    queryFn: () => PrivacyService.getDataExport(),
    staleTime: 5 * 60 * 1000,
  });
}

/** The caller's own current erasure request; polls while non-terminal. */
export function useCurrentErasureRequest() {
  return useQuery({
    queryKey: privacyQueryKeys.erasureCurrent(),
    queryFn: () => PrivacyService.getCurrentErasureRequest(),
    refetchInterval: (q) => (isTerminal(q.state.data?.status) ? false : 5000),
  });
}

export function useCreateErasureRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateErasureRequestInput) => PrivacyService.createErasureRequest(input),
    onSuccess: (req) => qc.setQueryData(privacyQueryKeys.erasureCurrent(), req),
  });
}

export function useCancelErasureRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => PrivacyService.cancelErasureRequest(id),
    onSuccess: (req) => qc.setQueryData(privacyQueryKeys.erasureCurrent(), req),
  });
}
