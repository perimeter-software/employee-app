import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import {
  proxyToBackend,
  readParam,
} from '@/app/api/applicant-onboarding/_helpers/proxy';

type Ctx = { params: Promise<Record<string, string | string[] | undefined>> };

async function getHandler(request: AuthenticatedRequest, ctx?: Ctx) {
  const applicantId = await readParam(ctx, 'applicantId');
  return proxyToBackend({
    request,
    method: 'get',
    path: `/jobs/assessment/link/${applicantId}`,
  });
}

export const GET = withAuthAPI(getHandler);
