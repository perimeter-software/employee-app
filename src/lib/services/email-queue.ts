// lib/services/email-queue.ts
// Enqueues emails to the shared Bull "emailQueue" processed by the other API.
// Performs all pre-send checks: SES from-email verification, suppression-list,
// and staging email transforms.

import 'server-only';
import Bull from 'bull';
import {
  SESClient,
  GetIdentityVerificationAttributesCommand,
  ListIdentitiesCommand,
} from '@aws-sdk/client-ses';
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { env, getEnvironmentConfig } from '@/lib/config';
import { logActivity } from '@/lib/services/activity-logger';

// ─── Staging email helpers ────────────────────────────────────────────────────

const TEST_DOMAIN = process.env.TEST_EMAIL_DOMAIN || 'stadiumpeople.us';

export function appendTestDomain(email: string, companyEmail: string): string {
  if (!email) return `test@${TEST_DOMAIN}`;
  const companyDomain = companyEmail?.split('@')?.[1];
  const parts = email.split('@');
  const firstPart = parts.length ? parts[0] : 'testing';
  const domain =
    parts.length > 1 && parts[1].toLowerCase() === companyDomain
      ? parts[1]
      : TEST_DOMAIN;
  return `${firstPart}@${domain}`;
}

export function checkForStaging(
  orig: string,
  companyEmail: string,
  appEnv: string
): string {
  if (appEnv === 'staging' || appEnv === 'development') {
    return appendTestDomain(orig, companyEmail);
  }
  return orig;
}

export function changeListToStaging(
  list: string[] | undefined,
  companyEmail: string,
  appEnv: string
): string[] {
  if (!list || !list.length) return [];
  if (appEnv === 'staging' || appEnv === 'development') {
    return list.map((orig) => appendTestDomain(orig, companyEmail));
  }
  return list;
}

// ─── Company record ───────────────────────────────────────────────────────────

interface CompanyRecord {
  name?: string;
  companyEmail?: string;
  supportEmail?: string;
  companyType?: string;
  squareLogoUrl?: string;
  imageUrl?: string;
  uploadPath?: string;
  uploadUrl?: string;
  slug?: string;
}

async function getCompanyRecord(db: Db): Promise<CompanyRecord | null> {
  return db.collection('company').findOne(
    { primaryCompany: true },
    {
      projection: {
        name: 1,
        companyEmail: 1,
        supportEmail: 1,
        companyType: 1,
        squareLogoUrl: 1,
        imageUrl: 1,
        uploadPath: 1,
        uploadUrl: 1,
        slug: 1,
        settings: 1,
        aiSettings: 1,
        backgroundCheckInfo: 1,
        address: 1,
        city: 1,
        state: 1,
        zip: 1,
        phone: 1,
        companyUrl: 1,
        minScoreToRecommend: 1,
        minStageToOnboarding: 1,
        allowedScreensForClients: 1,
        allowedScreens: 1,
        payrollSettings: 1,
        externalCredentials: 1,
      },
    }
  ) as Promise<CompanyRecord | null>;
}

// ─── Sender / recipient resolution ───────────────────────────────────────────

interface ResolvedPerson {
  firstName: string;
  lastName: string;
  email: string;
  userId?: string;
  /** Populated when the person was found in the applicants collection. */
  applicantId?: string;
  recordLocked?: string;
  isDnu?: string;
}

async function resolvePersonByEmail(
  db: Db,
  email: string
): Promise<ResolvedPerson | null> {
  // Try users collection first
  const user = await db
    .collection('users')
    .findOne(
      { emailAddress: email },
      { projection: { _id: 1, firstName: 1, lastName: 1, emailAddress: 1 } }
    );
  if (user) {
    return {
      firstName: (user.firstName as string) || '',
      lastName: (user.lastName as string) || '',
      email: (user.emailAddress as string) || email,
      userId: user._id.toString(),
    };
  }

  // Fall back to applicants collection — also fetch lock/DNU flags for pre-send checks
  const applicant = await db.collection('applicants').findOne(
    { email },
    {
      projection: {
        _id: 1,
        firstName: 1,
        lastName: 1,
        email: 1,
        recordLocked: 1,
        isDnu: 1,
      },
    }
  );
  if (applicant) {
    return {
      firstName: (applicant.firstName as string) || '',
      lastName: (applicant.lastName as string) || '',
      email: (applicant.email as string) || email,
      applicantId: applicant._id.toString(),
      recordLocked: applicant.recordLocked as string | undefined,
      isDnu: applicant.isDnu as string | undefined,
    };
  }

  return null;
}

async function resolveSender(
  db: Db,
  fromEmail: string | undefined,
  senderUserId: string | undefined
): Promise<ResolvedPerson | null> {
  if (senderUserId && ObjectId.isValid(senderUserId)) {
    const user = await db
      .collection('users')
      .findOne(
        { _id: new ObjectId(senderUserId) },
        { projection: { _id: 1, firstName: 1, lastName: 1, emailAddress: 1 } }
      );
    if (user) {
      return {
        firstName: (user.firstName as string) || '',
        lastName: (user.lastName as string) || '',
        email: (user.emailAddress as string) || fromEmail || '',
        userId: user._id.toString(),
      };
    }
  }

  if (fromEmail) {
    const rawEmail = fromEmail.match(/<([^>]+)>/)?.[1] ?? fromEmail;
    return resolvePersonByEmail(db, rawEmail);
  }

  return null;
}

// ─── SES verification ─────────────────────────────────────────────────────────

let sesClient: SESClient | null = null;

function getSesClient(): SESClient {
  if (!sesClient) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    sesClient = new SESClient({
      region: env.ses.region,
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }
  return sesClient;
}

async function getEmailVerificationStatus(
  emailAddress: string
): Promise<'verified' | 'submitted' | 'unsubmitted' | 'none'> {
  try {
    const client = getSesClient();
    const attrCmd = new GetIdentityVerificationAttributesCommand({
      Identities: [emailAddress],
    });
    const attrResp = await client.send(attrCmd);
    const status =
      attrResp.VerificationAttributes?.[emailAddress]?.VerificationStatus;
    if (status === 'Success') return 'verified';

    // Not yet verified — check whether it was at least submitted
    const listCmd = new ListIdentitiesCommand({ IdentityType: 'EmailAddress' });
    const listResp = await client.send(listCmd);
    if (listResp.Identities?.includes(emailAddress)) return 'submitted';

    return 'unsubmitted';
  } catch (err) {
    console.error('[email-queue] SES verification check failed:', err);
    return 'none';
  }
}

// ─── Bull queue ───────────────────────────────────────────────────────────────

let emailQueue: Bull.Queue | null = null;

function getEmailQueue(): Bull.Queue {
  if (!emailQueue) {
    emailQueue = new Bull('emailQueue', {
      redis: {
        host: env.redis.api_host,
        port: env.redis.api_port,
        // V4 ElastiCache requires TLS; EB instances don't. Honor the
        // API_REDIS_TLS env var so this works for both stacks without
        // hanging on the connection handshake.
        ...(env.redis.api_tls ? { tls: {} } : {}),
      },
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true,
      },
      limiter: {
        max: 7,
        duration: 1000,
      },
    });
  }
  return emailQueue;
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface QueueEmailOptions {
  /** Sender address. Falls back to company companyEmail. */
  from?: string;
  senderUserId?: string;
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  /** When true, also CC the original sender. */
  copySender?: boolean;
  /** Skip SES from-address verification (use when sender is known-good). */
  skipEmailVerification?: boolean;
  templateName?: string;
}

/**
 * Primary email dispatch function.
 *
 * - Fetches the company record for the authoritative companyEmail.
 * - Verifies the from-email against SES, falling back to companyEmail if unverified.
 * - Applies staging email domain transforms in non-production environments.
 * - Checks the suppression list before sending.
 * - Resolves sender and recipient from the DB (by senderUserId or email lookup)
 *   and logs an Email Message activity.
 */
export async function sendQueuedEmail(
  options: QueueEmailOptions,
  db: Db
): Promise<{ success: boolean; message?: string }> {
  const intendedTo = options.to;
  const deliveryTo = options.to;
  const mailSubject = options.subject;
  const mailHtml = options.html;

  // ── 1. Dev guard (same check kept from the original emailService) ───────────
  if (env.isDevelopment && process.env.SES_SEND_IN_DEV !== 'true') {
    console.log('[email-queue] Dev mode – not sending:', {
      subject: options.subject,
      to: options.to,
    });
    console.log(
      '[email-queue] Set SES_SEND_IN_DEV=true to enable email sending in development.'
    );
    return {
      success: false,
      message: 'Dev mode: email not sent (set SES_SEND_IN_DEV=true)',
    };
  }

  // ── 2. Fetch company record ──────────────────────────────────────────────────
  const companyRec = await getCompanyRecord(db);
  const companyEmail = companyRec?.companyEmail || env.ses.fromEmail;
  const { environment: appEnv } = getEnvironmentConfig();

  // ── 3. Resolve and verify from-email ────────────────────────────────────────
  let fromEmail = options.from || companyEmail;
  if (!options.skipEmailVerification) {
    // Strip display name if present: "Name <addr>" → "addr"
    const rawFrom = fromEmail.match(/<([^>]+)>/)?.[1] ?? fromEmail;
    const verificationStatus = await getEmailVerificationStatus(rawFrom);
    if (verificationStatus !== 'verified') {
      console.error(
        `[email-queue] fromEmail "${rawFrom}" has SES status "${verificationStatus}" – falling back to ${companyEmail}`
      );
      fromEmail = companyEmail;
    }
  }

  // ── 4. Staging email transforms ─────────────────────────────────────────────
  const toEmail = checkForStaging(deliveryTo, companyEmail, appEnv);
  const ccList = changeListToStaging(options.cc, companyEmail, appEnv);
  const bccList = changeListToStaging(options.bcc, companyEmail, appEnv);

  // ── 5. Resolve recipient by original email (pre-staging) so DB lookup hits ───
  //       their real address, then run applicant pre-send checks.
  const resolvedRecipient = await resolvePersonByEmail(db, intendedTo);

  if (resolvedRecipient?.recordLocked === 'Yes') {
    const message = `Not sending email for locked applicant ${resolvedRecipient.applicantId}: ${resolvedRecipient.firstName} ${resolvedRecipient.lastName}`;
    console.log('[email-queue]', message);
    return { success: false, message };
  }
  if (resolvedRecipient?.isDnu === 'Yes') {
    const message = `Not sending email for DNU applicant ${resolvedRecipient.applicantId}: ${resolvedRecipient.firstName} ${resolvedRecipient.lastName}`;
    console.log('[email-queue]', message);
    return { success: false, message };
  }

  // ── 6. Suppression-list check ────────────────────────────────────────────────
  const suppressed = await db
    .collection('suppression-list')
    .findOne({ email: toEmail.toLowerCase(), reason: 'COMPLAINT' });
  if (suppressed) {
    const message = `Not sending email – COMPLAINT suppressed: ${toEmail}`;
    console.log('[email-queue]', message);
    return { success: false, message };
  }

  // ── 7. Resolve sender from DB ────────────────────────────────────────────────
  const resolvedSender = await resolveSender(
    db,
    options.from,
    options.senderUserId
  );

  // ── 8. Build mailPacket (matches the other API's queue format) ───────────────
  const dbName = db.databaseName;
  const catchAll = `${dbName}@gignology.pro`;
  const fromDisplay = resolvedSender
    ? `${resolvedSender.firstName} ${resolvedSender.lastName} <${fromEmail}>`.trim()
    : fromEmail;

  const mailPacket: Record<string, unknown> = {
    from: fromDisplay,
    to: toEmail,
    cc: ccList.length ? [...ccList, catchAll] : catchAll,
    bcc: bccList.length ? [...bccList, catchAll] : catchAll,
    subject: mailSubject,
    text: options.text ?? '',
    html: mailHtml,
    ...(resolvedSender && {
      sender: {
        fromEmail: fromDisplay,
        firstName: resolvedSender.firstName,
        lastName: resolvedSender.lastName,
        userId: resolvedSender.userId,
      },
    }),
    emailProperties: {
      mainCompanyEmail: companyRec?.companyEmail,
      imageUrl: companyRec?.imageUrl,
      logoUrl: companyRec?.squareLogoUrl,
      companyEmail: companyRec?.companyEmail,
      supportEmail: companyRec?.supportEmail,
      companyName: companyRec?.name,
      companyType: companyRec?.companyType,
      uploadPath: companyRec?.uploadPath,
      companySlug: companyRec?.slug,
    },
  };

  // copySender: also CC the original sender's address
  if (options.copySender && fromEmail) {
    const rawSenderEmail = fromEmail.match(/<([^>]+)>/)?.[1] ?? fromEmail;
    const currentCc = mailPacket.cc;
    mailPacket.cc = Array.isArray(currentCc)
      ? [...(currentCc as string[]), rawSenderEmail]
      : [currentCc as string, rawSenderEmail];
  }

  // ── 9. Dispatch ──────────────────────────────────────────────────────────────
  try {
    await getEmailQueue().add(mailPacket);
    console.log('[email-queue] Enqueued email job', {
      to: toEmail,
      subject: mailSubject,
    });
  } catch (err) {
    const code = (err as { Code?: string }).Code;
    if (code === 'Throttling') {
      setTimeout(() => getEmailQueue().add(mailPacket), 5000);
    } else {
      throw err;
    }
  }

  // ── 10. Activity log ─────────────────────────────────────────────────────────
  const description =
    resolvedSender && resolvedRecipient
      ? `From ${resolvedSender.firstName} ${resolvedSender.lastName} to ${resolvedRecipient.firstName} ${resolvedRecipient.lastName}:\n${mailSubject}`
      : `Email sent: ${mailSubject}`;

  await logActivity(db, {
    action: 'Email Message',
    type: 'Message',
    description,
    userId: resolvedSender?.userId,
    detail: {
      from: fromEmail,
      to: toEmail,
      subject: mailSubject,
      ...(resolvedSender && { sender: resolvedSender }),
      ...(resolvedRecipient && { recipient: resolvedRecipient }),
      ...(options.templateName && { templateName: options.templateName }),
    },
  });

  return { success: true };
}
