import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { proxyToBackend, readParam } from '../../../_helpers/proxy';

type Ctx = { params: Promise<Record<string, string | string[] | undefined>> };

async function getHandler(request: AuthenticatedRequest, ctx?: Ctx) {
  const id = await readParam(ctx, 'id');
  return proxyToBackend({
    request,
    method: 'get',
    path: `/applicants/${id}/state-tax-forms`,
  });
}

export const GET = withAuthAPI(getHandler);
