import { requiresAuthentication } from "@/lib/middleware";
import { useUser } from "@auth0/nextjs-auth0";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function usePageAuth(
  options: {
    requireAuth?: boolean;
    redirectTo?: string;
    onAuthError?: (error: Error) => void;
  } = {}
) {
  const {
    requireAuth = true,
    redirectTo = "/api/auth/login",
    onAuthError,
  } = options;
  const { user, isLoading, error } = useUser();
  const pathname = usePathname();

  useEffect(() => {
    if (!requireAuth && !requiresAuthentication(pathname)) return;

    if (!isLoading && !user && !error) {
      const returnUrl = encodeURIComponent(pathname);
      const loginUrl = `${redirectTo}?returnTo=${returnUrl}`;
      window.location.href = loginUrl;
      return;
    }

    if (error && onAuthError) {
      onAuthError(error);
    }
  }, [user, isLoading, error, pathname, requireAuth, redirectTo, onAuthError]);

  return {
    user,
    isLoading,
    error,
    isAuthenticated: !!user,
    shouldShowContent: !!user || !requireAuth,
  };
}
