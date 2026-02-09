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

  type Inv = {
    details?: Array<{
      totalHours?: number;
      totalOvertimeHours?: number;
      billRate?: number;
      positionName?: string;
      [k: string]: unknown;
    }>;
    remittanceInformation?: {
      name?: string;
      address?: string;
      city?: string;
      state?: string;
      zip?: string;
      attn?: string;
      notes?: string;
    };
    customerInformation?: {
      name?: string;
      address?: string;
      city?: string;
      state?: string;
      zip?: string;
      attn?: string;
    };
    invoiceInformation?: {
      date?: string;
      dueDate?: string;
      dateISO?: string;
      dueDateISO?: string;
      purchaseOrder?: string;
    };
    purchaseOrder?: string;
    invoiceDate?: string;
    startDate?: string;
    [k: string]: unknown;
  };

  const raw = inv as Inv;
  const details = raw.details ?? [];
  const totalAmount = details.reduce(
    (sum, d) =>
      sum +
      ((Number(d?.totalHours) || 0) * (Number(d?.billRate) || 0) +
        (Number(d?.totalOvertimeHours) || 0) *
          (Number(d?.billRate) || 0) *
          1.5),
    0
  );

  // Map DB fields to PDF shape (same as stadium-people: from, to, invoiceInformation)
  const remittance = raw.remittanceInformation ?? {};
  const customer = raw.customerInformation ?? {};
  const info = raw.invoiceInformation ?? {};
  const from = {
    name: remittance.name ?? 'Stadium People',
    address: remittance.address ?? '',
    city: remittance.city ?? '',
    state: remittance.state ?? '',
    zip: remittance.zip ?? '',
    attn: remittance.attn ?? '',
    notes: remittance.notes ?? '',
  };
  const to = {
    name: customer.name ?? raw.venueName ?? raw.companyName ?? '',
    address: customer.address ?? '',
    city: customer.city ?? '',
    state: customer.state ?? '',
    zip: customer.zip ?? '',
    attn: customer.attn ?? '',
  };
  const purchaseOrder =
    raw.purchaseOrder ?? info.purchaseOrder ?? '';
  const invoiceDateDisplay = info.date ?? formatInvoiceDate(raw.invoiceDate) ?? raw.startDate ?? '';
  const dueDate = info.dueDate ?? '';
  const notes = remittance.notes ?? '';

  // Normalize details: ensure position is set from positionName or other common keys
  const normalizedDetails = details.map((d) => {
    const raw = d as { positionName?: string; position?: string; positionTitle?: string };
    return {
      ...d,
      position: raw.positionName ?? raw.position ?? raw.positionTitle ?? '',
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      ...inv,
      _id: (inv as { _id: ObjectId })._id.toString(),
      totalAmount,
      from,
      to,
      notes,
      purchaseOrder,
      invoiceDate: invoiceDateDisplay,
      dueDate,
      details: normalizedDetails,
    },
  });
}

function formatInvoiceDate(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${m}/${day}/${String(y).slice(-2)}`;
  } catch {
    return '';
  }
}

export const GET = withEnhancedAuthAPI(getInvoiceByIdHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
