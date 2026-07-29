// POST /api/me/erasure-requests — the caller requests erasure of their OWN
// account. Subject-scoped: no subjectId is accepted; identity comes from the
// session. Proxies to gig-v4-backend.
import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { proxyToBackend, readJsonBody } from '../../applicant-onboarding/_helpers/proxy';
import type { CreateErasureRequestInput } from '@/domains/privacy/types';

async function postHandler(request: AuthenticatedRequest) {
  const body = ((await readJsonBody(request)) ?? {}) as CreateErasureRequestInput;
  // BE ignores/rejects any subjectId and derives the subject from the JWT.
  return proxyToBackend({ request, method: 'post', path: '/me/erasure-requests', body });
}

export const POST = withAuthAPI(postHandler);
