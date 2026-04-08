import 'server-only';

import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { GignologyJob } from '@/domains/job/types/job.types';
import { emailService } from '@/lib/services/email-service';
import { sendQueuedEmail } from '@/lib/services/email-queue';
import { findJobByJobSlug } from '@/domains/swap/utils/swap-roster-utils';

/** Calendar YYYY-MM-DD → e.g. "April 12, 2026" (date-only, UTC). */
function formatCalendarDateYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim());
  if (!m) return String(ymd).trim();
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo, d, 12, 0, 0));
  return dt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function jobAndShiftDisplayNames(
  job: GignologyJob | null,
  shiftSlug: string,
  jobSlugFallback: string
): { jobName: string; shiftName: string } {
  const slug = shiftSlug?.trim() || '';
  const jobName =
    (typeof job?.title === 'string' && job.title.trim()) || jobSlugFallback;
  const shift = job?.shifts?.find((s) => s.slug === slug);
  const shiftName =
    (typeof shift?.shiftName === 'string' && shift.shiftName.trim()) || slug;
  return { jobName, shiftName };
}

async function applicantDisplayName(
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

/** Salutation when first/last are missing in DB. */
function emailGreetingName(displayName: string): string {
  const t = displayName.trim();
  return t || 'Colleague';
}

/** "A coworker, **Name**, …" vs "A coworker …" when name unknown. */
function coworkerNamedClause(displayName: string, restSentence: string): string {
  const t = displayName.trim();
  if (t) {
    return `A coworker, <strong>${escapeHtml(t)}</strong>, ${restSentence}`;
  }
  return `A coworker ${restSentence}`;
}

async function loadSwapEmailContext(
  db: Db,
  doc: SwapDocLike
): Promise<{
  jobName: string;
  shiftName: string;
  dateFormatted: string;
}> {
  const jobSlug = doc.jobSlug?.trim() || '';
  const jobRecord = jobSlug
    ? await findJobByJobSlug(db, jobSlug)
    : null;
  const { jobName, shiftName } = jobAndShiftDisplayNames(
    jobRecord,
    doc.fromShiftSlug,
    jobSlug
  );
  const dateFormatted = formatCalendarDateYmd(doc.fromShiftDate || '');
  return { jobName, shiftName, dateFormatted };
}

function shiftDetailRowsHtml(
  rows: { label: string; value: string }[]
): string {
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

/** Inline-styled HTML suitable for SES; all dynamic text must be passed through escapeHtml at call sites except this wrapper. */
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

function buildEmployeeShiftEmail(options: {
  greetingName: string;
  introHtml: string;
  detailRows: { label: string; value: string }[];
  closingHtml?: string;
}): string {
  const g = escapeHtml(options.greetingName);
  const inner = `<p style="margin:0 0 8px;font-size:18px;color:#0f172a;font-weight:600;">Dear ${g},</p>
${options.introHtml}
${shiftDetailRowsHtml(options.detailRows)}
${options.closingHtml ?? ''}`;
  return wrapShiftEmailDocument(inner);
}

/**
 * Default: `sendQueuedEmail` → Bull → worker → SES. When `EMAIL_DIRECT_SEND=true`, uses
 * `emailService.sendEmail` (SES from this process, same as shift-requests / invoices).
 * In local dev, real sends require `SES_SEND_IN_DEV=true` (same guard as `email-queue` / `email-service`).
 */

type SwapDocLike = {
  type: string;
  status: string;
  jobSlug: string;
  fromEmployeeId: string;
  fromShiftSlug: string;
  fromShiftDate: string;
  toEmployeeId?: string | null;
  toShiftSlug?: string | null;
  toShiftDate?: string | null;
  acceptAny?: boolean;
};

/** Logged with every swap notification email (no HTML bodies — use event + ids/dates for debugging). */
type SwapEmailLogContext = {
  event: string;
  jobSlug?: string;
  fromShiftDate?: string;
  fromShiftSlug?: string;
  toShiftDate?: string | null;
  toShiftSlug?: string | null;
  fromEmployeeId?: string;
  toEmployeeId?: string | null;
  /** Applicant id we resolved `to` from (when applicable). */
  recipientApplicantId?: string;
  extra?: Record<string, unknown>;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function applicantEmail(
  db: Db,
  applicantId: string
): Promise<string | null> {
  if (!ObjectId.isValid(applicantId)) return null;
  const doc = await db.collection('applicants').findOne(
    { _id: new ObjectId(applicantId) },
    { projection: { email: 1 } }
  );
  const email = doc?.email;
  return typeof email === 'string' && email.trim() ? email.trim() : null;
}

async function safeQueue(
  db: Db,
  to: string | null | undefined,
  subject: string,
  html: string,
  log?: SwapEmailLogContext
): Promise<void> {
  const event = log?.event ?? 'swap-email';
  if (!to) {
    console.warn('[swap-notifications] email skipped — no recipient address', {
      event,
      subject,
      jobSlug: log?.jobSlug,
      shiftDate: log?.fromShiftDate,
      shiftSlug: log?.fromShiftSlug,
      fromEmployeeId: log?.fromEmployeeId,
      toEmployeeId: log?.toEmployeeId,
      recipientApplicantId: log?.recipientApplicantId,
      ...log?.extra,
    });
    return;
  }

  console.log('[swap-notifications] queue email →', {
    event,
    to,
    subject,
    jobSlug: log?.jobSlug,
    shiftDate: log?.fromShiftDate,
    shiftSlug: log?.fromShiftSlug,
    offerShiftDate: log?.toShiftDate,
    offerShiftSlug: log?.toShiftSlug,
    fromEmployeeId: log?.fromEmployeeId,
    toEmployeeId: log?.toEmployeeId,
    recipientApplicantId: log?.recipientApplicantId,
    ...log?.extra,
  });

  try {
    if (process.env.EMAIL_DIRECT_SEND === 'true') {
      await emailService.sendEmail({ to, subject, html, db });
      console.log('[swap-notifications] direct email ←', {
        event,
        to,
        subject,
        success: true,
      });
      return;
    }

    const result = await sendQueuedEmail({ to, subject, html }, db);
    console.log('[swap-notifications] queue email ←', {
      event,
      to,
      subject,
      success: result.success,
      detail: result.message,
    });
  } catch (e) {
    console.error('[swap-notifications] email failed', {
      event,
      to,
      subject,
      direct: process.env.EMAIL_DIRECT_SEND === 'true',
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

function eventManagerEmailsFromJob(job: GignologyJob | null): string[] {
  const list = job?.additionalConfig?.eventManagerNotificationRecipients;
  if (!Array.isArray(list)) return [];
  const emails = list
    .map((r) => (typeof r?.email === 'string' ? r.email.trim() : ''))
    .filter((e) => e.includes('@'));
  return [...new Set(emails)];
}

/**
 * Notify job event managers that a swap/giveaway needs admin approval.
 * Recipients only: `job.additionalConfig.eventManagerNotificationRecipients[].email`.
 */
async function notifyAdminsPendingSwap(
  db: Db,
  summary: string,
  jobSlug: string
): Promise<void> {
  try {
    const job = await findJobByJobSlug(db, jobSlug.trim());
    const recipients = eventManagerEmailsFromJob(job);

    if (recipients.length === 0) {
      console.warn(
        '[swap-notifications] pending-approval email skipped: job has no eventManagerNotificationRecipients',
        jobSlug
      );
      return;
    }

    const adminHtml = wrapShiftEmailDocument(
      `<p style="margin:0 0 8px;font-size:18px;color:#0f172a;font-weight:600;">Hello,</p>
<p style="margin:0 0 14px;">${escapeHtml(summary)}</p>
<p style="margin:0;">Please open the admin schedule tools to <strong>approve</strong> or <strong>reject</strong> this request.</p>`
    );

    await Promise.all(
      recipients.map((adminTo) =>
        safeQueue(
          db,
          adminTo,
          'Shift swap — pending your approval',
          adminHtml,
          {
            event: 'admin-pending-approval',
            jobSlug: jobSlug.trim(),
            extra: { adminRecipient: true },
          }
        )
      )
    );
  } catch (e) {
    console.error('[swap-notifications] admin notify failed', e);
  }
}

/** After POST create — directed swap / giveaway with a named peer. */
export async function notifySwapRequestCreated(
  db: Db,
  doc: SwapDocLike
): Promise<void> {
  try {
    const ctx = await loadSwapEmailContext(db, doc);
    const fromName = await applicantDisplayName(db, doc.fromEmployeeId);

    if (doc.type === 'swap' && doc.toEmployeeId) {
      const to = await applicantEmail(db, doc.toEmployeeId);
      const peerName = await applicantDisplayName(db, doc.toEmployeeId);
      const swapLine = coworkerNamedClause(
        fromName,
        'has requested a shift swap that involves you. Please review the details below and sign in to the employee app to accept or decline.'
      );
      const intro = `<p style="margin:0 0 14px;">I hope this message finds you well.</p>
<p style="margin:0 0 14px;">${swapLine}</p>`;
      const closing = `<p style="margin:16px 0 0;">Thank you for your prompt attention.</p>`;
      const html = buildEmployeeShiftEmail({
        greetingName: emailGreetingName(peerName),
        introHtml: intro,
        detailRows: [
          { label: 'Job', value: ctx.jobName },
          { label: 'Shift', value: ctx.shiftName },
          { label: 'Shift Date', value: ctx.dateFormatted },
        ],
        closingHtml: closing,
      });
      await safeQueue(db, to, 'Shift swap request', html, {
        event: 'swap-request-created-peer',
        jobSlug: doc.jobSlug,
        fromShiftDate: doc.fromShiftDate,
        fromShiftSlug: doc.fromShiftSlug,
        toShiftDate: doc.toShiftDate,
        toShiftSlug: doc.toShiftSlug,
        fromEmployeeId: doc.fromEmployeeId,
        toEmployeeId: doc.toEmployeeId,
        recipientApplicantId: doc.toEmployeeId,
      });
    }

    if (doc.type === 'giveaway' && doc.toEmployeeId) {
      const to = await applicantEmail(db, doc.toEmployeeId);
      const peerName = await applicantDisplayName(db, doc.toEmployeeId);
      let extraTagged = '';
      if (doc.toShiftDate && doc.toShiftDate !== doc.fromShiftDate) {
        extraTagged = `<p style="margin:14px 0 0;font-size:14px;color:#475569;"><strong>Pickup interest date (tagged):</strong> ${escapeHtml(formatCalendarDateYmd(doc.toShiftDate))}</p>`;
      }
      const offerLine = coworkerNamedClause(
        fromName,
        'has offered a shift for you to take, pending administrative approval. Please find the details below:'
      );
      const intro = `<p style="margin:0 0 14px;">I hope this message finds you well.</p>
<p style="margin:0 0 14px;">${offerLine}</p>${extraTagged}`;
      const html = buildEmployeeShiftEmail({
        greetingName: emailGreetingName(peerName),
        introHtml: intro,
        detailRows: [
          { label: 'Job', value: ctx.jobName },
          { label: 'Shift', value: ctx.shiftName },
          { label: 'Shift Date', value: ctx.dateFormatted },
        ],
      });
      await safeQueue(db, to, 'Shift offered to you', html, {
        event: 'giveaway-directed-created-peer',
        jobSlug: doc.jobSlug,
        fromShiftDate: doc.fromShiftDate,
        fromShiftSlug: doc.fromShiftSlug,
        toShiftDate: doc.toShiftDate,
        toShiftSlug: doc.toShiftSlug,
        fromEmployeeId: doc.fromEmployeeId,
        toEmployeeId: doc.toEmployeeId,
        recipientApplicantId: doc.toEmployeeId,
      });
    }

    // TODO: Option 1 accept-any (no named peer) — broadcast to eligible coworkers on the shift roster.
  } catch (e) {
    console.error('[swap-notifications] notifySwapRequestCreated failed', e);
  }
}

const SWAP_REQUESTS_COLLECTION = 'swap-requests' as const;

/**
 * Open giveaway (no named recipient): notify employees with matching `pickup_interest`
 * for the same job, shift, and calendar day.
 */
export async function notifyPickupSeekersOfOpenGiveaway(
  db: Db,
  doc: SwapDocLike
): Promise<void> {
  if (doc.type !== 'giveaway') return;
  if (doc.toEmployeeId != null && String(doc.toEmployeeId).trim() !== '') {
    return;
  }
  const shiftSlug = doc.fromShiftSlug?.trim();
  const dateYmd = doc.fromShiftDate?.trim();
  const jobSlug = doc.jobSlug?.trim();
  if (!jobSlug || !shiftSlug || !dateYmd) {
    console.warn(
      '[swap-notifications] pickup seeker notify skipped: missing job/shift/date on giveaway'
    );
    return;
  }

  try {
    const rows = await db
      .collection(SWAP_REQUESTS_COLLECTION)
      .find({
        jobSlug,
        type: 'pickup_interest',
        status: { $in: ['pending_match', 'pending_approval'] },
        fromShiftDate: dateYmd,
        fromEmployeeId: { $ne: doc.fromEmployeeId },
        $or: [{ fromShiftSlug: shiftSlug }, { shiftSlug: shiftSlug }],
      })
      .project({ fromEmployeeId: 1 })
      .toArray();

    const seen = new Set<string>();
    const jobRecord = await findJobByJobSlug(db, jobSlug);
    const { jobName, shiftName } = jobAndShiftDisplayNames(
      jobRecord,
      shiftSlug,
      jobSlug
    );
    const dateFormatted = formatCalendarDateYmd(dateYmd);
    const giverName = await applicantDisplayName(db, doc.fromEmployeeId);
    const offerLead = giverName.trim()
      ? `<p style="margin:0 0 14px;"><strong>${escapeHtml(giverName)}</strong> is offering a shift on a job and day where you showed interest in picking up work. Details are below.</p>`
      : `<p style="margin:0 0 14px;">A coworker is offering a shift on a job and day where you showed interest in picking up work. Details are below.</p>`;

    for (const row of rows) {
      const sid = String(row.fromEmployeeId);
      if (seen.has(sid)) continue;
      seen.add(sid);
      const to = await applicantEmail(db, sid);
      const seekerName = await applicantDisplayName(db, sid);
      const intro = `<p style="margin:0 0 14px;">I hope this message finds you well.</p>
${offerLead}`;
      const closing = `<p style="margin:16px 0 0;">Sign in to the employee app to see whether this offer is still available.</p>`;
      const html = buildEmployeeShiftEmail({
        greetingName: emailGreetingName(seekerName),
        introHtml: intro,
        detailRows: [
          { label: 'Job', value: jobName },
          { label: 'Shift', value: shiftName },
          { label: 'Shift Date', value: dateFormatted },
        ],
        closingHtml: closing,
      });
      await safeQueue(
        db,
        to,
        'Shift you may want — coworker offering a day',
        html,
        {
          event: 'open-giveaway-notify-pickup-seeker',
          jobSlug,
          fromShiftDate: dateYmd,
          fromShiftSlug: shiftSlug,
          fromEmployeeId: doc.fromEmployeeId,
          recipientApplicantId: sid,
          extra: { matchingPickupInterestDay: dateYmd },
        }
      );
    }
  } catch (e) {
    console.error(
      '[swap-notifications] notifyPickupSeekersOfOpenGiveaway failed',
      e
    );
  }
}

/** After employee claims an open or directed giveaway — notify initiator + job event managers (if configured). */
export async function notifyGiveawayClaimedByPeer(
  db: Db,
  doc: SwapDocLike
): Promise<void> {
  try {
    if (doc.type !== 'giveaway') return;
    const ctx = await loadSwapEmailContext(db, doc);
    const from = await applicantEmail(db, doc.fromEmployeeId);
    const giverName = await applicantDisplayName(db, doc.fromEmployeeId);
    const takerName = doc.toEmployeeId
      ? await applicantDisplayName(db, doc.toEmployeeId)
      : '';
    const acceptLine = takerName.trim()
      ? `<p style="margin:0 0 14px;"><strong>${escapeHtml(takerName)}</strong> has agreed to take this shift, pending administrator approval.</p>`
      : `<p style="margin:0 0 14px;">A coworker has agreed to take this shift, pending administrator approval.</p>`;
    const intro = `<p style="margin:0 0 14px;">I hope this message finds you well.</p>
${acceptLine}`;
    const html = buildEmployeeShiftEmail({
      greetingName: emailGreetingName(giverName),
      introHtml: intro,
      detailRows: [
        { label: 'Job', value: ctx.jobName },
        { label: 'Shift', value: ctx.shiftName },
        { label: 'Shift Date', value: ctx.dateFormatted },
      ],
    });
    await safeQueue(db, from, 'Your shift offer was accepted', html, {
      event: 'giveaway-claimed-notify-giver',
      jobSlug: doc.jobSlug,
      fromShiftDate: doc.fromShiftDate,
      fromShiftSlug: doc.fromShiftSlug,
      fromEmployeeId: doc.fromEmployeeId,
      toEmployeeId: doc.toEmployeeId,
      recipientApplicantId: doc.fromEmployeeId,
    });
    await notifyAdminsPendingSwap(
      db,
      `A shift giveaway is ready for approval: ${ctx.jobName} on ${ctx.dateFormatted}.`,
      doc.jobSlug
    );
  } catch (e) {
    console.error('[swap-notifications] notifyGiveawayClaimedByPeer failed', e);
  }
}

/** After peer PATCH accept — notify initiator + job event managers (if configured). */
export async function notifySwapAcceptedByPeer(
  db: Db,
  doc: SwapDocLike
): Promise<void> {
  try {
    if (doc.type !== 'swap') return;
    const ctx = await loadSwapEmailContext(db, doc);
    const from = await applicantEmail(db, doc.fromEmployeeId);
    const initiatorName = await applicantDisplayName(db, doc.fromEmployeeId);
    const peerName = doc.toEmployeeId
      ? await applicantDisplayName(db, doc.toEmployeeId)
      : '';
    const agreeLine = peerName.trim()
      ? `<p style="margin:0 0 14px;"><strong>${escapeHtml(peerName)}</strong> has agreed to the shift swap. The request is now waiting for administrator approval.</p>`
      : `<p style="margin:0 0 14px;">The other employee has agreed to the shift swap. The request is now waiting for administrator approval.</p>`;
    const intro = `<p style="margin:0 0 14px;">I hope this message finds you well.</p>
${agreeLine}`;
    const closing = `<p style="margin:16px 0 0;">We will notify you again once an administrator has acted on this request.</p>`;
    const html = buildEmployeeShiftEmail({
      greetingName: emailGreetingName(initiatorName),
      introHtml: intro,
      detailRows: [
        { label: 'Job', value: ctx.jobName },
        { label: 'Shift', value: ctx.shiftName },
        { label: 'Shift Date', value: ctx.dateFormatted },
      ],
      closingHtml: closing,
    });
    await safeQueue(db, from, 'Your shift swap was matched', html, {
      event: 'swap-accepted-notify-initiator',
      jobSlug: doc.jobSlug,
      fromShiftDate: doc.fromShiftDate,
      fromShiftSlug: doc.fromShiftSlug,
      toShiftDate: doc.toShiftDate,
      toShiftSlug: doc.toShiftSlug,
      fromEmployeeId: doc.fromEmployeeId,
      toEmployeeId: doc.toEmployeeId,
      recipientApplicantId: doc.fromEmployeeId,
    });
    await notifyAdminsPendingSwap(
      db,
      `A shift swap is ready for approval: ${ctx.jobName} on ${ctx.dateFormatted}.`,
      doc.jobSlug
    );
  } catch (e) {
    console.error('[swap-notifications] notifySwapAcceptedByPeer failed', e);
  }
}

function approvedEmailCopy(doc: SwapDocLike): { subject: string; leadHtml: string } {
  const t = doc.type;
  if (t === 'giveaway') {
    return {
      subject: 'Shift offer approved',
      leadHtml:
        'Great news — an administrator has <strong>approved</strong> the shift offer described below. Your published schedule has been updated.',
    };
  }
  if (t === 'pickup_interest') {
    return {
      subject: 'Shift pickup approved',
      leadHtml:
        'Great news — an administrator has <strong>approved</strong> your shift pickup request. Your published schedule has been updated.',
    };
  }
  return {
    subject: 'Shift swap approved',
    leadHtml:
      'Great news — an administrator has <strong>approved</strong> your shift swap. Your published schedule has been updated.',
  };
}

export async function notifySwapApprovedByAdmin(
  db: Db,
  doc: SwapDocLike
): Promise<void> {
  try {
    const ctx = await loadSwapEmailContext(db, doc);
    const { subject, leadHtml } = approvedEmailCopy(doc);
    const closing = `<p style="margin:16px 0 0;">If anything looks incorrect, please contact your manager or scheduling team.</p>`;

    const buildForRecipient = async (applicantId: string) => {
      const name = await applicantDisplayName(db, applicantId);
      const intro = `<p style="margin:0 0 14px;">I hope this message finds you well.</p>
<p style="margin:0 0 14px;">${leadHtml}</p>`;
      return buildEmployeeShiftEmail({
        greetingName: emailGreetingName(name),
        introHtml: intro,
        detailRows: [
          { label: 'Job', value: ctx.jobName },
          { label: 'Shift', value: ctx.shiftName },
          { label: 'Shift Date', value: ctx.dateFormatted },
        ],
        closingHtml: closing,
      });
    };

    const a = await applicantEmail(db, doc.fromEmployeeId);
    await safeQueue(db, a, subject, await buildForRecipient(doc.fromEmployeeId), {
      event: 'admin-approved-notify-from',
      jobSlug: doc.jobSlug,
      fromShiftDate: doc.fromShiftDate,
      fromShiftSlug: doc.fromShiftSlug,
      fromEmployeeId: doc.fromEmployeeId,
      toEmployeeId: doc.toEmployeeId,
      recipientApplicantId: doc.fromEmployeeId,
    });
    if (doc.toEmployeeId) {
      const b = await applicantEmail(db, doc.toEmployeeId);
      await safeQueue(
        db,
        b,
        subject,
        await buildForRecipient(doc.toEmployeeId),
        {
          event: 'admin-approved-notify-to',
          jobSlug: doc.jobSlug,
          fromShiftDate: doc.fromShiftDate,
          fromShiftSlug: doc.fromShiftSlug,
          fromEmployeeId: doc.fromEmployeeId,
          toEmployeeId: doc.toEmployeeId,
          recipientApplicantId: doc.toEmployeeId,
        }
      );
    }
  } catch (e) {
    console.error('[swap-notifications] notifySwapApprovedByAdmin failed', e);
  }
}

function rejectedEmailCopy(doc: SwapDocLike): { subject: string; leadHtml: string } {
  const t = doc.type;
  if (t === 'giveaway') {
    return {
      subject: 'Shift offer update',
      leadHtml:
        'An administrator has <strong>not approved</strong> this shift offer. Your published schedule was <strong>not</strong> changed.',
    };
  }
  if (t === 'pickup_interest') {
    return {
      subject: 'Shift pickup update',
      leadHtml:
        'An administrator has <strong>not approved</strong> this shift pickup request. Your published schedule was <strong>not</strong> changed.',
    };
  }
  return {
    subject: 'Shift swap update',
    leadHtml:
      'An administrator has <strong>not approved</strong> this shift swap request. Your published schedule was <strong>not</strong> changed.',
  };
}

export async function notifySwapRejectedByAdmin(
  db: Db,
  doc: SwapDocLike
): Promise<void> {
  try {
    const ctx = await loadSwapEmailContext(db, doc);
    const { subject, leadHtml } = rejectedEmailCopy(doc);
    const initiatorName = await applicantDisplayName(db, doc.fromEmployeeId);
    const intro = `<p style="margin:0 0 14px;">I hope this message finds you well.</p>
<p style="margin:0 0 14px;">${leadHtml}</p>`;
    const closing = `<p style="margin:16px 0 0;">If you have questions, please reach out to your manager or scheduling team.</p>`;
    const html = buildEmployeeShiftEmail({
      greetingName: emailGreetingName(initiatorName),
      introHtml: intro,
      detailRows: [
        { label: 'Job', value: ctx.jobName },
        { label: 'Shift', value: ctx.shiftName },
        { label: 'Shift Date', value: ctx.dateFormatted },
      ],
      closingHtml: closing,
    });
    const a = await applicantEmail(db, doc.fromEmployeeId);
    await safeQueue(db, a, subject, html, {
      event: 'admin-rejected-notify-initiator',
      jobSlug: doc.jobSlug,
      fromShiftDate: doc.fromShiftDate,
      fromShiftSlug: doc.fromShiftSlug,
      fromEmployeeId: doc.fromEmployeeId,
      toEmployeeId: doc.toEmployeeId,
      recipientApplicantId: doc.fromEmployeeId,
      extra: { requestType: doc.type },
    });
  } catch (e) {
    console.error('[swap-notifications] notifySwapRejectedByAdmin failed', e);
  }
}
