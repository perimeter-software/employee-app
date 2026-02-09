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

  const isFullUrl = (url: string) => /^https?:\/\//i.test(url);

  // Images base URL (same logic as documents page): env or derive from VERCEL_ENV
  const getImagesBaseUrl = (): string => {
    const envBase = process.env.NEXT_PUBLIC_IMAGES_BASE_URL;
    if (envBase) return envBase.replace(/\/$/, '');
    const vercelEnv = process.env.VERCEL_ENV;
    if (vercelEnv === 'production') return 'https://images.stadiumpeople.com';
    if (vercelEnv === 'preview') return 'https://images.stage.stadiumpeople.com';
    return 'https://images.dev.stadiumpeople.com';
  };
  const imagesBaseUrl = getImagesBaseUrl();
  const tenantPath = request.user?.tenant?.url || 'sp';
  const buildFullLogoUrl = (relativePath: string): string => {
    const path = relativePath.replace(/^\//, '');
    return `${imagesBaseUrl}/${tenantPath}/${path}`;
  };

  // For each venue, capture a full logo URL from any invoice in this set (so we can reuse when venue only has relative path).
  const fullLogoByVenue: Record<string, string> = {};
  for (const inv of raw as Array<Record<string, unknown>>) {
    const slug = inv.venueSlug as string | undefined;
    const logo = (inv.logoUrl as string) || '';
    if (slug && logo && isFullUrl(logo)) fullLogoByVenue[slug] = logo;
  }

  // Look up venue records for all venues in this result set.
  const venueSlugs = [
    ...new Set(
      (raw as Array<Record<string, unknown>>)
        .filter((inv) => inv.venueSlug)
        .map((inv) => String(inv.venueSlug))
    ),
  ];
  let venueLogoBySlug: Record<string, string> = {};
  if (venueSlugs.length > 0) {
    const venues = await db
      .collection('venues')
      .find({ slug: { $in: venueSlugs } })
      .project({ slug: 1, logoUrl: 1, logoUrls: 1 })
      .toArray();
    venueLogoBySlug = Object.fromEntries(
      (venues as Array<Record<string, unknown>>)
        .map((v) => {
          const slug = v.slug as string;
          const logo =
            (v.logoUrl as string) ||
            (Array.isArray(v.logoUrls) && (v.logoUrls[0] as string)) ||
            '';
          return [slug, logo];
        })
        .filter(([, logo]) => !!logo)
    );
  }

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
    const venueSlug = inv.venueSlug as string | undefined;
    const venueLogo = venueSlug ? venueLogoBySlug[venueSlug] : '';
    const invLogo = (inv.logoUrl as string) || '';
    // Use venue logo when it's a full URL; else use invoice's full URL; else use full URL from another invoice for same venue; else venue or invoice as-is.
    let logoUrl = (venueLogo && isFullUrl(venueLogo))
      ? venueLogo
      : (invLogo && isFullUrl(invLogo))
        ? invLogo
        : (venueSlug && fullLogoByVenue[venueSlug]) || venueLogo || invLogo || '';
    if (logoUrl && !isFullUrl(logoUrl)) {
      logoUrl = buildFullLogoUrl(logoUrl);
    }
    return {
      ...serialized,
      _id: inv._id instanceof ObjectId ? inv._id.toString() : String(inv._id),
      totalAmount,
      ...(logoUrl ? { logoUrl } : {}),
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
