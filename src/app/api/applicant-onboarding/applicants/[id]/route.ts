import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { proxyToBackend, readJsonBody, readParam } from '../../_helpers/proxy';

type Ctx = { params: Promise<Record<string, string | string[] | undefined>> };

async function putHandler(request: AuthenticatedRequest, ctx?: Ctx) {
  const id = await readParam(ctx, 'id');
  const body = await readJsonBody(request);
  // Stadium-people uses /outside-protected/applicants/:id for onboarding saves.
  return proxyToBackend({
    request,
    method: 'put',
    path: `/applicants/${id}`,
    body,
  });
}

export const PUT = withAuthAPI(putHandler);
