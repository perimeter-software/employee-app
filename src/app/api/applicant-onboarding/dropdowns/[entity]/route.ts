import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { proxyToBackend, readParam } from '../../_helpers/proxy';

type Ctx = { params: Promise<Record<string, string | string[] | undefined>> };

async function getHandler(request: AuthenticatedRequest, ctx?: Ctx) {
  const entity = await readParam(ctx, 'entity');
  return proxyToBackend({
    request,
    method: 'get',
    path: `/control/dropdowns/name/${entity}`,
  });
}

export const GET = withAuthAPI(getHandler);
