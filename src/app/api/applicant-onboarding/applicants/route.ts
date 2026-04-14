import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { proxyToBackend, readJsonBody } from '../_helpers/proxy';

async function postHandler(request: AuthenticatedRequest) {
  const body = await readJsonBody(request);
  return proxyToBackend({
    request,
    method: 'post',
    path: '/applicants',
    body,
  });
}

export const POST = withAuthAPI(postHandler);
