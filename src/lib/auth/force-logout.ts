'use client';

// Single place that turns "this session is dead" into "you are back on the
// login screen". Called from the API 401 interceptor and from the client-side
// route guards, so an expired/invalid session can never leave a protected
// route spinning on requests that will keep failing.

// Routes that render without a session. Landing on one of these means the
// user is already looking at (or on their way to) the login screen, so a
// logout redirect would just bounce them in circles.
const PUBLIC_PREFIXES = [
  '/sign-in',
  '/sign-up',
  '/terms',
  '/link',
  '/logout',
  '/offline',
  '/compatibility-mode',
  '/api/auth',
];

export function isPublicPathname(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

// Guards against N in-flight queries all 401-ing and each firing its own
// navigation (which cancels the previous one and can loop).
let logoutInFlight = false;

/**
 * Hard-logs the user out: clears client-side auth remnants and hands off to
 * `/api/auth/logout`, which clears the server session cookies (Clerk / Auth0 /
 * OTP) and redirects back to the login screen with `?expired=1` plus the
 * `returnTo` path so the user resumes where they were after signing in again.
 *
 * No-op on public routes and after the first call.
 */
export function forceSessionLogout(): void {
  if (typeof window === 'undefined') return;
  if (logoutInFlight) return;

  const { pathname, search } = window.location;
  if (isPublicPathname(pathname)) return;

  logoutInFlight = true;

  try {
    sessionStorage.clear();
    Object.keys(localStorage)
      .filter((key) => key.toLowerCase().includes('auth'))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage can throw in private-mode / embedded browsers — logout proceeds.
  }

  const returnTo = encodeURIComponent(`${pathname}${search}`);
  window.location.replace(`/api/auth/logout?expired=1&returnTo=${returnTo}`);
}
