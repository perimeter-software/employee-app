// GET /api/me/data-export — the caller's own "what we store about you" summary
// (Right to Access). Subject-scoped: identity comes from the session, never the
// client. Proxies to gig-v4-backend once the real endpoint exists.
import { NextResponse } from 'next/server';
import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { proxyToBackend } from '../../applicant-onboarding/_helpers/proxy';
import { USE_MOCK } from '../_mock/config';
import { mockDataExport, subjectFromUser } from '../_mock/mock-privacy-backend';

async function getHandler(request: AuthenticatedRequest) {
  if (USE_MOCK) {
    const summary = mockDataExport(subjectFromUser(request.user));
    return NextResponse.json({ success: true, data: summary });
  }
  // Real: BE derives the subject from the forwarded JWT.
  return proxyToBackend({ request, method: 'get', path: '/me/data-export' });
}

export const GET = withAuthAPI(getHandler);
