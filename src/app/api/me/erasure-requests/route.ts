// POST /api/me/erasure-requests — the caller requests erasure of their OWN
// account. Subject-scoped: no subjectId is accepted; identity comes from the
// session. Creates a scheduled request with a cooling-off window.
import { NextResponse } from 'next/server';
import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { proxyToBackend, readJsonBody } from '../../applicant-onboarding/_helpers/proxy';
import { USE_MOCK } from '../_mock/config';
import { mockCreateErasure, subjectFromUser } from '../_mock/mock-privacy-backend';
import type { CreateErasureRequestInput } from '@/domains/privacy/types';

async function postHandler(request: AuthenticatedRequest) {
  const body = ((await readJsonBody(request)) ?? {}) as CreateErasureRequestInput;
  if (USE_MOCK) {
    const req = mockCreateErasure(subjectFromUser(request.user), body);
    return NextResponse.json({ success: true, data: req }, { status: 201 });
  }
  // Real: BE ignores any subjectId and derives it from the JWT.
  return proxyToBackend({ request, method: 'post', path: '/me/erasure-requests', body });
}

export const POST = withAuthAPI(postHandler);
