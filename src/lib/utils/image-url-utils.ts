// Asset URL helpers.
//
// Two S3 storage backends are in play, and the split matters:
//
//   1. Tenant-owned files (applicant attachments, signatures, user photos,
//      venue logos) live in a per-tenant bucket named
//      `gignology-{companySlug}-{stage|prod}`.
//   2. Shared/common assets (chatbot avatar, onboarding guide PDFs, state-tax
//      form PDFs) live in the single `gignology-common-{stage|prod}` bucket.
//
// Private tenant files (applicant attachments, signatures, user photos) must be
// presigned by the API — see `useFileUrl`. Public-read assets are addressed
// directly as plain URLs, no presigning: venue logos/banners via
// `resolveVenueLogoUrl`, and every common-bucket asset via
// `resolveCommonAssetUrl` (the common bucket is public-read in full).

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

// ─── Common bucket (shared assets) ──────────────────────────────────────────
//
// Shared assets live in the single `gignology-common-{stage|prod}` bucket — not
// a tenant bucket. The bucket IS the "common" namespace (there is no `common/`
// prefix inside it), with a top-level `static/` folder. The whole bucket is
// public-read, so — like venue logos — assets resolve to a direct URL with no
// presigning. This is the fixed-bucket analog of `buildTenantS3BaseUrl`: the
// old `{imageServer}/common/{key}` becomes `{commonBucketBase}/{key}`.

/** Base URL of the shared common-assets S3 bucket for the current environment. */
export function buildCommonS3BaseUrl(): string {
  return `https://gignology-common-${BUCKET_SUFFIX}.s3.${AWS_REGION}.amazonaws.com`;
}

/**
 * Public URL for a shared/common asset.
 *
 * @param assetPath Bucket-relative path from `static/…` onward (a leading slash
 *                  is tolerated and stripped — pass a raw path with spaces,
 *                  e.g. 'static/i-9 example docs.pdf'; segments are URL-encoded).
 */
export function resolveCommonAssetUrl(assetPath: string): string {
  const key = assetPath.replace(/^\/+/, '');
  // Encode each segment but keep the '/' that delimit S3 "folders".
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return `${buildCommonS3BaseUrl()}/${encoded}`;
}

/**
 * Public URL for a shared static asset (chatbot avatar, guide PDFs) under the
 * common bucket's `static/` folder. Pass the raw filename, spaces and all.
 */
export function commonStaticAssetUrl(filename: string): string {
  return resolveCommonAssetUrl(`static/${filename}`);
}
