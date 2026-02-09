/**
 * Generate invoice report (summary or detail) for date range.
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

async function reportHandler(request: AuthenticatedRequest) {
  if (!requireClientUser(request)) {
    return NextResponse.json(
      { success: false, message: 'Access denied. Client role required.' },
      { status: 403 }
    );
  }

  const clientOrgSlugs = await getClientOrgSlugsForInvoices(request);
  if (clientOrgSlugs.length === 0) {
    return NextResponse.json({
      success: true,
      data: {
        invoices: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      },
    });
  }

  let body: {
    startDate?: string;
    endDate?: string;
    reportType?: string;
    page?: number;
    limit?: number;
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
  const reportType = body.reportType || 'detail';
  const page = Math.max(1, body.page ?? 1);
  const limit = Math.min(100, Math.max(1, body.limit ?? 10));

  if (!startDate || !endDate) {
    return NextResponse.json(
      { success: false, message: 'startDate and endDate required' },
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

  const total = await db.collection('invoice-batches').countDocuments(filter);
  const totalPages = Math.ceil(total / limit);
  const skip = (page - 1) * limit;

  const invoices = await db
    .collection('invoice-batches')
    .find(filter)
    .sort({ startDate: -1, invoiceNumber: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  const invoicesData = invoices.map((inv: Record<string, unknown>) => {
    const details =
      (inv.details as Array<{
        totalHours?: number;
        totalOvertimeHours?: number;
        billRate?: number;
      }>) ?? [];
    const invoiceAmount = details.reduce(
      (sum, d) =>
        sum +
        ((Number(d?.totalHours) || 0) * (Number(d?.billRate) || 0) +
          (Number(d?.totalOvertimeHours) || 0) *
            (Number(d?.billRate) || 0) *
            1.5),
      0
    );
    return {
      invoiceId: (inv._id as { toString(): string }).toString(),
      invoiceNumber: inv.invoiceNumber ?? 'N/A',
      invoiceDate: inv.startDate ?? '',
      eventName: inv.eventName,
      jobName: inv.jobName,
      venueSlug: inv.venueSlug,
      invoiceAmount,
      ...(reportType === 'detail' ? { details } : {}),
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      invoices: invoicesData,
      pagination: { page, limit, total, totalPages },
    },
  });
}

export const POST = withEnhancedAuthAPI(reportHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
