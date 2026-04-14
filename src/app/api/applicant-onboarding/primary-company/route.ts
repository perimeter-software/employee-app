import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { proxyToBackend, pickOutsideModePath } from '../_helpers/proxy';

async function getHandler(request: AuthenticatedRequest) {
  const url = new URL(request.url);
  const rawMode = url.searchParams.get('mode') ?? 'public';
  const mode = rawMode === 'public' || rawMode === 'protected' ? rawMode : 'public';
  return proxyToBackend({
    request,
    method: 'get',
    path: pickOutsideModePath('/companies/primary', mode),
  });
}

export const GET = withAuthAPI(getHandler);
