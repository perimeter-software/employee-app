// Client calls to the self-service `/api/me/*` route handlers (which proxy to
// gig-v4-backend, or serve the mock while USE_MOCK is on). Mirrors the shape of
// OnboardingService — thin axios wrappers, no logic.
import axios from 'axios';
import type {
  CreateErasureRequestInput,
  DataAccessSummary,
  ErasureRequest,
} from '../types';

const BASE = '/api/me';

export const privacyQueryKeys = {
  all: ['privacy'] as const,
  dataExport: () => [...privacyQueryKeys.all, 'data-export'] as const,
  erasureCurrent: () => [...privacyQueryKeys.all, 'erasure', 'current'] as const,
};

export const PrivacyService = {
  async getDataExport(): Promise<DataAccessSummary> {
    const { data } = await axios.get(`${BASE}/data-export`);
    return (data?.data ?? data) as DataAccessSummary;
  },

  async getCurrentErasureRequest(): Promise<ErasureRequest | null> {
    const { data } = await axios.get(`${BASE}/erasure-requests/current`);
    return (data?.data ?? data ?? null) as ErasureRequest | null;
  },

  async createErasureRequest(input: CreateErasureRequestInput): Promise<ErasureRequest> {
    const { data } = await axios.post(`${BASE}/erasure-requests`, input);
    return (data?.data ?? data) as ErasureRequest;
  },

  async cancelErasureRequest(id: string): Promise<ErasureRequest> {
    const { data } = await axios.post(`${BASE}/erasure-requests/${id}/cancel`);
    return (data?.data ?? data) as ErasureRequest;
  },
};
