import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { proxyToBackend, pickOutsideModePath } from '../_helpers/proxy';

async function getHandler(request: AuthenticatedRequest) {
  const url = new URL(request.url);
  const rawMode = url.searchParams.get('mode') ?? 'protected';
  const mode = rawMode === 'public' || rawMode === 'protected' ? rawMode : 'protected';
  return proxyToBackend({
    request,
    method: 'get',
    path: pickOutsideModePath('/applicants/current', mode),
  });
}

export const GET = withAuthAPI(getHandler);
