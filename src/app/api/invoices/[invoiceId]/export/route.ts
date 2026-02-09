/**
 * Export single invoice as Excel or CSV.
 * PDF is generated client-side (see invoice-pdf-client.ts) to avoid server bundling issues.
 * Client users only; invoice must be for a venue in their clientOrgs.
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
  if (!['xlsx', 'csv'].includes(format)) {
    return NextResponse.json(
      { success: false, message: 'format must be xlsx or csv; PDF is generated in the browser' },
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

  const to2 = (n: number) => Math.round(n * 100) / 100;
  const fmtNum = (n: number) => to2(n).toFixed(2);
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(to2(n));

  const invoiceNumber =
    inv.invoiceNumber != null ? String(inv.invoiceNumber).padStart(8, '0') : '';
  const details = inv.details ?? [];

  // Summary row for export (totals limited to 2 decimals)
  const totalAmount = details.reduce(
    (sum, d) =>
      sum +
      ((Number(d?.totalHours) || 0) * (Number(d?.billRate) || 0) +
        (Number(d?.totalOvertimeHours) || 0) *
          (Number(d?.billRate) || 0) *
          1.5),
    0
  );
  const totalAmountFormatted = fmtCurrency(totalAmount);

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
        fmtNum(hours),
        fmtNum(ot),
        fmtNum(rate),
        fmtCurrency(lineTotal),
      ];
    });
    const summaryRow = ['', '', '', 'Total', '', '', '', totalAmountFormatted];
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
        fmtNum(hours),
        fmtNum(ot),
        fmtNum(rate),
        fmtCurrency(lineTotal),
      ].join(',');
    });
    const csv = [header, ...rows, `,,,"Total",,,,${totalAmountFormatted}`].join(
      '\r\n'
    );
    const filename = buildFilename(inv, 'csv');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  return NextResponse.json(
    { success: false, message: 'format must be xlsx or csv' },
    { status: 400 }
  );
}

export const GET = withEnhancedAuthAPI(exportHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
