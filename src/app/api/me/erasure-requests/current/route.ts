// GET /api/me/erasure-requests/current — the caller's own current/most-recent
// erasure request, for status + cooling-off countdown. Subject-scoped.
import { NextResponse } from 'next/server';
import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { proxyToBackend } from '../../../applicant-onboarding/_helpers/proxy';
import { USE_MOCK } from '../../_mock/config';
import { mockGetCurrent, subjectFromUser } from '../../_mock/mock-privacy-backend';

async function getHandler(request: AuthenticatedRequest) {
  if (USE_MOCK) {
    const subject = subjectFromUser(request.user);
    return NextResponse.json({ success: true, data: mockGetCurrent(subject.id) });
  }
  return proxyToBackend({ request, method: 'get', path: '/me/erasure-requests/current' });
}

export const GET = withAuthAPI(getHandler);
