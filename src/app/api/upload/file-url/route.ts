import { NextResponse } from 'next/server';
import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { getSp1Client } from '@/lib/sp1Client';

/**
 * Resolves an S3 object key to a presigned URL via gig-v4-backend.
 *
 * The backend picks the bucket from the caller's tenant, so `path` is the key
 * within that tenant's bucket and must never be prefixed with the company
 * slug or uploadPath. See `s3-object-keys.ts` for the key builders.
 */
async function getHandler(request: AuthenticatedRequest) {
  const user = request.user;
  if (!user?.sub || !user?.email) {
    return NextResponse.json(
      { success: false, message: 'Invalid session' },
      { status: 401 }
    );
  }

  const path = new URL(request.url).searchParams.get('path');
  if (!path) {
    return NextResponse.json(
      { success: false, message: 'path query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const { tenant } = user;
    const sp1 = getSp1Client(
      user.sub,
      user.email,
      tenant?.clientDomain || tenant?.url
    );
    const res = await sp1.get('/upload/file-url', { params: { path } });

    return NextResponse.json({
      success: true,
      data: { presignedUrl: res.data?.presignedUrl },
    });
  } catch (error: unknown) {
    const e = error as {
      response?: { status?: number; data?: unknown };
      message?: string;
    };
    const status = e.response?.status ?? 500;
    console.error(`[upload file-url] GET /upload/file-url?path=${path}:`, e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Failed to resolve file URL' },
      { status }
    );
  }
}

export const GET = withAuthAPI(getHandler);
