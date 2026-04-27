import { NextResponse } from 'next/server';
import { withAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';

async function getHandler(request: AuthenticatedRequest) {
  const { tenant } = request.user;
  const raw = tenant?.clientDomain || tenant?.url;
  if (!raw) {
    return NextResponse.json({ clientDomain: null });
  }
  const clientDomain = raw.startsWith('http') ? raw : `https://${raw}`;
  return NextResponse.json({ clientDomain });
}

export const GET = withAuthAPI(getHandler);
