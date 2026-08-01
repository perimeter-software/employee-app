import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { proxyToBackend, readJsonBody } from '../../../_helpers/proxy';

async function postHandler(request: AuthenticatedRequest) {
  const body = await readJsonBody(request);
  return proxyToBackend({
    request,
    method: 'post',
    path: '/events/interview/suggestion',
    body,
  });
}

async function deleteHandler(request: AuthenticatedRequest) {
  const { searchParams } = new URL(request.url);
  const applicantId = searchParams.get('applicantId');
  const jobSlug = searchParams.get('jobSlug');
  return proxyToBackend({
    request,
    method: 'delete',
    path: `/events/interview/suggestion/${applicantId}/${jobSlug}`,
  });
}

export const POST = withAuthAPI(postHandler);
export const DELETE = withAuthAPI(deleteHandler);
