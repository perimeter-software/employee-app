// Shared helper for proxying applicant-onboarding endpoints to gig-v4-backend
// via the Sp1Client JWT pattern.
import { NextResponse } from 'next/server';
import { getSp1Client } from '@/lib/sp1Client';
import type { AuthenticatedRequest } from '@/domains/user/types';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface ProxyArgs {
  request: AuthenticatedRequest;
  method: HttpMethod;
  path: string;
  body?: unknown;
  params?: Record<string, unknown>;
}

export async function proxyToBackend({
  request,
  method,
  path,
  body,
  params,
}: ProxyArgs) {
  const user = request.user;
  if (!user?.sub || !user?.email) {
    return NextResponse.json(
      { success: false, message: 'Invalid session' },
      { status: 401 }
    );
  }
  try {
    const sp1 = getSp1Client(user.sub, user.email);
    const config: AxiosRequestConfig = { params };
    let res: AxiosResponse;
    switch (method) {
      case 'get':
        res = await sp1.get(path, config);
        break;
      case 'delete':
        res = await sp1.delete(path, config);
        break;
      case 'post':
        res = await sp1.post(path, body ?? {}, config);
        break;
      case 'put':
        res = await sp1.put(path, body ?? {}, config);
        break;
      case 'patch':
        res = await sp1.patch(path, body ?? {}, config);
        break;
    }
    return NextResponse.json(res.data);
  } catch (error: unknown) {
    const e = error as { response?: { status?: number; data?: unknown }; message?: string };
    const status = e.response?.status ?? 500;
    console.error(`[applicant-onboarding proxy] ${method.toUpperCase()} ${path}:`, e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Proxy request failed' },
      { status }
    );
  }
}

export async function readParam(
  context: { params: Promise<Record<string, string | string[] | undefined>> } | undefined,
  key: string
): Promise<string | undefined> {
  const p = (await context?.params) ?? {};
  const v = p[key];
  return Array.isArray(v) ? v[0] : v;
}

export async function readJsonBody(request: AuthenticatedRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function pickOutsideModePath(
  base: string,
  mode: 'public' | 'protected' | undefined
): string {
  const prefix = mode ? `/outside-${mode}` : '';
  return `${prefix}${base}`;
}
