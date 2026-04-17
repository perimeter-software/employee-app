import 'server-only';

import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { GignologyJob } from '@/domains/job/types/job.types';
import { emailService } from '@/lib/services/email-service';
import { sendQueuedEmail } from '@/lib/services/email-queue';
import { findJobByJobSlug } from '@/domains/swap/utils/swap-roster-utils';
import { EVENT_COVER_JOB_SLUG } from '@/domains/event/services/event-cover-constants';
import {
  buildDearGreetingLine,
  buildSchedulingInnerHtml,
  escapeHtml,
} from '@/lib/email/employee-app-email-layout';
import { resolveSchedulingNotificationEmail } from '@/lib/email/scheduling-notification-email';

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

/** Both legs of a swap (initiator vs peer) for clear email copy. */
async function loadSwapTwoSidedContext(
  db: Db,
  doc: SwapDocLike
): Promise<{
  jobName: string;
  fromShiftName: string;
  fromDateFormatted: string;
  toShiftName: string;
  toDateFormatted: string;
}> {
  const jobSlug = doc.jobSlug?.trim() || '';
  const jobRecord = jobSlug
    ? await findJobByJobSlug(db, jobSlug)
    : null;
  const fromSide = jobAndShiftDisplayNames(
    jobRecord,
    doc.fromShiftSlug,
    jobSlug
  );
  const toSlug = doc.toShiftSlug?.trim() || '';
  const toSide = toSlug
    ? jobAndShiftDisplayNames(jobRecord, toSlug, jobSlug)
    : { jobName: fromSide.jobName, shiftName: '—' };
  return {
    jobName: fromSide.jobName,
    fromShiftName: fromSide.shiftName,
    fromDateFormatted: formatCalendarDateYmd(doc.fromShiftDate || ''),
    toShiftName: toSide.shiftName,
    toDateFormatted: doc.toShiftDate?.trim()
      ? formatCalendarDateYmd(doc.toShiftDate)
      : '—',
  };
}

function swapDetailRowsForEmail(
  initiatorDisplayName: string,
  peerDisplayName: string,
  sides: Awaited<ReturnType<typeof loadSwapTwoSidedContext>>
): { label: string; value: string }[] {
  const reqLabel = initiatorDisplayName.trim()
    ? `${initiatorDisplayName.trim()}'s shift`
    : "Requester's shift";
  const peerLabel = peerDisplayName.trim()
    ? `${peerDisplayName.trim()}'s shift`
    : "Coworker's shift";
  return [
    { label: 'Job', value: sides.jobName },
    {
      label: reqLabel,
      value: `${sides.fromShiftName} — ${sides.fromDateFormatted}`,
    },
    {
      label: peerLabel,
      value: `${sides.toShiftName} — ${sides.toDateFormatted}`,
    },
  ];
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

async function queueSchedulingNotificationEmail(
  db: Db,
  to: string | null | undefined,
  subjectLine: string,
  inner: Parameters<typeof buildSchedulingInnerHtml>[0],
  log?: SwapEmailLogContext
): Promise<void> {
  const innerBody = buildSchedulingInnerHtml(inner);
  const { subject, html } = await resolveSchedulingNotificationEmail(
    db,
    subjectLine,
    innerBody
  );
  await safeQueue(db, to, subject, html, log);
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
  requestTypeLabel: string,
  detailRows: { label: string; value: string }[],
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

    const innerBody = buildSchedulingInnerHtml({
      greetingHtml: `<p style="margin:0 0 8px;font-size:18px;color:#0f172a;font-weight:600;">Hello,</p>`,
      introHtml: `<p style="margin:0 0 14px;">A ${escapeHtml(requestTypeLabel)} is ready for approval.</p>`,
      detailRows,
      closingHtml: `<p style="margin:0;">Please open the admin schedule tools to <strong>approve</strong> or <strong>reject</strong> this request.</p>`,
    });
    const { subject, html } = await resolveSchedulingNotificationEmail(
      db,
      'Shift swap — pending your approval',
      innerBody
    );

    await Promise.all(
      recipients.map((adminTo) =>
        safeQueue(db, adminTo, subject, html, {
          event: 'admin-pending-approval',
          jobSlug: jobSlug.trim(),
          extra: { adminRecipient: true },
        })
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
      await queueSchedulingNotificationEmail(
        db,
        to,
        'Shift swap request',
        {
          greetingHtml: buildDearGreetingLine(peerName),
          introHtml: intro,
          detailRows: [
            { label: 'Job', value: ctx.jobName },
            { label: 'Shift', value: ctx.shiftName },
            { label: 'Shift Date', value: ctx.dateFormatted },
          ],
          closingHtml: closing,
        },
        {
          event: 'swap-request-created-peer',
          jobSlug: doc.jobSlug,
          fromShiftDate: doc.fromShiftDate,
          fromShiftSlug: doc.fromShiftSlug,
          toShiftDate: doc.toShiftDate,
          toShiftSlug: doc.toShiftSlug,
          fromEmployeeId: doc.fromEmployeeId,
          toEmployeeId: doc.toEmployeeId,
          recipientApplicantId: doc.toEmployeeId,
        }
      );
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
      await queueSchedulingNotificationEmail(
        db,
        to,
        'Shift offered to you',
        {
          greetingHtml: buildDearGreetingLine(peerName),
          introHtml: intro,
          detailRows: [
            { label: 'Job', value: ctx.jobName },
            { label: 'Shift', value: ctx.shiftName },
            { label: 'Shift Date', value: ctx.dateFormatted },
          ],
        },
        {
          event: 'giveaway-directed-created-peer',
          jobSlug: doc.jobSlug,
          fromShiftDate: doc.fromShiftDate,
          fromShiftSlug: doc.fromShiftSlug,
          toShiftDate: doc.toShiftDate,
          toShiftSlug: doc.toShiftSlug,
          fromEmployeeId: doc.fromEmployeeId,
          toEmployeeId: doc.toEmployeeId,
          recipientApplicantId: doc.toEmployeeId,
        }
      );
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
      await queueSchedulingNotificationEmail(
        db,
        to,
        'Shift you may want — coworker offering a day',
        {
          greetingHtml: buildDearGreetingLine(seekerName),
          introHtml: intro,
          detailRows: [
            { label: 'Job', value: jobName },
            { label: 'Shift', value: shiftName },
            { label: 'Shift Date', value: dateFormatted },
          ],
          closingHtml: closing,
        },
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
    await queueSchedulingNotificationEmail(
      db,
      from,
      'Your shift offer was accepted',
      {
        greetingHtml: buildDearGreetingLine(giverName),
        introHtml: intro,
        detailRows: [
          { label: 'Job', value: ctx.jobName },
          { label: 'Shift', value: ctx.shiftName },
          { label: 'Shift Date', value: ctx.dateFormatted },
        ],
      },
      {
        event: 'giveaway-claimed-notify-giver',
        jobSlug: doc.jobSlug,
        fromShiftDate: doc.fromShiftDate,
        fromShiftSlug: doc.fromShiftSlug,
        fromEmployeeId: doc.fromEmployeeId,
        toEmployeeId: doc.toEmployeeId,
        recipientApplicantId: doc.fromEmployeeId,
      }
    );
    await notifyAdminsPendingSwap(
      db,
      'shift giveaway',
      [
        { label: 'Job', value: ctx.jobName },
        { label: 'Shift', value: ctx.shiftName },
        { label: 'Shift Date', value: ctx.dateFormatted },
      ],
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
    const sides = await loadSwapTwoSidedContext(db, doc);
    const from = await applicantEmail(db, doc.fromEmployeeId);
    const initiatorName = await applicantDisplayName(db, doc.fromEmployeeId);
    const peerName = doc.toEmployeeId
      ? await applicantDisplayName(db, doc.toEmployeeId)
      : '';
    const agreeLine = peerName.trim()
      ? `<p style="margin:0 0 14px;"><strong>${escapeHtml(peerName)}</strong> accepted your swap. You are giving up <strong>${escapeHtml(sides.fromShiftName)}</strong> on <strong>${escapeHtml(sides.fromDateFormatted)}</strong>; they are offering <strong>${escapeHtml(sides.toShiftName)}</strong> on <strong>${escapeHtml(sides.toDateFormatted)}</strong> in exchange. The request is pending administrator approval.</p>`
      : `<p style="margin:0 0 14px;">The other employee has agreed to the shift swap. The request is now waiting for administrator approval.</p>`;
    const intro = `<p style="margin:0 0 14px;">I hope this message finds you well.</p>
${agreeLine}`;
    const closing = `<p style="margin:16px 0 0;font-size:14px;color:#64748b;">You will receive another email when an administrator <strong>approves</strong> or <strong>rejects</strong> this request.</p>`;
    await queueSchedulingNotificationEmail(
      db,
      from,
      'Your shift swap was matched',
      {
        greetingHtml: buildDearGreetingLine(initiatorName),
        introHtml: intro,
        detailRows: swapDetailRowsForEmail(
          initiatorName,
          peerName.trim() || 'Coworker',
          sides
        ),
        closingHtml: closing,
      },
      {
        event: 'swap-accepted-notify-initiator',
        jobSlug: doc.jobSlug,
        fromShiftDate: doc.fromShiftDate,
        fromShiftSlug: doc.fromShiftSlug,
        toShiftDate: doc.toShiftDate,
        toShiftSlug: doc.toShiftSlug,
        fromEmployeeId: doc.fromEmployeeId,
        toEmployeeId: doc.toEmployeeId,
        recipientApplicantId: doc.fromEmployeeId,
      }
    );
    await notifyAdminsPendingSwap(
      db,
      'shift swap',
      swapDetailRowsForEmail(
        initiatorName,
        peerName.trim() || 'Coworker',
        sides
      ),
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
    const sides =
      doc.type === 'swap'
        ? await loadSwapTwoSidedContext(db, doc)
        : null;
    const fromLabelName = await applicantDisplayName(db, doc.fromEmployeeId);
    const toLabelName = doc.toEmployeeId
      ? await applicantDisplayName(db, doc.toEmployeeId)
      : '';
    const { subject, leadHtml } = approvedEmailCopy(doc);
    const closing = `<p style="margin:16px 0 0;">If anything looks incorrect, please contact your manager or scheduling team.</p>`;

    const buildForRecipient = async (applicantId: string) => {
      const name = await applicantDisplayName(db, applicantId);
      const intro = `<p style="margin:0 0 14px;">I hope this message finds you well.</p>
<p style="margin:0 0 14px;">${leadHtml}</p>`;
      const detailRows =
        doc.type === 'swap' && sides
          ? swapDetailRowsForEmail(
              fromLabelName,
              toLabelName.trim() || 'Coworker',
              sides
            )
          : [
              { label: 'Job', value: ctx.jobName },
              { label: 'Shift', value: ctx.shiftName },
              { label: 'Shift Date', value: ctx.dateFormatted },
            ];
      const innerBody = buildSchedulingInnerHtml({
        greetingHtml: buildDearGreetingLine(name),
        introHtml: intro,
        detailRows,
        closingHtml: closing,
      });
      const { html } = await resolveSchedulingNotificationEmail(
        db,
        subject,
        innerBody
      );
      return html;
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
  if (doc.jobSlug === EVENT_COVER_JOB_SLUG) {
    return {
      subject: 'Event cover update',
      leadHtml:
        'An administrator has <strong>not approved</strong> this event cover request. The event roster was <strong>not</strong> changed.',
    };
  }
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
    const sides =
      doc.type === 'swap'
        ? await loadSwapTwoSidedContext(db, doc)
        : null;
    const fromLabelName = await applicantDisplayName(db, doc.fromEmployeeId);
    const toLabelName = doc.toEmployeeId
      ? await applicantDisplayName(db, doc.toEmployeeId)
      : '';
    const { subject, leadHtml } = rejectedEmailCopy(doc);
    const initiatorName = await applicantDisplayName(db, doc.fromEmployeeId);
    const intro = `<p style="margin:0 0 14px;">I hope this message finds you well.</p>
<p style="margin:0 0 14px;">${leadHtml}</p>`;
    const closing = `<p style="margin:16px 0 0;">If you have questions, please reach out to your manager or scheduling team.</p>`;
    const detailRows =
      doc.type === 'swap' && sides
        ? swapDetailRowsForEmail(
            fromLabelName,
            toLabelName.trim() || 'Coworker',
            sides
          )
        : [
            { label: 'Job', value: ctx.jobName },
            { label: 'Shift', value: ctx.shiftName },
            { label: 'Shift Date', value: ctx.dateFormatted },
          ];
    const innerBody = buildSchedulingInnerHtml({
      greetingHtml: buildDearGreetingLine(initiatorName),
      introHtml: intro,
      detailRows,
      closingHtml: closing,
    });
    const { html } = await resolveSchedulingNotificationEmail(
      db,
      subject,
      innerBody
    );
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
