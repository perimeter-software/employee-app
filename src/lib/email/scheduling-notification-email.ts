import 'server-only';

import type { Db } from 'mongodb';
import { wrapShiftEmailDocument } from '@/lib/email/employee-app-email-layout';

/**
 * `control` document `name` — same as sp1 `POST /control/emailTemplates` + seed script.
 * Override with env `SCHEDULING_NOTIFICATION_EMAIL_TEMPLATE_NAME` (e.g. per-tenant clone).
 */
export const SCHEDULING_NOTIFICATION_TEMPLATE_NAME =
  'employee-app-scheduling-notification';

export type SchedulingNotificationTemplateContext = {
  scheduling: {
    /** Rendered into email subject (template default: `${this.scheduling.subjectLine}`). */
    subjectLine: string;
    /** Pre-built HTML for greeting + intro + detail table + closing (trusted, from app code). */
    innerBodyHtml: string;
  };
};

function renderTemplateLiteral(
  templateStr: string,
  thisContext: SchedulingNotificationTemplateContext
): string {
  return new Function('return `' + templateStr + '`;').call(thisContext);
}

/**
 * Shift swap, event cover/call-off, and related admin scheduling emails all build
 * `innerBodyHtml` in code, then pass it here. When a matching `control` mailTemplate
 * exists, subject and outer HTML come from that template; otherwise the app uses
 * `wrapShiftEmailDocument` and the plain `subjectLine`.
 */
export async function resolveSchedulingNotificationEmail(
  db: Db,
  subjectLine: string,
  innerBodyHtml: string
): Promise<{ subject: string; html: string }> {
  const templateName =
    process.env.SCHEDULING_NOTIFICATION_EMAIL_TEMPLATE_NAME?.trim() ||
    SCHEDULING_NOTIFICATION_TEMPLATE_NAME;

  const ctx: SchedulingNotificationTemplateContext = {
    scheduling: { subjectLine, innerBodyHtml },
  };

  const doc = await db
    .collection('control')
    .findOne({ name: templateName, type: 'mailTemplate' });

  if (!doc) {
    return {
      subject: subjectLine,
      html: wrapShiftEmailDocument(innerBodyHtml),
    };
  }

  const subjectTpl =
    typeof doc.subject === 'string' && doc.subject.trim()
      ? doc.subject.trim()
      : '${this.scheduling.subjectLine}';
  const messageTpl =
    typeof doc.Message === 'string' && doc.Message.trim()
      ? doc.Message.trim()
      : '';

  if (!messageTpl) {
    return {
      subject: subjectLine,
      html: wrapShiftEmailDocument(innerBodyHtml),
    };
  }

  try {
    const subject = renderTemplateLiteral(subjectTpl, ctx);
    const html = renderTemplateLiteral(messageTpl, ctx);
    return { subject, html };
  } catch (e) {
    console.error(
      '[scheduling-notification-email] template render failed; using fallback',
      e
    );
    return {
      subject: subjectLine,
      html: wrapShiftEmailDocument(innerBodyHtml),
    };
  }
}
