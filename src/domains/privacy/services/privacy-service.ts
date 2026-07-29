// Client calls to the self-service `/api/me/*` route handlers, which proxy to
// gig-v4-backend. Thin axios wrappers. The BE returns payloads directly (no
// envelope).
import axios from 'axios';
import type {
  CancelErasureResult,
  CreateErasureRequestInput,
  CreateErasureResult,
  CurrentErasureRequest,
  DataExport,
  ErasurePreview,
} from '../types';

const BASE = '/api/me';

export const privacyQueryKeys = {
  all: ['privacy'] as const,
  dataExport: () => [...privacyQueryKeys.all, 'data-export'] as const,
  erasureCurrent: () => [...privacyQueryKeys.all, 'erasure', 'current'] as const,
  erasurePreview: () => [...privacyQueryKeys.all, 'erasure', 'preview'] as const,
};

export const PrivacyService = {
  // Both endpoints fan out over ~42 data sources and can legitimately take tens
  // of seconds (slower in dev with cold connections). Use a generous timeout so
  // a slow-but-successful response isn't aborted (which the browser reports as a
  // "(canceled)" request).
  async getDataExport(): Promise<DataExport> {
    const { data } = await axios.get(`${BASE}/data-export`, { timeout: 120_000 });
    return data as DataExport;
  },

  async getPreview(): Promise<ErasurePreview> {
    const { data } = await axios.get(`${BASE}/erasure-requests/preview`, { timeout: 120_000 });
    return data as ErasurePreview;
  },

  // The BE can return the literal body `null` (no request ever made).
  async getCurrentErasureRequest(): Promise<CurrentErasureRequest | null> {
    const { data } = await axios.get(`${BASE}/erasure-requests/current`);
    return (data ?? null) as CurrentErasureRequest | null;
  },

  async createErasureRequest(input: CreateErasureRequestInput): Promise<CreateErasureResult> {
    const { data } = await axios.post(`${BASE}/erasure-requests`, input);
    return data as CreateErasureResult;
  },

  async cancelErasureRequest(id: string): Promise<CancelErasureResult> {
    const { data } = await axios.post(`${BASE}/erasure-requests/${id}/cancel`);
    return data as CancelErasureResult;
  },
};
