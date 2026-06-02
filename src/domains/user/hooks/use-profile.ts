'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { baseInstance } from '@/lib/api/instance';
import { toast } from 'sonner';

/**
 * Self-service profile data hooks for the logged-in user. These talk to the
 * Next.js proxy routes under /api/profile, which forward to sp1-api keyed off
 * the trusted session email.
 */

export type ProfileRecord = {
  _id?: string;
  applicantId?: string;
  firstName?: string;
  lastName?: string;
  emailAddress?: string;
  primaryPhone?: string | null;
  secondaryPhone?: string | null;
  mobile?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  status?: string;
  userType?: string;
  employeeType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  profileImg?: string | null;
  [key: string]: unknown;
};

export type ProfilePatch = Partial<
  Record<
    | 'firstName'
    | 'lastName'
    | 'primaryPhone'
    | 'secondaryPhone'
    | 'mobile'
    | 'address'
    | 'city'
    | 'state'
    | 'zip'
    | 'profileImg',
    string | null
  >
>;

export type SesIdentityStatus =
  | 'verified'
  | 'submitted'
  | 'unsubmitted'
  | 'none';

export const profileQueryKeys = {
  profile: ['profile', 'me'] as const,
  identity: ['profile', 'identity'] as const,
};

export function useProfile() {
  return useQuery({
    queryKey: profileQueryKeys.profile,
    queryFn: async () => {
      const res = await baseInstance.get<ProfileRecord>('/profile');
      return res.data;
    },
    staleTime: 60_000,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ProfilePatch) => {
      const res = await baseInstance.put<ProfileRecord>('/profile', patch);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Profile updated');
      queryClient.invalidateQueries({ queryKey: profileQueryKeys.profile });
    },
    onError: () => toast.error('Failed to update profile'),
  });
}

export function useIdentityStatus(enabled: boolean) {
  return useQuery({
    queryKey: profileQueryKeys.identity,
    enabled,
    queryFn: async () => {
      const res = await baseInstance.get<{ status?: string }>(
        '/profile/identity',
      );
      const status = (res.data?.status ?? 'none').toString().toLowerCase();
      return (
        ['verified', 'submitted', 'unsubmitted'].includes(status)
          ? status
          : 'none'
      ) as SesIdentityStatus;
    },
    staleTime: 60_000,
  });
}

export function useSubmitIdentity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await baseInstance.post('/profile/identity');
      return res.data;
    },
    onSuccess: () => {
      toast.success('Verification email sent. Identity is now pending.');
      queryClient.invalidateQueries({ queryKey: profileQueryKeys.identity });
    },
    onError: () => toast.error('Failed to submit identity for verification'),
  });
}

export function useRemoveIdentity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await baseInstance.delete('/profile/identity');
      return res.data;
    },
    onSuccess: () => {
      toast.success('Identity verification removed');
      queryClient.invalidateQueries({ queryKey: profileQueryKeys.identity });
    },
    onError: () => toast.error('Failed to remove identity verification'),
  });
}
