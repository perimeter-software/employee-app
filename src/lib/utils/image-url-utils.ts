// Asset URL helpers.
//
// Two distinct storage backends are in play, and the split matters:
//
//   1. Tenant-owned files (applicant attachments, signatures, user photos,
//      venue logos) live in S3, in a per-tenant bucket named
//      `gignology-{companySlug}-{stage|prod}`.
//   2. Shared/common assets (file-type icons, guide PDFs, state-tax form PDFs)
//      still live on the legacy image server, which serves them off `/common`.
//      They were never migrated to S3, so they keep using NEXT_PUBLIC_IMAGE_SERVER.
//
// Private tenant files must be presigned by the API — see `useFileUrl`. Only
// assets covered by the buckets' public-read policy (logos/banners) may be
// addressed directly via `resolveVenueLogoUrl`.

const AWS_REGION = process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-2';

// Mirrors gig-v4-backend's S3StorageService.getTenantBucketName, which always
// suffixes the bucket. NODE_ENV can't drive this: it is 'production' for every
// `next build`, including stage deploys.
const BUCKET_SUFFIX =
  process.env.NEXT_PUBLIC_APP_ENV === 'production' ? 'prod' : 'stage';

/**
 * Base URL of a tenant's S3 bucket.
 *
 * The bucket is named after the company SLUG, not uploadPath — uploadPath is a
 * legacy image-server path segment (e.g. 'sp' for the 'stadiumpeople' tenant)
 * and resolves to the wrong bucket wherever the two differ.
 */
export function buildTenantS3BaseUrl(companySlug: string): string {
  const slug = companySlug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `https://gignology-${slug}-${BUCKET_SUFFIX}.s3.${AWS_REGION}.amazonaws.com`;
}

/**
 * Resolves a venue logo to a directly-addressable S3 URL.
 *
 * Venue logos are covered by the bucket's public-read policy, so they need no
 * presigning — which keeps this a pure string build, usable while mapping over
 * a list of jobs.
 *
 * @param logoUrl Stored logo filename (or an absolute URL, passed through).
 * @param venueSlug The venue's slug.
 * @param companySlug The primary company's slug (selects the bucket).
 */
export function resolveVenueLogoUrl(
  logoUrl: string | undefined | null,
  venueSlug: string | undefined | null,
  companySlug: string | undefined | null
): string | undefined {
  if (!logoUrl) return undefined;
  if (/^https?:\/\//i.test(logoUrl)) return logoUrl;
  if (!venueSlug || !companySlug) return undefined;

  const base = buildTenantS3BaseUrl(companySlug);
  return `${base}/${venueSlug}/venues/logo/${encodeURIComponent(logoUrl)}`;
}

// ─── S3 object keys ─────────────────────────────────────────────────────────
//
// The API derives the bucket from the caller's tenant, so keys are
// bucket-relative and carry no company slug or uploadPath prefix. A key is
// exactly the `/upload/...` path a file was POSTed to plus its filename
// (see gig-v4-backend uploadCore.controller `_buildS3Key`).

/** S3 key for an applicant-owned file, e.g. a signature or uploaded document. */
export function applicantFileKey(
  applicantId: string,
  type: string,
  filename: string
): string {
  return `applicants/${applicantId}/${type}/${filename}`;
}

/** S3 key for a user's profile photo. */
export function userPhotoKey(userId: string, filename: string): string {
  return `users/${userId}/photo/${filename}`;
}

// ─── Legacy image server (common assets only) ───────────────────────────────

/**
 * Returns the origin (protocol + hostname) of the configured image server,
 * stripping any path or port. The raw image-server value may carry an
 * upload path or port; shared assets are served from the bare host.
 *
 * @param imageServer Raw image server value (e.g. NEXT_PUBLIC_IMAGE_SERVER).
 * @returns The `${protocol}//${hostname}` origin, or '' when no server is set.
 */
export function getImageServerOrigin(imageServer?: string): string {
  if (!imageServer) return '';

  try {
    const url = new URL(imageServer);
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return imageServer;
  }
}

/**
 * Builds a full URL to a shared static asset. Shared assets live under
 * `/common/static` on the image host — mirroring stadium-people's
 * `getCommonBaseImageUrl`, which maps the company upload path to `/common`.
 *
 * NOTE: these assets are still served by the legacy image server; they were not
 * part of the S3 migration. Tenant-owned files must NOT use this helper.
 *
 * @param imageServer Raw image server value (e.g. NEXT_PUBLIC_IMAGE_SERVER).
 * @param assetPath Path to the asset relative to `/common/static`
 *                  (e.g. 'pdf-icon.png').
 * @returns The full asset URL, falling back to a root-relative `/static/...`
 *          path (served by the app's own public assets) when no image server
 *          is configured.
 */
export function getStaticAssetUrl(imageServer: string | undefined, assetPath: string): string {
  const normalizedPath = assetPath.replace(/^\/+/, '');
  const origin = getImageServerOrigin(imageServer);
  return origin ? `${origin}/common/static/${normalizedPath}` : `/static/${normalizedPath}`;
}
