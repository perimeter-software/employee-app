/**
 * Send one or more invoices as email attachment(s) to one or more recipients.
 * Client users only; invoices must be for venues in their clientOrgs.
 * Replicates sp1-api + stadium-people email flow: same MIME structure and email service (no sp1-api calls).
 */

import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/lib/middleware/types';
import { getClientOrgSlugsForInvoices, requireClientUser } from '../lib/client-orgs';
import { ObjectId } from 'mongodb';
import * as XLSX from 'xlsx';
import { emailService } from '@/lib/services/email-service';
import { env } from '@/lib/config/env';

async function sendEmailHandler(request: AuthenticatedRequest) {
  if (!requireClientUser(request)) {
    return NextResponse.json(
      { success: false, message: 'Access denied. Client role required.' },
      { status: 403 }
    );
  }

  const clientOrgSlugs = await getClientOrgSlugsForInvoices(request);
  if (clientOrgSlugs.length === 0) {
    return NextResponse.json({ success: false, message: 'No venues assigned' }, { status: 403 });
  }

  let body: { invoiceIds?: string[]; toEmails?: string[]; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const invoiceIds = body.invoiceIds;
  const toEmails = Array.isArray(body.toEmails) ? body.toEmails.filter((e: unknown) => typeof e === 'string' && e.trim()) : [];
  const customMessage = typeof body.message === 'string' ? body.message : '';

  if (!invoiceIds?.length || !toEmails.length) {
    return NextResponse.json(
      { success: false, message: 'invoiceIds and toEmails (non-empty) required' },
      { status: 400 }
    );
  }

  const { db } = await getTenantAwareConnection(request);
  const coll = db.collection('invoice-batches');
  const allowed: Array<{ _id: ObjectId; invoiceNumber?: number | string; jobName?: string; eventName?: string; jobSlug?: string; startDate?: string; details?: unknown[] }> = [];

  for (const id of invoiceIds) {
    try {
      const oid = new ObjectId(id);
      const inv = await coll.findOne({ _id: oid }) as { venueSlug?: string; [k: string]: unknown } | null;
      if (inv && inv.venueSlug && clientOrgSlugs.includes(inv.venueSlug)) {
        allowed.push(inv as (typeof allowed)[0]);
      }
    } catch {
      // skip invalid id
    }
  }

  if (allowed.length === 0) {
    return NextResponse.json({ success: false, message: 'No valid invoices found or access denied' }, { status: 400 });
  }

  // Build a single Excel with one sheet per invoice (or one sheet with all)
  const wb = XLSX.utils.book_new();
  const header = ['Invoice #', 'Event/Job', 'Start Date', 'Position', 'Hours', 'OT Hours', 'Bill Rate', 'Line Total'];

  for (let i = 0; i < allowed.length; i++) {
    const inv = allowed[i];
    const invoiceNumber = (inv.invoiceNumber ?? '').toString().padStart(8, '0');
    const details = (inv.details ?? []) as Array<{ position?: string; totalHours?: number; totalOvertimeHours?: number; billRate?: number }>;
    const rows = details.map((d) => {
      const hours = Number(d?.totalHours) || 0;
      const ot = Number(d?.totalOvertimeHours) || 0;
      const rate = Number(d?.billRate) || 0;
      const lineTotal = hours * rate + ot * rate * 1.5;
      return [invoiceNumber, inv.jobSlug ? inv.jobName : inv.eventName, inv.startDate ?? '', d?.position ?? '', hours, ot, rate, lineTotal];
    });
    const total = details.reduce(
      (sum, d) =>
        sum +
        ((Number(d?.totalHours) || 0) * (Number(d?.billRate) || 0) +
          (Number(d?.totalOvertimeHours) || 0) * (Number(d?.billRate) || 0) * 1.5),
      0
    );
    const wsData = [header, ...rows, ['', '', '', 'Total', '', '', '', total]];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const sheetName = allowed.length === 1 ? 'Invoice' : `Invoice_${i + 1}`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = allowed.length === 1
    ? `invoice-${(allowed[0].invoiceNumber ?? '').toString().padStart(8, '0')}.xlsx`
    : `invoices-${allowed.length}.xlsx`;

  const subject = allowed.length === 1 ? `Invoice ${(allowed[0].invoiceNumber ?? '').toString().padStart(8, '0')}` : `${allowed.length} Invoices`;
  const messageBody = [
    'Please find the attached invoice(s).',
    customMessage ? customMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '',
    'This is an automated message from the Employee App.',
  ]
    .filter(Boolean)
    .join('\n\n');
  const html = `<p>${messageBody.split(/\n\n+/).join('</p><p>')}</p>`;

  try {
    await emailService.sendEmailWithAttachments({
      from: env.ses.fromEmail,
      fromDisplayName: 'Employee App',
      to: toEmails,
      subject,
      html,
      text: messageBody,
      attachments: [{ filename, content: Buffer.isBuffer(excelBuffer) ? excelBuffer : Buffer.from(excelBuffer) }],
    });

    return NextResponse.json({
      success: true,
      message: `Invoice(s) sent to ${toEmails.join(', ')}`,
    });
  } catch (err) {
    if (process.env.NODE_ENV === 'development' && process.env.SES_SEND_IN_DEV !== 'true') {
      return NextResponse.json({
        success: true,
        message: 'In development, email is logged only. Invoice(s) would be sent to ' + toEmails.join(', '),
      });
    }
    console.error('Send invoice email error:', err);
    const message =
      (err as Error).message?.includes('credentials') || (err as Error).message?.includes('Credentials')
        ? 'Email could not be sent: AWS credentials are not configured. Add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to your .env file.'
        : (err as Error).message || 'Failed to send email';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export const POST = withEnhancedAuthAPI(sendEmailHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
