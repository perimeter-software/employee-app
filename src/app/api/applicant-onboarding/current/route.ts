import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { proxyToBackend, pickOutsideModePath } from '../_helpers/proxy';

async function getHandler(request: AuthenticatedRequest) {
  const url = new URL(request.url);
  const rawMode = url.searchParams.get('mode') ?? 'protected';
  let mode: 'public' | 'protected' | '' | undefined =
    rawMode === 'public' || rawMode === 'protected' ? rawMode : 'protected';

  if (mode === 'protected') mode = ''; // Don't use protected mode for backend to backend requests

  return proxyToBackend({
    request,
    method: 'get',
    path: pickOutsideModePath('/applicants/current', mode),
  });
}

export const GET = withAuthAPI(getHandler);
