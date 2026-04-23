'use client';

// Ports stadium-people's useOutsideCompanyCache + useVenueCache. Fetches the primary
// company and the venue list for the onboarding flow through the outside-* proxy
// routes.
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';

export interface DepositOptions {
  directDeposit?: 'Yes' | 'No' | string;
  moneyNetworkService?: 'Yes' | 'No' | string;
  branchVirtualWallet?: 'Yes' | 'No' | string;
  employerIssuedPaperCheck?: 'Yes' | 'No' | string;
}

export interface PrimaryCompany {
  _id?: string;
  slug?: string;
  name?: string;
  companyType?: string;
  settings?: { companyType?: string };
  uploadPath?: string;
  imageUrl?: string;
  depositOptions?: DepositOptions;
}

interface VenueRecord {
  slug: string;
  name?: string;
  state?: string;
  status?: string;
  [k: string]: unknown;
}

export function usePrimaryOnboardingCompany() {
  return useQuery({
    queryKey: ['applicant-onboarding', 'primary-company'],
    queryFn: async (): Promise<PrimaryCompany | null> => {
      const { data } = await axios.get('/api/applicant-onboarding/primary-company', {
        params: { mode: 'public' },
      });
      return (data?.data ?? data) as PrimaryCompany | null;
    },
    staleTime: 10 * 60_000,
  });
}

export function useOnboardingVenues(enabled = true) {
  return useQuery({
    queryKey: ['applicant-onboarding', 'venues'],
    queryFn: async (): Promise<Record<string, VenueRecord>> => {
      const { data } = await axios.get('/api/applicant-onboarding/venues', {
        params: { mode: 'public', fetchAll: true, order: 'asc', orderBy: 'slug' },
      });
      const list: VenueRecord[] = (data?.data ?? data ?? []) as VenueRecord[];
      const map: Record<string, VenueRecord> = {};
      list.forEach((v) => {
        map[v.slug] = v;
      });
      return map;
    },
    enabled,
    staleTime: 10 * 60_000,
  });
}
