/**
 * Export invoice report as Excel or CSV (summary/detail).
 * Client users only; filter by clientOrgs. No calls to sp1-api.
 */

import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/lib/middleware/types';
import {
  getClientOrgSlugsForInvoices,
  requireClientUser,
} from '../lib/client-orgs';
import * as XLSX from 'xlsx';

async function exportReportHandler(request: AuthenticatedRequest) {
  if (!requireClientUser(request)) {
    return NextResponse.json(
      { success: false, message: 'Access denied. Client role required.' },
      { status: 403 }
    );
  }

  const clientOrgSlugs = await getClientOrgSlugsForInvoices(request);
  if (clientOrgSlugs.length === 0) {
    return NextResponse.json(
      { success: false, message: 'No venues assigned' },
      { status: 403 }
    );
  }

  let body: {
    startDate?: string;
    endDate?: string;
    format?: string;
    reportType?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const startDate = body.startDate;
  const endDate = body.endDate;
  const format = (body.format || 'xlsx').toLowerCase();
  const reportType = body.reportType || 'detail';

  if (!startDate || !endDate) {
    return NextResponse.json(
      { success: false, message: 'startDate and endDate required' },
      { status: 400 }
    );
  }
  if (!['xlsx', 'csv'].includes(format)) {
    return NextResponse.json(
      { success: false, message: 'format must be xlsx or csv' },
      { status: 400 }
    );
  }

  const { db } = await getTenantAwareConnection(request);
  const venueSlugs = [...clientOrgSlugs];
  const filter: Record<string, unknown> = {
    venueSlug: { $in: venueSlugs },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  };

  const invoices = await db
    .collection('invoice-batches')
    .find(filter)
    .sort({ startDate: -1, invoiceNumber: -1 })
    .limit(10000)
    .toArray();

  const summaryHeader = ['Invoice #', 'Date', 'Event/Job', 'Venue', 'Amount'];
  const detailHeader = [
    'Invoice #',
    'Date',
    'Event/Job',
    'Venue',
    'Position',
    'Hours',
    'OT Hours',
    'Bill Rate',
    'Line Total',
  ];

  const summaryRows = invoices.map((inv: Record<string, unknown>) => {
    const details =
      (inv.details as Array<{
        totalHours?: number;
        totalOvertimeHours?: number;
        billRate?: number;
      }>) ?? [];
    const amount = details.reduce(
      (sum, d) =>
        sum +
        ((Number(d?.totalHours) || 0) * (Number(d?.billRate) || 0) +
          (Number(d?.totalOvertimeHours) || 0) *
            (Number(d?.billRate) || 0) *
            1.5),
      0
    );
    return [
      (inv.invoiceNumber ?? '').toString(),
      inv.startDate ?? '',
      inv.jobSlug ? inv.jobName : inv.eventName,
      inv.venueSlug ?? '',
      amount,
    ];
  });

  const detailRows: unknown[] = [];
  for (const inv of invoices as Array<Record<string, unknown>>) {
    const details =
      (inv.details as Array<{
        position?: string;
        totalHours?: number;
        totalOvertimeHours?: number;
        billRate?: number;
      }>) ?? [];
    const invNum = (inv.invoiceNumber ?? '').toString();
    const date = inv.startDate ?? '';
    const name = inv.jobSlug ? inv.jobName : inv.eventName;
    const venue = inv.venueSlug ?? '';
    if (details.length === 0) {
      detailRows.push([invNum, date, name, venue, '', '', '', '', 0]);
    } else {
      details.forEach((d) => {
        const hours = Number(d?.totalHours) || 0;
        const ot = Number(d?.totalOvertimeHours) || 0;
        const rate = Number(d?.billRate) || 0;
        const lineTotal = hours * rate + ot * rate * 1.5;
        detailRows.push([
          invNum,
          date,
          name,
          venue,
          d?.position ?? '',
          hours,
          ot,
          rate,
          lineTotal,
        ]);
      });
    }
  }

  const header = reportType === 'summary' ? summaryHeader : detailHeader;
  const rows = reportType === 'summary' ? summaryRows : detailRows;
  const data = [header, ...rows];

  if (format === 'csv') {
    const csv = data
      .map((row) =>
        row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')
      )
      .join('\r\n');
    const filename = `invoice-report-${startDate}-${endDate}-${reportType}.csv`;
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Invoice Report');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = `invoice-report-${startDate}-${endDate}-${reportType}.xlsx`;
  return new NextResponse(buf, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

export const POST = withEnhancedAuthAPI(exportReportHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
