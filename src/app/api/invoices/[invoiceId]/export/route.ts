/**
 * Export single invoice as Excel, CSV, or PDF.
 * Client users only; invoice must be for a venue in their clientOrgs.
 * Replicates sp1-api exportExcelInvoice logic; no calls to sp1-api.
 */

import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/lib/middleware/types';
import {
  getClientOrgSlugsForInvoices,
  requireClientUser,
} from '../../lib/client-orgs';
import { ObjectId } from 'mongodb';
import * as XLSX from 'xlsx';
import { createRequire } from 'module';
import path from 'path';

type InvoiceDoc = {
  _id: ObjectId;
  invoiceNumber?: number | string;
  jobName?: string;
  eventName?: string;
  jobSlug?: string;
  startDate?: string;
  venueSlug?: string;
  details?: Array<{
    position?: string;
    totalHours?: number;
    totalOvertimeHours?: number;
    billRate?: number;
    total?: number;
    [k: string]: unknown;
  }>;
  [k: string]: unknown;
};

function buildFilename(inv: InvoiceDoc, ext: string): string {
  const num = (inv.invoiceNumber ?? '').toString().padStart(8, '0');
  const name = (inv.jobSlug ? inv.jobName : inv.eventName) ?? '';
  const safe = name.replace(/\W/g, '_');
  const start = inv.startDate ?? '';
  return `${num}-${safe}-${start}.${ext}`;
}

async function exportHandler(
  request: AuthenticatedRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  if (!requireClientUser(request)) {
    return NextResponse.json(
      { success: false, message: 'Access denied. Client role required.' },
      { status: 403 }
    );
  }

  const { invoiceId } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const format = (searchParams.get('format') || 'xlsx').toLowerCase();

  if (!invoiceId || typeof invoiceId !== 'string') {
    return NextResponse.json(
      { success: false, message: 'invoiceId is required' },
      { status: 400 }
    );
  }
  if (!['xlsx', 'csv', 'pdf'].includes(format)) {
    return NextResponse.json(
      { success: false, message: 'format must be xlsx, csv, or pdf' },
      { status: 400 }
    );
  }

  let oid: ObjectId;
  try {
    oid = new ObjectId(invoiceId);
  } catch {
    return NextResponse.json(
      { success: false, message: 'Invalid invoiceId' },
      { status: 400 }
    );
  }

  const clientOrgSlugs = await getClientOrgSlugsForInvoices(request);
  if (clientOrgSlugs.length === 0) {
    return NextResponse.json(
      { success: false, message: 'No venues assigned' },
      { status: 403 }
    );
  }

  const { db } = await getTenantAwareConnection(request);
  const inv = (await db
    .collection('invoice-batches')
    .findOne({ _id: oid })) as InvoiceDoc | null;
  if (!inv) {
    return NextResponse.json(
      { success: false, message: 'Invoice not found' },
      { status: 404 }
    );
  }
  const allowed = inv.venueSlug && clientOrgSlugs.includes(inv.venueSlug);
  if (!allowed) {
    return NextResponse.json(
      { success: false, message: 'Access denied to this invoice' },
      { status: 403 }
    );
  }

  const invoiceNumber =
    inv.invoiceNumber != null ? String(inv.invoiceNumber).padStart(8, '0') : '';
  const details = inv.details ?? [];

  // Summary row for export
  const totalAmount = details.reduce(
    (sum, d) =>
      sum +
      ((Number(d?.totalHours) || 0) * (Number(d?.billRate) || 0) +
        (Number(d?.totalOvertimeHours) || 0) *
          (Number(d?.billRate) || 0) *
          1.5),
    0
  );

  if (format === 'xlsx') {
    const header = [
      'Invoice #',
      'Event/Job',
      'Start Date',
      'Position',
      'Hours',
      'OT Hours',
      'Bill Rate',
      'Line Total',
    ];
    const rows = details.map((d) => {
      const hours = Number(d?.totalHours) || 0;
      const ot = Number(d?.totalOvertimeHours) || 0;
      const rate = Number(d?.billRate) || 0;
      const lineTotal = hours * rate + ot * rate * 1.5;
      return [
        invoiceNumber,
        inv.jobSlug ? inv.jobName : inv.eventName,
        inv.startDate ?? '',
        d?.position ?? '',
        hours,
        ot,
        rate,
        lineTotal,
      ];
    });
    const summaryRow = ['', '', '', 'Total', '', '', '', totalAmount];
    const wsData = [header, ...rows, summaryRow];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Invoice');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = buildFilename(inv, 'xlsx');
    return new NextResponse(buf, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  if (format === 'csv') {
    const header =
      'Invoice #,Event/Job,Start Date,Position,Hours,OT Hours,Bill Rate,Line Total';
    const rows = details.map((d) => {
      const hours = Number(d?.totalHours) || 0;
      const ot = Number(d?.totalOvertimeHours) || 0;
      const rate = Number(d?.billRate) || 0;
      const lineTotal = hours * rate + ot * rate * 1.5;
      const esc = (v: unknown) =>
        v != null ? `"${String(v).replace(/"/g, '""')}"` : '""';
      return [
        esc(invoiceNumber),
        esc(inv.jobSlug ? inv.jobName : inv.eventName),
        esc(inv.startDate),
        esc(d?.position),
        hours,
        ot,
        rate,
        lineTotal,
      ].join(',');
    });
    const csv = [header, ...rows, `,,,"Total",,,,${totalAmount}`].join('\r\n');
    const filename = buildFilename(inv, 'csv');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  if (format === 'pdf') {
    try {
      // Load pdfkit at runtime: createRequire works in dev; in prod bundle it may be undefined, so fallback to dynamic import
      let PDFDocument: unknown;
      if (typeof createRequire === 'function') {
        const requireFromProject = createRequire(
          path.join(process.cwd(), 'package.json')
        );
        PDFDocument = requireFromProject('pdfkit');
      } else {
        const mod = await import('pdfkit');
        PDFDocument = mod.default ?? mod;
      }
      if (typeof PDFDocument !== 'function') {
        throw new Error('PDF library (pdfkit) could not be loaded');
      }
      type PDFDoc = {
        on(e: string, fn: (chunk: Buffer) => void): void;
        end(): void;
        fontSize(n: number): PDFDoc;
        text(s: string, opts?: object): PDFDoc;
        moveDown(n?: number): PDFDoc;
      };
      const DocCtor = PDFDocument as new (opts?: { size?: string; margin?: number }) => PDFDoc;
      const doc = new DocCtor({ size: 'LETTER', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      const body = await new Promise<Buffer>((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        const pad = (s: string, n: number) => s.slice(0, n).padEnd(n, ' ');
        const r2 = (n: number) => Number(n.toFixed(2)).toFixed(2);

        doc
          .fontSize(14)
          .text(`Invoice # ${invoiceNumber}`, { continued: false });
        doc
          .fontSize(11)
          .text(
            `Event/Job: ${inv.jobSlug ? inv.jobName : (inv.eventName ?? '')}`,
            { continued: false }
          );
        doc.text(`Start Date: ${inv.startDate ?? ''}`, { continued: false });
        doc.moveDown();

        doc.fontSize(10);
        doc.text(
          pad('Position', 24) +
            pad('Hours', 10) +
            pad('OT', 8) +
            pad('Bill Rate', 12) +
            'Line Total',
          { continued: false }
        );
        doc.moveDown(0.5);

        details.forEach((d) => {
          const hours = Number(d?.totalHours) || 0;
          const ot = Number(d?.totalOvertimeHours) || 0;
          const rate = Number(d?.billRate) || 0;
          const lineTotal = hours * rate + ot * rate * 1.5;
          const positionStr = String(d?.position ?? '').trim() || '—';
          doc.text(
            pad(positionStr, 24) +
              pad(r2(hours), 10) +
              pad(r2(ot), 8) +
              pad(r2(rate), 12) +
              r2(lineTotal),
            { continued: false }
          );
        });

        doc.moveDown();
        doc
          .fontSize(12)
          .text(`Total: $${r2(totalAmount)}`, { continued: false });
        doc.end();
      });
      const filename = buildFilename(inv, 'pdf');
      return new NextResponse(body as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(body.length),
        },
      });
    } catch (err) {
      console.error('PDF export error:', err);
      return NextResponse.json(
        {
          success: false,
          message: (err as Error).message || 'Failed to generate PDF',
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    { success: false, message: 'format must be xlsx, csv, or pdf' },
    { status: 400 }
  );
}

export const GET = withEnhancedAuthAPI(exportHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
