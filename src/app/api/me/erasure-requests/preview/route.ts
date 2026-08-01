// GET /api/me/erasure-requests/preview — impact totals for the confirmation
// step. Read-only; creates nothing. Subject-scoped. Proxies to gig-v4-backend.
import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { proxyToBackend } from '../../../applicant-onboarding/_helpers/proxy';

async function getHandler(request: AuthenticatedRequest) {
  return proxyToBackend({ request, method: 'get', path: '/me/erasure-requests/preview' });
}

export const GET = withAuthAPI(getHandler);
