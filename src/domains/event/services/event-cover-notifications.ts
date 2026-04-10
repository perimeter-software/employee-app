import 'server-only';

import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { emailService } from '@/lib/services/email-service';
import { sendQueuedEmail } from '@/lib/services/email-queue';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Matches swap notification layout (`swap-notifications.ts`) for consistent branding. */
function shiftDetailRowsHtml(rows: { label: string; value: string }[]): string {
  const body = rows
    .map(
      (r, i) => `<tr>
<td style="padding:12px 16px;font-size:13px;font-weight:600;color:#475569;width:34%;vertical-align:top;border-bottom:${i < rows.length - 1 ? '1px solid #e2e8f0' : 'none'};">${escapeHtml(r.label)}</td>
<td style="padding:12px 16px;font-size:14px;color:#0f172a;vertical-align:top;border-bottom:${i < rows.length - 1 ? '1px solid #e2e8f0' : 'none'};">${escapeHtml(r.value)}</td>
</tr>`
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:22px 0;border-collapse:separate;border-spacing:0;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;overflow:hidden;">${body}</table>`;
}

function wrapShiftEmailDocument(innerBodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background-color:#eef2f7;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#eef2f7;padding:28px 14px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
<tr><td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:22px 26px;">
<p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:21px;color:#ffffff;font-weight:600;letter-spacing:0.02em;">Employee App</p>
<p style="margin:10px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:rgba(255,255,255,0.88);line-height:1.4;">Scheduling &amp; shift updates</p>
</td></tr>
<tr><td style="padding:30px 26px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.65;color:#1e293b;">
${innerBodyHtml}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function emailGreetingName(displayName: string): string {
  const t = displayName.trim();
  return t || 'Colleague';
}

function buildEventAppEmail(options: {
  greetingName?: string;
  introHtml: string;
  detailRows: { label: string; value: string }[];
  closingHtml?: string;
}): string {
  const greetingBlock = options.greetingName
    ? `<p style="margin:0 0 8px;font-size:18px;color:#0f172a;font-weight:600;">Dear ${escapeHtml(emailGreetingName(options.greetingName))},</p>`
    : '';
  const inner = `${greetingBlock}
${options.introHtml}
${shiftDetailRowsHtml(options.detailRows)}
${options.closingHtml ?? ''}`;
  return wrapShiftEmailDocument(inner);
}

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
  await safeQueue(
    db,
    input.managerEmail,
    'Event call-off request',
    buildEventAppEmail({ introHtml: intro, detailRows: rows })
  );
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
  const html = buildEventAppEmail({
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
  });
  await safeQueue(
    db,
    input.managerEmail,
    'Event cover — coworker accepted',
    html
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
  const html = buildEventAppEmail({
    greetingName: toDisplayName,
    introHtml: intro,
    detailRows: [
      { label: 'Event', value: input.eventName },
      { label: 'Date & time', value: whenLine },
    ],
  });
  await safeQueue(db, to, 'Event cover request', html);
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
  const html = buildEventAppEmail({
    greetingName: fromName,
    introHtml: intro,
    detailRows: [{ label: 'Date & time', value: whenLine }],
    closingHtml: `<p style="margin:22px 0 0;font-size:14px;color:#64748b;">We will notify you again once an administrator has acted on this request.</p>`,
  });
  await safeQueue(db, to, 'Event cover — coworker accepted', html);
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
  const html = buildEventAppEmail({
    greetingName: fromName,
    introHtml: intro,
    detailRows: [{ label: 'Date & time', value: whenLine }],
  });
  await safeQueue(db, to, 'Event cover — declined', html);
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
  const htmlFrom = buildEventAppEmail({
    greetingName: fromName,
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
  const htmlTo = buildEventAppEmail({
    greetingName: toName,
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
  await safeQueue(db, toFrom, 'Event cover approved', htmlFrom);
  await safeQueue(db, toTo, 'Event cover approved', htmlTo);
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
  const html = buildEventAppEmail({
    greetingName: fromName,
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
  await safeQueue(db, to, 'Event cover not approved', html);
}
