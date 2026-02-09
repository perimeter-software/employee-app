/**
 * List invoices for Client users only.
 * Replicates sp1-api getInvoices + overrideFiltersForClients: filter by clientOrgs (venueSlug), startDate, endDate.
 * No calls to sp1-api; uses tenant DB only.
 */

import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/lib/middleware/types';
import {
  getClientOrgSlugsForInvoices,
  requireClientUser,
} from './lib/client-orgs';

async function getInvoicesHandler(request: AuthenticatedRequest) {
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

  const clientOrgSlugs = await getClientOrgSlugsForInvoices(request);
  if (clientOrgSlugs.length === 0) {
    return NextResponse.json({
      success: true,
      pagination: { page: 1, limit: 10, totalPages: 0, total: 0 },
      count: 0,
      total: 0,
      data: [],
    });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get('limit') || '10', 10))
  );
  const startDateParam = searchParams.get('startDate');
  const endDateParam = searchParams.get('endDate');
  const sort = searchParams.get('sort') || 'eventDate:desc';

  const { db } = await getTenantAwareConnection(request);
  const coll = db.collection('invoice-batches');

  const filter: Record<string, unknown> = {
    venueSlug: { $in: [...clientOrgSlugs] },
  };
  // Period: filter by pay period (invoice startDate/endDate) overlapping the selected period (same as sp1-api/stadium-people).
  if (startDateParam && endDateParam) {
    filter.startDate = { $lte: endDateParam };
    filter.endDate = { $gte: startDateParam };
  }

  const total = await coll.countDocuments(filter);
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  const skip = limit > 0 ? (page - 1) * limit : 0;

  const [sortField, sortOrder] = sort.split(':');
  const sortObj: Record<string, 1 | -1> = {
    [sortField || 'eventDate']: sortOrder === 'asc' ? 1 : -1,
  };

  const cursor = coll.find(filter).sort(sortObj);
  if (limit > 0) cursor.skip(skip).limit(limit);

  const raw = await cursor.toArray();

  /** Serialize for JSON: ObjectId → string, Date → ISO string, nested objects/arrays recursed. */
  function serializeValue(v: unknown): unknown {
    if (v == null) return v;
    if (v instanceof ObjectId) return v.toString();
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(serializeValue);
    if (typeof v === 'object' && v !== null) {
      const o = v as Record<string, unknown>;
      if (o.$oid != null && typeof o.$oid === 'string') return o.$oid;
      if (o.$date != null)
        return typeof o.$date === 'string'
          ? o.$date
          : ((o.$date as Date)?.toISOString?.() ?? o.$date);
      return Object.fromEntries(
        Object.entries(o).map(([k, val]) => [k, serializeValue(val)])
      );
    }
    return v;
  }

  const data = raw.map((inv: Record<string, unknown>) => {
    const details =
      (inv.details as Array<{
        totalHours?: number;
        totalOvertimeHours?: number;
        billRate?: number;
      }>) ?? [];
    const totalAmount = details.reduce(
      (sum, d) =>
        sum +
        ((Number(d?.totalHours) || 0) * (Number(d?.billRate) || 0) +
          (Number(d?.totalOvertimeHours) || 0) *
            (Number(d?.billRate) || 0) *
            1.5),
      0
    );
    const serialized = serializeValue(inv) as Record<string, unknown>;
    return {
      ...serialized,
      _id: inv._id instanceof ObjectId ? inv._id.toString() : String(inv._id),
      totalAmount,
    };
  });

  return NextResponse.json({
    success: true,
    pagination: { page, limit, totalPages, total },
    count: totalPages,
    total,
    data,
  });
}

export const GET = withEnhancedAuthAPI(getInvoicesHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
