// POST /api/me/erasure-requests/:id/cancel — the caller reverts their OWN
// scheduled erasure during the cooling-off window. Subject-scoped + ownership
// checked by the BE. Proxies to gig-v4-backend.
import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { proxyToBackend, readParam } from '../../../../applicant-onboarding/_helpers/proxy';

type Ctx = { params: Promise<Record<string, string | string[] | undefined>> };

async function postHandler(request: AuthenticatedRequest, ctx?: Ctx) {
  const id = (await readParam(ctx, 'id')) ?? '';
  return proxyToBackend({ request, method: 'post', path: `/me/erasure-requests/${id}/cancel` });
}

export const POST = withAuthAPI(postHandler);
