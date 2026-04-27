import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { proxyToBackend } from '../_helpers/proxy';

async function getHandler(request: AuthenticatedRequest) {
  return proxyToBackend({
    request,
    method: 'get',
    path: '/llm/dynamicForms',
  });
}

export const GET = withAuthAPI(getHandler);
