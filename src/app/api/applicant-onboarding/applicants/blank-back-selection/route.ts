import { NextResponse } from 'next/server';
import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { proxyToBackend, readJsonBody } from '../../_helpers/proxy';

// Confirms that a blank page the applicant just uploaded is the reverse side of a
// document already on file. The backend keys this off the applicant email and owns
// the eligibility rule (which fronts can legitimately have a blank back), so the
// email is taken from the session rather than the request body.
async function putHandler(request: AuthenticatedRequest) {
  const email = request.user?.email;
  if (!email) {
    return NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 });
  }

  const body = (await readJsonBody(request)) as
    | { filename?: string; type?: string }
    | undefined;

  if (!body?.filename || !body?.type) {
    return NextResponse.json(
      { success: false, message: 'filename and type are required' },
      { status: 400 }
    );
  }

  return proxyToBackend({
    request,
    method: 'put',
    path: `/applicants/email/${encodeURIComponent(email)}/blank-back-selection`,
    body: { filename: body.filename, type: body.type },
  });
}

export const PUT = withAuthAPI(putHandler);
