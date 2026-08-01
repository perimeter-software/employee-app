/**
 * Rewrite a stored image URL to S3 when it points at a legacy EFS/nginx host.
 *
 * Most events store `logoUrl` as a FULL legacy URL, e.g.
 *   https://images.stadiumpeople.com/sp/ford/venues/logo/ford-venuelogo.png
 * and the event components use it verbatim — so those logos still load from EFS
 * even though v4 writes uploads only to S3 (new/updated ones would 404 there).
 * This rewrites such URLs to the tenant S3 bucket, dropping the leading
 * uploadPath segment ("sp"/"sterling"/…) exactly like gignology-v4's
 * resolveImageUrl / the backend's rewriteEventLogoUrl:
 *   .../sp/ford/venues/logo/x.png  →  {s3Base}/ford/venues/logo/x.png
 *
 * Client-safe: the S3 base is passed in (the `imageBaseUrl` the components
 * already hold, which findPrimaryCompany now sets to the S3 bucket) — no env
 * access needed in the browser.
 */

const OLD_IMAGE_HOSTS = [
  "images.stadiumpeople.com",
  "images.dev.gignology.biz",
  "images.v4.gignology.biz",
];

export function resolveImageUrl(
  url: string | null | undefined,
  s3Base: string | null | undefined,
): string | null | undefined {
  if (!url) return url;

  // Already an S3 URL — leave as-is.
  if (url.includes(".s3.") && url.includes("amazonaws.com")) return url;

  // Legacy EFS/nginx host — rewrite to the tenant S3 bucket.
  for (const host of OLD_IMAGE_HOSTS) {
    if (url.includes(host)) {
      if (!s3Base) return url; // no base to rewrite to; leave untouched
      try {
        const u = new URL(url);
        // Drop the leading uploadPath segment: the migrated S3 object lives
        // WITHOUT it (the prefixed key 403s). Keep pathname encoding intact.
        const segments = u.pathname.split("/").filter(Boolean);
        const key =
          segments.length >= 2
            ? segments.slice(1).join("/")
            : segments.join("/");
        return `${s3Base.replace(/\/$/, "")}/${key}`;
      } catch {
        return url;
      }
    }
  }

  // Any other absolute URL — leave as-is.
  return url;
}
