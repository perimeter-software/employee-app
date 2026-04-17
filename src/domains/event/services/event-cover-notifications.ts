import 'server-only';

import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { emailService } from '@/lib/services/email-service';
import { sendQueuedEmail } from '@/lib/services/email-queue';
import {
  buildDearGreetingLine,
  buildSchedulingInnerHtml,
  escapeHtml,
} from '@/lib/email/employee-app-email-layout';
import { resolveSchedulingNotificationEmail } from '@/lib/email/scheduling-notification-email';

const EVENT_EMAIL_TZ_FALLBACK = 'America/Chicago';

function resolveEmailTimeZone(preferredTimeZone?: string): string {
  const tz = preferredTimeZone?.trim();
  if (tz) return tz;
  try {
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (localTz?.trim()) return localTz;
  } catch {
    // Ignore and fall through to fixed fallback.
  }
  return EVENT_EMAIL_TZ_FALLBACK;
}

function formatEventDateLine(
  iso: string | undefined,
  preferredTimeZone?: string
): string {
  if (!iso?.trim()) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.trim();
  const timeZone = resolveEmailTimeZone(preferredTimeZone);
  const withDateTime = d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });
  const zoneLabel = d.toLocaleString('en-US', {
    timeZone,
    timeZoneName: 'short',
  });
  const zone = zoneLabel.split(',').pop()?.trim() || timeZone;
  return `${withDateTime} (${zone})`;
}

async function applicantEmail(
  db: Db,
  applicantId: string
): Promise<string | null> {
  if (!ObjectId.isValid(applicantId)) return null;
  const doc = await db.collection('applicants').findOne(
    { _id: new ObjectId(applicantId) },
    { projection: { email: 1, emailAddress: 1 } }
  );
  const raw = doc?.email ?? doc?.emailAddress;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

export async function getApplicantDisplayName(
  db: Db,
  applicantId: string
): Promise<string> {
  if (!ObjectId.isValid(applicantId)) return '';
  const doc = await db.collection('applicants').findOne(
    { _id: new ObjectId(applicantId) },
    { projection: { firstName: 1, lastName: 1 } }
  );
  const fn = typeof doc?.firstName === 'string' ? doc.firstName.trim() : '';
  const ln = typeof doc?.lastName === 'string' ? doc.lastName.trim() : '';
  return [fn, ln].filter(Boolean).join(' ');
}

async function safeQueue(
  db: Db,
  to: string | null | undefined,
  subject: string,
  html: string
): Promise<void> {
  if (!to) {
    console.warn('[event-cover-notifications] email skipped — no recipient', {
      subject,
    });
    return;
  }
  try {
    if (process.env.EMAIL_DIRECT_SEND === 'true') {
      await emailService.sendEmail({ to, subject, html, db });
      return;
    }
    await sendQueuedEmail({ to, subject, html }, db);
  } catch (e) {
    console.error('[event-cover-notifications] email failed', e);
  }
}

async function queueSchedulingHtml(
  db: Db,
  to: string | null | undefined,
  subjectLine: string,
  inner: Parameters<typeof buildSchedulingInnerHtml>[0]
): Promise<void> {
  const innerBody = buildSchedulingInnerHtml(inner);
  const { subject, html } = await resolveSchedulingNotificationEmail(
    db,
    subjectLine,
    innerBody
  );
  await safeQueue(db, to, subject, html);
}

export function getEventManagerEmailFromEventDoc(
  event: unknown
): string | null {
  if (!event || typeof event !== 'object') return null;
  const em = (event as { eventManager?: { email?: string } }).eventManager
    ?.email;
  return typeof em === 'string' && em.trim() ? em.trim() : null;
}

export async function notifyEventManagerCallOff(
  db: Db,
  input: {
    managerEmail: string;
    fromEmployeeId: string;
    eventName: string;
    eventDate: string;
    eventTimeZone?: string;
    notes?: string;
  }
): Promise<void> {
  const who = await getApplicantDisplayName(db, input.fromEmployeeId);
  const intro = `<p style="margin:0 0 18px;">${escapeHtml(who || 'An employee')} submitted a <strong>call-off</strong> request for the event below. They remain responsible for working the event until the request is confirmed.</p>`;
  const rows: { label: string; value: string }[] = [
    { label: 'Event', value: input.eventName },
    {
      label: 'Date & time',
      value: formatEventDateLine(input.eventDate, input.eventTimeZone),
    },
  ];
  if (input.notes) rows.push({ label: 'Notes', value: input.notes });
  await queueSchedulingHtml(db, input.managerEmail, 'Event call-off request', {
    introHtml: intro,
    detailRows: rows,
  });
}

export async function notifyEventManagerCoverPeerAccepted(
  db: Db,
  input: {
    managerEmail: string;
    fromEmployeeId: string;
    toEmployeeId: string;
    eventName: string;
    eventDate: string;
    eventTimeZone?: string;
  }
): Promise<void> {
  const [fromName, toName] = await Promise.all([
    getApplicantDisplayName(db, input.fromEmployeeId),
    getApplicantDisplayName(db, input.toEmployeeId),
  ]);
  const intro = `<p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#0f172a;">Cover request — coworker accepted</p>
<p style="margin:0 0 18px;color:#334155;">The invited coworker has <strong>accepted</strong> the cover request. Please approve or reject in your admin workflow so the roster can update.</p>`;
  await queueSchedulingHtml(
    db,
    input.managerEmail,
    'Event cover — coworker accepted',
    {
      introHtml: intro,
      detailRows: [
        { label: 'Event', value: input.eventName },
        {
          label: 'Date & time',
          value: formatEventDateLine(input.eventDate, input.eventTimeZone),
        },
        { label: 'Requested by', value: fromName || '—' },
        { label: 'Accepted by', value: toName || '—' },
      ],
    }
  );
}

export async function notifyEventCoverRequestCreated(
  db: Db,
  input: {
    toEmployeeId: string;
    fromEmployeeId: string;
    eventName: string;
    eventDate: string;
    eventTimeZone?: string;
  }
): Promise<void> {
  const [to, fromName, toDisplayName] = await Promise.all([
    applicantEmail(db, input.toEmployeeId),
    getApplicantDisplayName(db, input.fromEmployeeId),
    getApplicantDisplayName(db, input.toEmployeeId),
  ]);
  const whenLine = formatEventDateLine(input.eventDate, input.eventTimeZone);
  const intro = `<p style="margin:0 0 18px;">${escapeHtml(fromName || 'A coworker')} asked you to cover them for the event below. Sign in to the employee app to accept or decline.</p>`;
  await queueSchedulingHtml(db, to, 'Event cover request', {
    greetingHtml: buildDearGreetingLine(toDisplayName),
    introHtml: intro,
    detailRows: [
      { label: 'Event', value: input.eventName },
      { label: 'Date & time', value: whenLine },
    ],
  });
}

export async function notifyEventCoverAcceptedByPeer(
  db: Db,
  input: {
    fromEmployeeId: string;
    toEmployeeId: string;
    eventName: string;
    eventDate: string;
    eventTimeZone?: string;
  }
): Promise<void> {
  const [to, fromName] = await Promise.all([
    applicantEmail(db, input.fromEmployeeId),
    getApplicantDisplayName(db, input.fromEmployeeId),
  ]);
  const peer = await getApplicantDisplayName(db, input.toEmployeeId);
  const whenLine = formatEventDateLine(input.eventDate, input.eventTimeZone);
  const intro = `<p style="margin:0 0 18px;"><strong>${escapeHtml(peer || 'Your coworker')}</strong> accepted your event cover request for <strong>${escapeHtml(input.eventName)}</strong>. It is pending administrator approval.</p>`;
  await queueSchedulingHtml(db, to, 'Event cover — coworker accepted', {
    greetingHtml: buildDearGreetingLine(fromName),
    introHtml: intro,
    detailRows: [
      { label: 'Event', value: input.eventName },
      { label: 'Date & time', value: whenLine },
    ],
    closingHtml: `<p style="margin:22px 0 0;font-size:14px;color:#64748b;">We will notify you again once an administrator has acted on this request.</p>`,
  });
}

export async function notifyEventCoverDeclinedByPeer(
  db: Db,
  input: {
    fromEmployeeId: string;
    toEmployeeId: string;
    eventName: string;
    eventDate: string;
    eventTimeZone?: string;
  }
): Promise<void> {
  const [to, fromName] = await Promise.all([
    applicantEmail(db, input.fromEmployeeId),
    getApplicantDisplayName(db, input.fromEmployeeId),
  ]);
  const peer = await getApplicantDisplayName(db, input.toEmployeeId);
  const whenLine = formatEventDateLine(input.eventDate, input.eventTimeZone);
  const intro = `<p style="margin:0 0 18px;"><strong>${escapeHtml(peer || 'Your coworker')}</strong> declined your event cover request for <strong>${escapeHtml(input.eventName)}</strong>.</p>`;
  await queueSchedulingHtml(db, to, 'Event cover — declined', {
    greetingHtml: buildDearGreetingLine(fromName),
    introHtml: intro,
    detailRows: [
      { label: 'Event', value: input.eventName },
      { label: 'Date & time', value: whenLine },
    ],
  });
}

export async function notifyEventCoverApprovedByAdmin(
  db: Db,
  input: {
    fromEmployeeId: string;
    toEmployeeId: string;
    eventName: string;
    eventDate?: string;
    eventTimeZone?: string;
  }
): Promise<void> {
  const [toFrom, toTo] = await Promise.all([
    applicantEmail(db, input.fromEmployeeId),
    applicantEmail(db, input.toEmployeeId),
  ]);
  const [fromName, toName] = await Promise.all([
    getApplicantDisplayName(db, input.fromEmployeeId),
    getApplicantDisplayName(db, input.toEmployeeId),
  ]);
  const intro = `<p style="margin:0 0 18px;">An administrator approved the event cover for <strong>${escapeHtml(input.eventName)}</strong>. The roster has been updated.</p>`;
  const detailRows = [
    { label: 'Event', value: input.eventName },
    ...(input.eventDate
      ? [
          {
            label: 'Date & time',
            value: formatEventDateLine(input.eventDate, input.eventTimeZone),
          },
        ]
      : []),
  ];
  await queueSchedulingHtml(db, toFrom, 'Event cover approved', {
    greetingHtml: buildDearGreetingLine(fromName),
    introHtml: intro,
    detailRows,
  });
  await queueSchedulingHtml(db, toTo, 'Event cover approved', {
    greetingHtml: buildDearGreetingLine(toName),
    introHtml: intro,
    detailRows,
  });
}

export async function notifyEventCoverRejectedByAdmin(
  db: Db,
  input: {
    fromEmployeeId: string;
    eventName: string;
    eventDate?: string;
    eventTimeZone?: string;
  }
): Promise<void> {
  const [to, fromName] = await Promise.all([
    applicantEmail(db, input.fromEmployeeId),
    getApplicantDisplayName(db, input.fromEmployeeId),
  ]);
  const intro = `<p style="margin:0 0 18px;">Your event cover request for <strong>${escapeHtml(input.eventName)}</strong> was not approved.</p>`;
  await queueSchedulingHtml(db, to, 'Event cover not approved', {
    greetingHtml: buildDearGreetingLine(fromName),
    introHtml: intro,
    detailRows: [
      { label: 'Event', value: input.eventName },
      ...(input.eventDate
        ? [
            {
              label: 'Date & time',
              value: formatEventDateLine(input.eventDate, input.eventTimeZone),
            },
          ]
        : []),
    ],
  });
}
