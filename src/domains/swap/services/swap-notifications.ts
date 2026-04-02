import 'server-only';

import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { GignologyJob } from '@/domains/job/types/job.types';
import { sendQueuedEmail } from '@/lib/services/email-queue';
import { findJobByJobSlug } from '@/domains/swap/utils/swap-roster-utils';

/**
 * Same delivery path as the rest of the app: `sendQueuedEmail` → Bull → SES (`email-queue.ts`).
 * Development/local: same rules as other mail — no send unless `SES_SEND_IN_DEV=true`; staging email
 * domain transforms apply when `appEnv` is development/staging.
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
  html: string
): Promise<void> {
  if (!to) return;
  try {
    await sendQueuedEmail({ to, subject, html }, db);
  } catch (e) {
    console.error('[swap-notifications] send failed', e);
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

async function fallbackAdminEmailsFromUsers(db: Db): Promise<string[]> {
  const admins = await db
    .collection('users')
    .find(
      { userType: { $in: ['Admin', 'Master'] } },
      { projection: { emailAddress: 1 } }
    )
    .limit(25)
    .toArray();
  const emails = admins
    .map((u) => u.emailAddress)
    .filter((e): e is string => typeof e === 'string' && e.includes('@'));
  return [...new Set(emails)];
}

/**
 * Notify job event managers that a swap/giveaway needs admin approval.
 * Recipients: `job.additionalConfig.eventManagerNotificationRecipients[].email`, else legacy Admin/Master users.
 */
async function notifyAdminsPendingSwap(
  db: Db,
  summary: string,
  jobSlug: string
): Promise<void> {
  try {
    const job = await findJobByJobSlug(db, jobSlug.trim());
    let recipients = eventManagerEmailsFromJob(job);
    if (recipients.length === 0) {
      recipients = await fallbackAdminEmailsFromUsers(db);
    }

    if (recipients.length === 0) {
      console.warn(
        '[swap-notifications] pending-approval email skipped: no eventManagerNotificationRecipients and no Admin/Master emails',
        jobSlug
      );
      return;
    }

    await Promise.all(
      recipients.map((to) =>
        safeQueue(
          db,
          to,
          'Shift swap — pending your approval',
          `<p>${summary}</p><p>Open the admin schedule tools to approve or reject.</p>`
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
    const job = escapeHtml(doc.jobSlug);
    const date = escapeHtml(doc.fromShiftDate);
    const shift = escapeHtml(doc.fromShiftSlug);

    if (doc.type === 'swap' && doc.toEmployeeId) {
      const to = await applicantEmail(db, doc.toEmployeeId);
      if (!to) {
        console.warn(
          '[swap-notifications] swap create: no applicant email for toEmployeeId',
          doc.toEmployeeId
        );
      }
      await safeQueue(
        db,
        to,
        'Shift swap request',
        `<p>A coworker has requested a shift swap that involves you.</p>
       <p><strong>Job:</strong> ${job}<br/>
       <strong>Shift:</strong> ${shift}<br/>
       <strong>Date:</strong> ${date}</p>
       <p>Please sign in to the employee app to accept or decline.</p>`
      );
    }

    if (doc.type === 'giveaway' && doc.toEmployeeId) {
      const to = await applicantEmail(db, doc.toEmployeeId);
      if (!to) {
        console.warn(
          '[swap-notifications] giveaway create: no applicant email for toEmployeeId',
          doc.toEmployeeId
        );
      }
      await safeQueue(
        db,
        to,
        'Shift offered to you',
        `<p>A coworker is offering a shift for you to take (pending admin approval).</p>
       <p><strong>Job:</strong> ${job}<br/>
       <strong>Shift:</strong> ${shift}<br/>
       <strong>Date:</strong> ${date}</p>`
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
    const job = escapeHtml(jobSlug);
    const dateEsc = escapeHtml(dateYmd);
    const shiftEsc = escapeHtml(shiftSlug);

    for (const row of rows) {
      const sid = String(row.fromEmployeeId);
      if (seen.has(sid)) continue;
      seen.add(sid);
      const to = await applicantEmail(db, sid);
      await safeQueue(
        db,
        to,
        'Shift you may want — coworker offering a day',
        `<p>A coworker is offering a shift on a day and job where you showed interest in picking up work.</p>
       <p><strong>Job:</strong> ${job}<br/>
       <strong>Shift:</strong> ${shiftEsc}<br/>
       <strong>Date:</strong> ${dateEsc}</p>
       <p>Sign in to the employee app to see if the offer is still open.</p>`
      );
    }
  } catch (e) {
    console.error(
      '[swap-notifications] notifyPickupSeekersOfOpenGiveaway failed',
      e
    );
  }
}

/** After employee claims an open or directed giveaway — notify initiator + admins. */
export async function notifyGiveawayClaimedByPeer(
  db: Db,
  doc: SwapDocLike
): Promise<void> {
  try {
    if (doc.type !== 'giveaway') return;
    const from = await applicantEmail(db, doc.fromEmployeeId);
    if (!from) {
      console.warn(
        '[swap-notifications] giveaway claim: no applicant email for fromEmployeeId',
        doc.fromEmployeeId
      );
    }
    const job = escapeHtml(doc.jobSlug);
    const date = escapeHtml(doc.fromShiftDate);
    await safeQueue(
      db,
      from,
      'Your shift offer was accepted',
      `<p>A coworker has agreed to take this shift (pending administrator approval).</p>
     <p><strong>Job:</strong> ${job}<br/>
     <strong>Date:</strong> ${date}</p>`
    );
    await notifyAdminsPendingSwap(
      db,
      `A shift giveaway is ready for approval (${job}, ${date}).`,
      doc.jobSlug
    );
  } catch (e) {
    console.error('[swap-notifications] notifyGiveawayClaimedByPeer failed', e);
  }
}

/** After peer PATCH accept — initiator + admins. */
export async function notifySwapAcceptedByPeer(
  db: Db,
  doc: SwapDocLike
): Promise<void> {
  try {
    if (doc.type !== 'swap') return;
    const from = await applicantEmail(db, doc.fromEmployeeId);
    if (!from) {
      console.warn(
        '[swap-notifications] accept: no applicant email for fromEmployeeId',
        doc.fromEmployeeId
      );
    }
    const job = escapeHtml(doc.jobSlug);
    const date = escapeHtml(doc.fromShiftDate);
    await safeQueue(
      db,
      from,
      'Your shift swap was matched',
      `<p>The other employee has agreed to the swap.</p>
     <p><strong>Job:</strong> ${job} · <strong>Date:</strong> ${date}</p>
     <p>It is now waiting for administrator approval.</p>`
    );
    await notifyAdminsPendingSwap(
      db,
      `A shift swap is ready for approval (${job}, ${date}).`,
      doc.jobSlug
    );
  } catch (e) {
    console.error('[swap-notifications] notifySwapAcceptedByPeer failed', e);
  }
}

export async function notifySwapApprovedByAdmin(
  db: Db,
  doc: SwapDocLike
): Promise<void> {
  try {
    const job = escapeHtml(doc.jobSlug);
    const date = escapeHtml(doc.fromShiftDate);
    const html = `<p>Your shift swap was <strong>approved</strong>.</p>
    <p><strong>Job:</strong> ${job} · <strong>Date:</strong> ${date}</p>
    <p>Your schedule has been updated.</p>`;
    const a = await applicantEmail(db, doc.fromEmployeeId);
    await safeQueue(db, a, 'Shift swap approved', html);
    if (doc.toEmployeeId) {
      const b = await applicantEmail(db, doc.toEmployeeId);
      await safeQueue(db, b, 'Shift swap approved', html);
    }
  } catch (e) {
    console.error('[swap-notifications] notifySwapApprovedByAdmin failed', e);
  }
}

export async function notifySwapRejectedByAdmin(
  db: Db,
  doc: SwapDocLike
): Promise<void> {
  try {
    const job = escapeHtml(doc.jobSlug);
    const date = escapeHtml(doc.fromShiftDate);
    const html = `<p>A shift request was <strong>not approved</strong>.</p>
    <p><strong>Job:</strong> ${job} · <strong>Date:</strong> ${date}</p>
    <p>Your published schedule was not changed.</p>`;
    const a = await applicantEmail(db, doc.fromEmployeeId);
    await safeQueue(db, a, 'Shift request update', html);
  } catch (e) {
    console.error('[swap-notifications] notifySwapRejectedByAdmin failed', e);
  }
}
