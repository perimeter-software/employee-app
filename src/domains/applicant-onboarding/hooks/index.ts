import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OnboardingService, onboardingQueryKeys } from '../services/onboarding-service';
import type { ApplicantRecord, OutsideMode } from '../types';

export function useCurrentApplicant(
  mode: OutsideMode = 'protected',
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: onboardingQueryKeys.current(mode),
    queryFn: () => OnboardingService.getCurrentApplicant(mode),
    refetchOnWindowFocus: false,
    enabled: options?.enabled ?? true,
  });
}

export function useCreateApplicant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<ApplicantRecord>) =>
      OnboardingService.createApplicant(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: onboardingQueryKeys.all }),
  });
}

export function useUpdateApplicant(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<ApplicantRecord>) =>
      OnboardingService.updateApplicant(id as string, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: onboardingQueryKeys.all }),
  });
}
