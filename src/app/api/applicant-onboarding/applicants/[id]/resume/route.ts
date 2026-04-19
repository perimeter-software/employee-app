import { NextResponse } from 'next/server';
import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { getSp1Client } from '@/lib/sp1Client';
import { readParam } from '../../../_helpers/proxy';

type Ctx = { params: Promise<Record<string, string | string[] | undefined>> };

async function postHandler(request: AuthenticatedRequest, ctx?: Ctx) {
  const user = request.user;
  if (!user?.sub || !user?.email) {
    return NextResponse.json(
      { success: false, message: 'Invalid session' },
      { status: 401 }
    );
  }

  const id = await readParam(ctx, 'id');
  if (!id) {
    return NextResponse.json(
      { success: false, message: 'Missing applicant ID' },
      { status: 400 }
    );
  }

  try {
    const formData = await request.formData();
    const { tenant } = user;
    const client = getSp1Client(
      user.sub,
      user.email,
      tenant?.clientDomain || tenant?.url,
      false
    );
    const { data, status } = await client.post(
      `/upload/applicants/${id}/Resume`,
      formData
    );
    return NextResponse.json(data, { status });
  } catch (error: unknown) {
    const e = error as { message?: string };
    console.error('[resume upload proxy] POST:', e.message);
    return NextResponse.json(
      { success: false, message: 'Upload failed' },
      { status: 500 }
    );
  }
}

export const POST = withAuthAPI(postHandler);
