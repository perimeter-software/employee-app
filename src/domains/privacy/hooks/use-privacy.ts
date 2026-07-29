'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PrivacyService, privacyQueryKeys } from '../services/privacy-service';
import { isActive, type CreateErasureRequestInput } from '../types';

/** "What we store about you" (Right to Access). The export is expensive, so
 * don't hammer it: no retry storm, no refetch-on-focus. */
export function useDataExport() {
  return useQuery({
    queryKey: privacyQueryKeys.dataExport(),
    queryFn: () => PrivacyService.getDataExport(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/** The caller's own current request; polls while active. `null` = none. */
export function useCurrentErasureRequest() {
  return useQuery({
    queryKey: privacyQueryKeys.erasureCurrent(),
    queryFn: () => PrivacyService.getCurrentErasureRequest(),
    refetchInterval: (q) => (isActive(q.state.data?.status) ? 5000 : false),
    refetchOnWindowFocus: true,
  });
}

/** Impact totals for the confirm step — fetched only when `enabled`. */
export function useErasurePreview(enabled: boolean) {
  return useQuery({
    queryKey: privacyQueryKeys.erasurePreview(),
    queryFn: () => PrivacyService.getPreview(),
    enabled,
    staleTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useCreateErasureRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateErasureRequestInput) => PrivacyService.createErasureRequest(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: privacyQueryKeys.erasureCurrent() }),
  });
}

export function useCancelErasureRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => PrivacyService.cancelErasureRequest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: privacyQueryKeys.erasureCurrent() }),
  });
}
