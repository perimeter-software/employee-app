// POST /api/me/erasure-requests/:id/cancel — the caller reverts their OWN
// scheduled erasure during the cooling-off window. Subject-scoped + ownership
// checked; allowed only while the request is still `scheduled`.
import { NextResponse } from 'next/server';
import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { proxyToBackend, readParam } from '../../../../applicant-onboarding/_helpers/proxy';
import { USE_MOCK } from '../../../_mock/config';
import { mockCancel, subjectFromUser } from '../../../_mock/mock-privacy-backend';

type Ctx = { params: Promise<Record<string, string | string[] | undefined>> };

async function postHandler(request: AuthenticatedRequest, ctx?: Ctx) {
  const id = (await readParam(ctx, 'id')) ?? '';
  if (USE_MOCK) {
    const subject = subjectFromUser(request.user);
    const result = mockCancel(subject.id, id);
    if ('error' in result) {
      const status = result.error === 'not_found' ? 404 : 409;
      return NextResponse.json({ success: false, code: result.error }, { status });
    }
    return NextResponse.json({ success: true, data: result });
  }
  return proxyToBackend({ request, method: 'post', path: `/me/erasure-requests/${id}/cancel` });
}

export const POST = withAuthAPI(postHandler);
