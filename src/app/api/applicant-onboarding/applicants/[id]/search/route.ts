import { NextResponse } from 'next/server';
import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import {
  proxyToBackend,
  readJsonBody,
  readParam,
} from '../../../_helpers/proxy';

type Ctx = { params: Promise<Record<string, string | string[] | undefined>> };

async function postHandler(request: AuthenticatedRequest, ctx?: Ctx) {
  const id = await readParam(ctx, 'id');
  if (!id) {
    return NextResponse.json(
      { success: false, message: 'Missing applicant ID' },
      { status: 400 }
    );
  }
  const body = await readJsonBody(request);
  return proxyToBackend({
    request,
    method: 'post',
    path: `/jobs/applicants/${id}/search`,
    body,
  });
}

export const POST = withAuthAPI(postHandler);
