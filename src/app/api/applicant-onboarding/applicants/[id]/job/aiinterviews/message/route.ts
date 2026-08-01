import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import {
  proxyToBackend,
  readJsonBody,
  readParam,
} from '@/app/api/applicant-onboarding/_helpers/proxy';

type Ctx = { params: Promise<Record<string, string | string[] | undefined>> };

async function postHandler(request: AuthenticatedRequest, ctx?: Ctx) {
  const id = await readParam(ctx, 'id');
  const body = await readJsonBody(request);
  return proxyToBackend({
    request,
    method: 'post',
    path: `/applicants/${id}/job/aiinterviews/message`,
    body,
  });
}

export const POST = withAuthAPI(postHandler);
