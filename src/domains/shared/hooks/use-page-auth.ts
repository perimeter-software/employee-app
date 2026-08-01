// src/domains/shared/hooks/use-page-auth.ts - Fixed version (no server-side imports)
import { useAppUser } from '@/domains/user/hooks/useAppUser';
import { forceSessionLogout, isPublicPathname } from '@/lib/auth/force-logout';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

// Simple client-side route checking (no server imports)
function isPublicRoute(pathname: string): boolean {
  const publicRoutes = ['/about', '/contact', '/api/health'];

  return (
    // `/`, `/sign-in`, `/terms`, … — the routes that render without a session
    isPublicPathname(pathname) ||
    publicRoutes.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`)
    )
  );
}

function isAuthRoute(pathname: string): boolean {
  return pathname.startsWith('/auth');
}

function isStaticAsset(pathname: string): boolean {
  const staticPaths = [
    '/_next',
    '/favicon.ico',
    '/images',
    '/powered-by-gig-blue.png',
    '/sitemap.xml',
    '/robots.txt',
  ];

  return staticPaths.some((asset) => pathname.startsWith(asset));
}

function requiresAuthentication(pathname: string): boolean {
  // If it's a public route, auth is not required
  if (isPublicRoute(pathname)) {
    return false;
  }

  // If it's an auth route (like login), auth is not required
  if (isAuthRoute(pathname)) {
    return false;
  }

  // If it's a static asset, auth is not required
  if (isStaticAsset(pathname)) {
    return false;
  }

  // For all other routes, assume auth is required
  return true;
}

export function usePageAuth(
  options: {
    requireAuth?: boolean;
    redirectTo?: string;
    onAuthError?: (error: Error) => void;
  } = {}
) {
  const { requireAuth, redirectTo = '/', onAuthError } = options;

  const { user, error, isResolved } = useAppUser();
  const pathname = usePathname();

  // Determine if auth is required based on route or explicit option
  const authRequired =
    requireAuth !== undefined ? requireAuth : requiresAuthentication(pathname);

  useEffect(() => {
    // Only apply auth logic if authentication is required
    if (!authRequired) return;

    // Auth resolution itself failed (expired/invalid session, /api/auth/me
    // rejected). Treat it as "no session": clear it and go to login instead of
    // leaving the page on an error/loading screen firing doomed requests.
    if (error) {
      onAuthError?.(error);
      forceSessionLogout();
      return;
    }

    // Redirect only on a SETTLED "no session". Keying this off `!isLoading`
    // instead meant a single unresolved frame — which happens on every route
    // change, since each page mounts its own observer — hard-redirected a
    // perfectly valid session to login, reloading the whole app.
    if (isResolved && !user) {
      // Include query parameters in returnUrl to preserve them (e.g., ?stubId=...)
      const searchParams = typeof window !== 'undefined' ? window.location.search : '';
      const fullPath = pathname + searchParams;
      const returnUrl = encodeURIComponent(fullPath);
      const loginUrl = `${redirectTo}?returnTo=${returnUrl}`;
      window.location.replace(loginUrl);
      return;
    }
  }, [user, isResolved, error, pathname, authRequired, redirectTo, onAuthError]);

  // While a redirect to login is pending, keep reporting isLoading=true so
  // pages render their loading state (spinner) instead of briefly flashing
  // their UnauthenticatedState component before the redirect takes effect.
  // The useEffect above fires it on the next tick; until then the page should
  // look like it's still resolving auth. An auth error also ends in a redirect
  // (forced logout), so it counts.
  const willRedirect = authRequired && (!!error || (isResolved && !user));

  // A user we already have is enough to render, even if the underlying query
  // is refetching in the background — otherwise every revalidation would blank
  // the screen back to a spinner.
  const isResolving = !isResolved && !user;

  return {
    user,
    isLoading: isResolving || willRedirect,
    error,
    isAuthenticated: !!user,
    shouldShowContent: !authRequired || !!user,
  };
}
