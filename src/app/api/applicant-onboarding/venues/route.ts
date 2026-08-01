import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { proxyToBackend, pickOutsideModePath } from '../_helpers/proxy';

async function getHandler(request: AuthenticatedRequest) {
  const url = new URL(request.url);
  const rawMode = url.searchParams.get('mode') ?? 'public';
  const mode = rawMode === 'public' || rawMode === 'protected' ? rawMode : 'public';

  // Forward all other query params to backend.
  const params: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    if (k !== 'mode') params[k] = v;
  });
  return proxyToBackend({
    request,
    method: 'get',
    path: pickOutsideModePath('/venues', mode),
    params,
  });
}

export const GET = withAuthAPI(getHandler);
