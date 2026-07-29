// GET /api/me/data-export — the caller's own "what we store about you" summary
// (Right to Access). Subject-scoped: identity comes from the session, never the
// client. Proxies to gig-v4-backend.
import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { proxyToBackend } from '../../applicant-onboarding/_helpers/proxy';

async function getHandler(request: AuthenticatedRequest) {
  return proxyToBackend({ request, method: 'get', path: '/me/data-export' });
}

export const GET = withAuthAPI(getHandler);
