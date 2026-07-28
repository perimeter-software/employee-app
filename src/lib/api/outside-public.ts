// Client-side helper for the candidate-facing public pages (/render-assessment,
// /render-form). Calls go to our own Next.js proxy, which forwards them to
// sp1-api's `/outside-public/*` endpoints unchanged.
//
// These pages are reached from an emailed link with no session, so nothing here
// touches auth — identity is proven by the OTP step inside each flow.

const BASE = '/api/outside-public';

export class OutsidePublicError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(message: string, status: number, body: Record<string, unknown>) {
    super(message);
    this.name = 'OutsidePublicError';
    this.status = status;
    this.body = body;
  }
}

export async function outsidePublicFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const message =
      (body.error as string) || (body.message as string) || res.statusText;
    throw new OutsidePublicError(message, res.status, body);
  }

  return body as T;
}
