// lib/services/email-template-service.ts
// Fetches mail templates from the 'control' collection and renders them with variable substitution.
// Templates use JS template literal syntax with `this.applicant`, `this.venue`, etc.

import 'server-only';
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { emailService, type EmailAttachment } from '@/lib/services/email-service';

export interface TemplateVars {
  applicant?: Record<string, unknown> | null;
  user?: Record<string, unknown> | null;
  venue?: Record<string, unknown> | null;
  event?: Record<string, unknown> | null;
  webUrl?: string;
}

export interface BuiltEmail {
  subject: string;
  html: string;
  templateName: string;
}

export interface SendEmailFromTemplateOptions {
  db: Db;
  templateName: string;
  vars: TemplateVars;
  /** Primary recipient email. Falls back to vars.applicant.email or vars.user.emailAddress. */
  recipientEmail?: string;
  /** If provided, look up this user and use their email as the sender. */
  senderUserId?: string;
  /** Additional To addresses merged into the same email. */
  additionalRecipientList?: string[];
  ccList?: string[];
  attachments?: EmailAttachment[];
  /** Reserved for future footer suppression logic. */
  suppressFooter?: boolean;
}

function renderTemplate(templateStr: string, vars: TemplateVars, isSubject = false): string {
  const rendered = new Function('return `' + templateStr + '`;').call(vars);
  return isSubject ? rendered : `<p>${rendered}</p>`;
}

/**
 * Fetches a mail template by name from the 'control' collection and renders it.
 * Returns null if the template is not found or rendering fails.
 */
export async function buildEmailFromTemplate(
  db: Db,
  templateName: string,
  vars: TemplateVars
): Promise<BuiltEmail | null> {
  try {
    const template = await db
      .collection('control')
      .findOne({ name: templateName, type: 'mailTemplate' });

    if (!template) {
      console.warn(`[email-template-service] Template not found: "${templateName}"`);
      return null;
    }

    const html = renderTemplate(template.Message as string, vars);
    const subject = renderTemplate(template.subject as string, vars, true);

    return { subject, html, templateName: template.name as string };
  } catch (err) {
    console.error(`[email-template-service] Error rendering template "${templateName}":`, err);
    return null;
  }
}

/**
 * Builds and sends an email from a template in the 'control' collection.
 *
 * Recipient: recipientEmail → vars.applicant.email → vars.user.emailAddress
 * Sender:    senderUserId (DB lookup) → event.venueContact.email → emailService default
 * Attachments: uses sendEmailWithAttachments when present, otherwise sendEmail.
 */
export async function sendEmailFromTemplate(
  options: SendEmailFromTemplateOptions
): Promise<void> {
  const {
    db,
    templateName,
    vars,
    recipientEmail,
    senderUserId,
    additionalRecipientList,
    ccList,
    attachments,
    // suppressFooter reserved for future use
  } = options;

  const built = await buildEmailFromTemplate(db, templateName, vars);
  if (!built) return;

  // Resolve recipient
  const toEmail =
    recipientEmail ||
    (vars.applicant?.email as string | undefined) ||
    (vars.user?.emailAddress as string | undefined);

  if (!toEmail) {
    console.warn(
      `[email-template-service] No recipient email for template "${templateName}"`
    );
    return;
  }

  // Resolve sender
  let fromEmail: string | undefined;
  if (senderUserId && ObjectId.isValid(senderUserId)) {
    const senderUser = await db
      .collection('users')
      .findOne(
        { _id: new ObjectId(senderUserId) },
        { projection: { emailAddress: 1 } }
      );
    if (senderUser?.emailAddress) {
      fromEmail = senderUser.emailAddress as string;
    }
  }
  if (!fromEmail) {
    const venueContact = vars.event?.venueContact as
      | Record<string, unknown>
      | undefined;
    if (venueContact?.email) {
      fromEmail = venueContact.email as string;
    }
  }

  const { subject, html } = built;

  if (attachments?.length) {
    await emailService.sendEmailWithAttachments({
      from: fromEmail,
      to: [toEmail, ...(additionalRecipientList ?? [])],
      subject,
      html,
      cc: ccList,
      attachments,
    });
  } else {
    await emailService.sendEmail({
      to: toEmail,
      subject,
      html,
      from: fromEmail,
      cc: ccList,
      additionalRecipients: additionalRecipientList,
    });
  }
}
