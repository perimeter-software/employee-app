// src/domains/shared/hooks/use-page-auth.ts - Fixed version (no server-side imports)
import { useUser } from '@auth0/nextjs-auth0/client';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

// Simple client-side route checking (no server imports)
function isPublicRoute(pathname: string): boolean {
  const publicRoutes = ['/', '/about', '/contact', '/api/health'];

  return publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
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

  const { user, isLoading, error } = useUser();
  const pathname = usePathname();

  // Determine if auth is required based on route or explicit option
  const authRequired =
    requireAuth !== undefined ? requireAuth : requiresAuthentication(pathname);

  useEffect(() => {
    // Only apply auth logic if authentication is required
    if (!authRequired) return;

    // If not loading and no user and no error, redirect to login
    if (!isLoading && !user && !error) {
      const returnUrl = encodeURIComponent(pathname);
      const loginUrl = `${redirectTo}?returnTo=${returnUrl}`;
      window.location.href = loginUrl;
      return;
    }

    // Handle auth errors
    if (error && onAuthError) {
      onAuthError(error);
    }
  }, [user, isLoading, error, pathname, authRequired, redirectTo, onAuthError]);

  return {
    user,
    isLoading,
    error,
    isAuthenticated: !!user,
    shouldShowContent: !authRequired || !!user,
  };
}
