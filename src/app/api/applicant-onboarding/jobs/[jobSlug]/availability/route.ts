import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { proxyToBackend, readParam } from '../../../_helpers/proxy';

type Ctx = { params: Promise<Record<string, string | string[] | undefined>> };

async function getHandler(request: AuthenticatedRequest, ctx?: Ctx) {
  const jobSlug = await readParam(ctx, 'jobSlug');
  return proxyToBackend({
    request,
    method: 'get',
    path: `/jobs/${jobSlug}/availability`,
  });
}

export const GET = withAuthAPI(getHandler);
