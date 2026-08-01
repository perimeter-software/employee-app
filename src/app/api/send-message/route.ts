import { withEnhancedAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import {
  proxyToBackend,
  readJsonBody,
} from '@/app/api/applicant-onboarding/_helpers/proxy';

async function sendMessageHandler(request: AuthenticatedRequest) {
  const body = await readJsonBody(request);
  return proxyToBackend({
    request,
    method: 'post',
    path: '/sendmessage/type/email',
    body,
  });
}

export const POST = withEnhancedAuthAPI(sendMessageHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
