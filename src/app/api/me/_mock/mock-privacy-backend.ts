// ⚠️ MOCK BACKEND — DELETE THIS FILE WHEN THE REAL `/me/*` ENDPOINTS EXIST.
//
// Emulates the not-yet-built gig-v4-backend self-service endpoints
// (RIGHT_TO_ERASURE_SELF_SERVICE_BACKEND_ADDENDUM.md) entirely in-process, so
// the "Privacy & My Data" UI is exercisable with no server. Each `/api/me/*`
// route handler calls one function here iff `USE_MOCK` is true; every function
// has a matching `proxyToBackend(...)` real path already written in the route.
//
// To go live: set `USE_MOCK = false` in `./config`, and in each route replace
// the mock branch with the `proxyToBackend` branch (already present). Then
// delete this file. State lives in module memory (persists across requests in a
// running dev server; resets on recompile) — fine for a mock.

import type {
  CreateErasureRequestInput,
  DataAccessSummary,
  ErasureRequest,
} from '@/domains/privacy/types';

const DEFAULT_COOLING_OFF_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface MockSubject {
  id: string;
  name: string;
  email: string;
  status?: string;
}

/**
 * Resolve the acting subject from the authenticated session. The subject is
 * always the caller — never a client-supplied id — which is exactly how the
 * real BE must scope these endpoints (see the addendum's security note).
 */
export function subjectFromUser(user: {
  sub?: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  applicantId?: string;
  userId?: string;
  status?: string;
  employmentStatus?: string;
  [key: string]: unknown;
}): MockSubject {
  const id = user.applicantId || user.userId || user.sub || user.email || 'unknown';
  const name =
    user.name ||
    [user.given_name, user.family_name].filter(Boolean).join(' ') ||
    user.email ||
    'You';
  return {
    id: String(id),
    name,
    email: user.email || '',
    status: (user.status as string) || user.employmentStatus,
  };
}

// subjectId → their current/most-recent request.
const store = new Map<string, ErasureRequest>();
let seq = 5100;

export function mockDataExport(subject: MockSubject): DataAccessSummary {
  const isEmployee = (subject.status || '').toLowerCase() === 'employee';
  return {
    subjectId: subject.id,
    generatedAt: new Date().toISOString(),
    sections: [
      {
        key: 'contact',
        title: 'Contact information',
        purpose: 'To identify you and communicate about jobs, shifts and your application.',
        items: [
          { label: 'Name', value: subject.name || '—' },
          { label: 'Email', value: subject.email || '—' },
          { label: 'Account type', value: subject.status || 'Applicant' },
        ],
      },
      {
        key: 'application',
        title: 'Application history',
        purpose: 'To process your job applications and screening.',
        items: [
          { label: 'Applications submitted', value: '3' },
          { label: 'Screening interviews', value: '1' },
          { label: 'Resume on file', value: 'Yes' },
        ],
      },
      {
        key: 'documents',
        title: 'Documents & attachments',
        purpose: 'Onboarding, identity and tax documents you uploaded.',
        items: [
          { label: 'Uploaded documents', value: '4' },
          { label: 'Tax forms (W-4 / state)', value: isEmployee ? '2' : '0' },
        ],
      },
      ...(isEmployee
        ? [
            {
              key: 'employment',
              title: 'Employment & payroll',
              purpose:
                'Required to pay you and to meet legal payroll/tax retention obligations. This data is anonymized (not deleted) if you erase your account.',
              items: [
                { label: 'Timecards', value: '38' },
                { label: 'Paycheck stubs', value: '12' },
                { label: 'Events worked', value: '9' },
              ],
            },
          ]
        : []),
      {
        key: 'messages',
        title: 'Messages & notifications',
        purpose: 'Communications sent to and from you.',
        items: [
          { label: 'Messages', value: '21' },
          { label: 'Push devices registered', value: '2' },
        ],
      },
    ],
  };
}

export function mockGetCurrent(subjectId: string): ErasureRequest | null {
  return store.get(subjectId) ?? null;
}

export function mockCreateErasure(
  subject: MockSubject,
  input: CreateErasureRequestInput,
): ErasureRequest {
  const existing = store.get(subject.id);
  if (existing && (existing.status === 'scheduled' || existing.status === 'pending' || existing.status === 'running')) {
    return existing;
  }
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const request: ErasureRequest = {
    id: `er_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    subjectId: subject.id,
    subjectToken: `Redacted Worker #${++seq}`,
    status: 'scheduled',
    source: 'self-service',
    reason: input.reason?.trim() || 'Self-service erasure request',
    executeAfter: new Date(now + DEFAULT_COOLING_OFF_DAYS * DAY_MS).toISOString(),
    coolingOffDays: DEFAULT_COOLING_OFF_DAYS,
    cancelledBy: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  store.set(subject.id, request);
  return request;
}

export function mockCancel(subjectId: string, id: string): ErasureRequest | { error: string } {
  const req = store.get(subjectId);
  if (!req || req.id !== id) return { error: 'not_found' };
  if (req.status !== 'scheduled') return { error: 'not_cancellable' };
  const cancelled: ErasureRequest = {
    ...req,
    status: 'cancelled',
    cancelledBy: { actor: 'self', at: new Date().toISOString() },
    updatedAt: new Date().toISOString(),
  };
  store.set(subjectId, cancelled);
  return cancelled;
}
