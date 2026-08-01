import { NextResponse } from 'next/server';
import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { getSp1Client } from '@/lib/sp1Client';
import { readParam } from '../../../../_helpers/proxy';

type Ctx = { params: Promise<Record<string, string | string[] | undefined>> };

async function postHandler(request: AuthenticatedRequest, ctx?: Ctx) {
  const id = await readParam(ctx, 'id');
  const type = await readParam(ctx, 'type');
  const user = request.user;

  if (!user?.sub || !user?.email) {
    return NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const { tenant } = user;
    // Pass contentType: false so axios sets the correct multipart/form-data boundary
    const sp1 = getSp1Client(user.sub, user.email, tenant?.clientDomain || tenant?.url, false);
    const res = await sp1.post(`/upload/applicants/${id}/${type}`, formData);
    return NextResponse.json(res.data);
  } catch (error: unknown) {
    const e = error as { response?: { status?: number; data?: unknown }; message?: string };
    const status = e.response?.status ?? 500;
    console.error(`[applicant-onboarding upload] POST /upload/applicants/${id}/${type}:`, e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Upload failed' },
      { status }
    );
  }
}

export const POST = withAuthAPI(postHandler);
