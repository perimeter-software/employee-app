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

function formatEventDateLine(iso: string | undefined): string {
  if (!iso?.trim()) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.trim();
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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

function emailBody(introHtml: string, rows: { label: string; value: string }[]) {
  const table = rows
    .map(
      (r) =>
        `<tr><td style="padding:8px 12px;font-weight:600;vertical-align:top;">${escapeHtml(r.label)}</td><td style="padding:8px 12px;">${escapeHtml(r.value)}</td></tr>`
    )
    .join('');
  return `<!DOCTYPE html><html><body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.55;color:#0f172a;font-size:15px;">
${introHtml}
<table style="border-collapse:collapse;margin-top:14px;width:100%;max-width:520px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">${table}</table>
</body></html>`;
}

function managerCoverAcceptedBody(input: {
  fromName: string;
  toName: string;
  eventName: string;
  eventUrl: string;
  eventWhen: string;
}): string {
  const intro = `<div style="max-width:560px;">
<p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#0f172a;">Cover request — coworker accepted</p>
<p style="margin:0 0 16px;color:#334155;">The invited coworker has <strong>accepted</strong> the cover request. Please approve or reject in your admin workflow so the roster can update.</p>
</div>`;
  return emailBody(intro, [
    { label: 'Event', value: input.eventName },
    { label: 'Date & time', value: input.eventWhen },
    { label: 'Requested by', value: input.fromName || '—' },
    { label: 'Accepted by', value: input.toName || '—' },
    { label: 'Event URL slug', value: input.eventUrl },
  ]);
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
    eventUrl: string;
    notes?: string;
  }
): Promise<void> {
  const who = await getApplicantDisplayName(db, input.fromEmployeeId);
  const intro = `<p>${escapeHtml(who || 'An employee')} submitted a <strong>call-off</strong> request for the event below. They remain responsible for working the event until the request is confirmed.</p>`;
  const rows: { label: string; value: string }[] = [
    { label: 'Event', value: input.eventName },
    { label: 'Event URL slug', value: input.eventUrl },
  ];
  if (input.notes) rows.push({ label: 'Notes', value: input.notes });
  await safeQueue(
    db,
    input.managerEmail,
    'Event call-off request',
    emailBody(intro, rows)
  );
}

export async function notifyEventManagerCoverPeerAccepted(
  db: Db,
  input: {
    managerEmail: string;
    fromEmployeeId: string;
    toEmployeeId: string;
    eventName: string;
    eventUrl: string;
    eventDate: string;
  }
): Promise<void> {
  const [fromName, toName] = await Promise.all([
    getApplicantDisplayName(db, input.fromEmployeeId),
    getApplicantDisplayName(db, input.toEmployeeId),
  ]);
  const html = managerCoverAcceptedBody({
    fromName,
    toName,
    eventName: input.eventName,
    eventUrl: input.eventUrl,
    eventWhen: formatEventDateLine(input.eventDate),
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
    eventUrl: string;
    eventDate: string;
  }
): Promise<void> {
  const to = await applicantEmail(db, input.toEmployeeId);
  const fromName = await getApplicantDisplayName(db, input.fromEmployeeId);
  const whenLine = formatEventDateLine(input.eventDate);
  const intro = `<p>${escapeHtml(fromName || 'A coworker')} asked you to cover them for the event below. Sign in to the employee app to accept or decline.</p>`;
  const html = emailBody(intro, [
    { label: 'Event', value: input.eventName },
    { label: 'Date & time', value: whenLine },
    { label: 'Event URL slug', value: input.eventUrl },
  ]);
  await safeQueue(db, to, 'Event cover request', html);
}

export async function notifyEventCoverAcceptedByPeer(
  db: Db,
  input: {
    fromEmployeeId: string;
    toEmployeeId: string;
    eventName: string;
    eventDate: string;
  }
): Promise<void> {
  const to = await applicantEmail(db, input.fromEmployeeId);
  const peer = await getApplicantDisplayName(db, input.toEmployeeId);
  const whenLine = formatEventDateLine(input.eventDate);
  const html = emailBody(
    `<p><strong>${escapeHtml(peer || 'Your coworker')}</strong> accepted your event cover request for <strong>${escapeHtml(input.eventName)}</strong>. It is pending administrator approval.</p>`,
    [{ label: 'Date & time', value: whenLine }]
  );
  await safeQueue(db, to, 'Event cover — coworker accepted', html);
}

export async function notifyEventCoverDeclinedByPeer(
  db: Db,
  input: {
    fromEmployeeId: string;
    toEmployeeId: string;
    eventName: string;
    eventDate: string;
  }
): Promise<void> {
  const to = await applicantEmail(db, input.fromEmployeeId);
  const peer = await getApplicantDisplayName(db, input.toEmployeeId);
  const whenLine = formatEventDateLine(input.eventDate);
  const html = emailBody(
    `<p><strong>${escapeHtml(peer || 'Your coworker')}</strong> declined your event cover request for <strong>${escapeHtml(input.eventName)}</strong>.</p>`,
    [{ label: 'Date & time', value: whenLine }]
  );
  await safeQueue(db, to, 'Event cover — declined', html);
}

export async function notifyEventCoverApprovedByAdmin(
  db: Db,
  input: {
    fromEmployeeId: string;
    toEmployeeId: string;
    eventName: string;
  }
): Promise<void> {
  const [toFrom, toTo] = await Promise.all([
    applicantEmail(db, input.fromEmployeeId),
    applicantEmail(db, input.toEmployeeId),
  ]);
  const html = emailBody(
    `<p>An administrator approved the event cover for ${escapeHtml(input.eventName)}. The roster has been updated.</p>`,
    [{ label: 'Event', value: input.eventName }]
  );
  await safeQueue(db, toFrom, 'Event cover approved', html);
  await safeQueue(db, toTo, 'Event cover approved', html);
}

export async function notifyEventCoverRejectedByAdmin(
  db: Db,
  input: { fromEmployeeId: string; eventName: string }
): Promise<void> {
  const to = await applicantEmail(db, input.fromEmployeeId);
  const html = emailBody(
    `<p>Your event cover request for ${escapeHtml(input.eventName)} was not approved.</p>`,
    [{ label: 'Event', value: input.eventName }]
  );
  await safeQueue(db, to, 'Event cover not approved', html);
}
