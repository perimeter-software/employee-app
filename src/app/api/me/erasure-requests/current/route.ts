// GET /api/me/erasure-requests/current — the caller's own current/most-recent
// erasure request (status + cooling-off countdown), or the literal `null` when
// none exists. Subject-scoped. Proxies to gig-v4-backend.
import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { proxyToBackend } from '../../../applicant-onboarding/_helpers/proxy';

async function getHandler(request: AuthenticatedRequest) {
  return proxyToBackend({ request, method: 'get', path: '/me/erasure-requests/current' });
}

export const GET = withAuthAPI(getHandler);
