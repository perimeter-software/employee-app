/**
 * Build the public S3 base URL for a tenant's asset bucket.
 *
 * All images (venue logos/banners, event attachments, user photos) moved from
 * the legacy EFS/nginx host (`https://images.stadiumpeople.com/sp`) to per-tenant
 * S3 buckets. gig-v4-backend writes uploads ONLY to S3 now, so the legacy host is
 * missing anything created/updated in v4 — which is why new venues' logos/banners
 * 404 in this app while gignology-v4 (which points at S3) shows them.
 *
 * Bucket naming mirrors the backend's `S3StorageService.getTenantBucketName`
 * EXACTLY so this always points where the object actually lives:
 *   Production: gignology-{slug}-prod
 *   Stage/Dev:  gignology-{slug}-stage
 * (suffix keyed off NODE_ENV, same as the backend).
 *
 * The S3 key drops the legacy uploadPath segment ("sp"/…): objects live at
 * `{venueSlug}/venues/logo/{file}`, NOT `sp/{venueSlug}/…`. Since every consumer
 * builds `${base}/${slug}/venues/...`, returning a base WITHOUT the `/sp` suffix
 * (unlike the old `imageUrl`) yields the correct S3 URL for free.
 */
export function buildTenantImageBase(
  slug: string | null | undefined,
): string | undefined {
  if (!slug) return undefined;
  const sanitized = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const region = process.env.AWS_REGION || "us-east-2";
  const suffix = process.env.NODE_ENV === "production" ? "prod" : "stage";
  return `https://gignology-${sanitized}-${suffix}.s3.${region}.amazonaws.com`;
}
