import axios from 'axios';
import type { ApplicantRecord, CurrentApplicantResponse, OutsideMode } from '../types';

const BASE = '/api/applicant-onboarding';

export const onboardingQueryKeys = {
  all: ['applicant-onboarding'] as const,
  current: (mode: OutsideMode) =>
    [...onboardingQueryKeys.all, 'current', mode] as const,
};

export const OnboardingService = {
  async getCurrentApplicant(mode: OutsideMode = 'protected'): Promise<CurrentApplicantResponse> {
    const { data } = await axios.get(`${BASE}/current`, { params: { mode } });
    return (data?.data ?? data) as CurrentApplicantResponse;
  },
  async createApplicant(payload: Partial<ApplicantRecord>): Promise<ApplicantRecord> {
    const { data } = await axios.post(`${BASE}/applicants`, payload);
    return (data?.data ?? data) as ApplicantRecord;
  },
  async updateApplicant(
    id: string,
    payload: Partial<ApplicantRecord>
  ): Promise<ApplicantRecord> {
    const { data } = await axios.put(`${BASE}/applicants/${id}`, payload);
    return (data?.data ?? data) as ApplicantRecord;
  },
};
