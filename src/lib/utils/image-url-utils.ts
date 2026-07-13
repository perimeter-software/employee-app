// Helpers for building shared/static asset URLs from the configured image server.

/**
 * Returns the origin (protocol + hostname) of the configured image server,
 * stripping any path or port. The raw image-server value may carry an
 * upload path or port; shared assets are served from the bare host.
 *
 * Mirrors the origin-extraction logic used by FileViewer's `getBaseImageUrl`.
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

/**
 * Builds the direct image-server URL for an applicant-owned file.
 *
 * The company `uploadPath` segment is required — the shared API stores applicant
 * files under `${imageServer}/${uploadPath}/applicants/...`. Mirrors both the
 * old app's `getCompanyImageUrl(company)` base and FileViewer's `getDirectUrl`.
 *
 * @param imageServer Raw image server value (e.g. NEXT_PUBLIC_IMAGE_SERVER).
 * @param uploadPath Company upload path (e.g. 'sp'); falls back to 'sp' when absent.
 * @param applicantId The applicant's id.
 * @param type File category folder (e.g. 'signature', 'document').
 * @param filename The stored file name.
 */
export function getApplicantFileUrl(
  imageServer: string | undefined,
  uploadPath: string | undefined,
  applicantId: string,
  type: string,
  filename: string
): string {
  const path = uploadPath || 'sp';
  return `${imageServer ?? ''}/${path}/applicants/${applicantId}/${type}/${filename}`;
}
