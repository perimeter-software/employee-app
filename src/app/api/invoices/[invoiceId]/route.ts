/**
 * Get single invoice by ID. Client users only; invoice must be for a venue in their clientOrgs.
 * Replicates sp1-api getInvoiceById + venue restriction. No calls to sp1-api.
 */

import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/lib/middleware/types';
import {
  getClientOrgSlugsForInvoices,
  requireClientUser,
} from '../lib/client-orgs';
import { ObjectId } from 'mongodb';

async function getInvoiceByIdHandler(
  request: AuthenticatedRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  if (!requireClientUser(request)) {
    return NextResponse.json(
      {
        success: false,
        message: 'Access denied. Client role required.',
        error: 'UNAUTHORIZED',
      },
      { status: 403 }
    );
  }

  const { invoiceId } = await context.params;
  if (!invoiceId || typeof invoiceId !== 'string') {
    return NextResponse.json(
      { success: false, message: 'invoiceId is required' },
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
  const inv = await db.collection('invoice-batches').findOne({ _id: oid });

  if (!inv) {
    return NextResponse.json(
      { success: false, message: 'Invoice not found' },
      { status: 404 }
    );
  }

  const venueSlug = (inv as { venueSlug?: string }).venueSlug;
  const allowed = venueSlug && clientOrgSlugs.includes(venueSlug);
  if (!allowed) {
    return NextResponse.json(
      { success: false, message: 'Access denied to this invoice' },
      { status: 403 }
    );
  }

  const details =
    (
      inv as {
        details?: Array<{
          totalHours?: number;
          totalOvertimeHours?: number;
          billRate?: number;
        }>;
      }
    ).details ?? [];
  const totalAmount = details.reduce(
    (sum, d) =>
      sum +
      ((Number(d?.totalHours) || 0) * (Number(d?.billRate) || 0) +
        (Number(d?.totalOvertimeHours) || 0) *
          (Number(d?.billRate) || 0) *
          1.5),
    0
  );

  return NextResponse.json({
    success: true,
    data: {
      ...inv,
      _id: (inv as { _id: ObjectId })._id.toString(),
      totalAmount,
    },
  });
}

export const GET = withEnhancedAuthAPI(getInvoiceByIdHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
