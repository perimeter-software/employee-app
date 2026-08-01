// Shared handling for the `returnTo` param that carries "where the user was
// heading before we bounced them to login" through the logout → login → app
// round trip.
//
// The value travels as a querystring param, so it is encoded once in the URL
// and decoded once on read (`URLSearchParams.get`). Encoding it a second time
// before handing it to `set()` — or before pushing it as a route — produces
// `%2Fevents`, which the router treats as a single path segment and navigates
// to `/%2Fevents`. Everything reading a returnTo goes through here.

const DEFAULT_RETURN_TO = '/time';

/**
 * Normalizes a raw `returnTo` value into a safe same-origin path.
 *
 * - Unwraps accidental double-encoding (`%252Fevents` → `%2Fevents` → `/events`).
 * - Rejects anything that isn't a relative path (absolute URLs,
 *   protocol-relative `//host`) so it can't be used as an open redirect.
 *
 * Returns `null` when the value is missing or unusable, so callers can pick
 * their own fallback.
 */
export function normalizeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;

  let path = value;
  // Unwrap up to a couple of extra encoding layers; bail out if a layer isn't
  // valid percent-encoding.
  for (let i = 0; i < 3 && path.startsWith('%'); i++) {
    try {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    } catch {
      return null;
    }
  }

  if (!path.startsWith('/') || path.startsWith('//')) return null;

  return path;
}

/** Same as `normalizeReturnTo`, but falls back to the default landing route. */
export function resolveReturnTo(
  value: string | null | undefined,
  fallback: string = DEFAULT_RETURN_TO
): string {
  return normalizeReturnTo(value) ?? fallback;
}
