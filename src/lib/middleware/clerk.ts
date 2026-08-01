// V4 middleware entrypoint. Only reached when IS_V4=true at runtime.
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import type { NextFetchEvent, NextRequest } from 'next/server';
import { routeConfig } from './routes';
import { isPublicRenderRoute } from './utils';

// Protect everything under a configured protected prefix so nested routes
// (e.g. /dashboard/foo) inherit the guard.
const isProtected = createRouteMatcher(
  routeConfig.protectedRoutes.map((r) => `${r}(.*)`)
);

const clerkHandler = clerkMiddleware(async (auth, req) => {
  // The public /:tenant/render-* pages must work logged out, and their leading
  // tenant segment could otherwise collide with a protected prefix.
  if (isProtected(req) && !isPublicRenderRoute(req.nextUrl.pathname)) {
    const { userId, redirectToSignIn } = await auth();
    // V4 supports two session types: Clerk (userId) and the Redis-backed OTP
    // email-code flow (an `otp_session_id` cookie, no Clerk userId). Let an
    // OTP-authenticated request through — the page's client guard and the
    // withEnhancedAuthAPI handlers still validate the session for real. Without
    // this, OTP users get bounced to Clerk sign-in on every protected route
    // (e.g. /profile, /dashboard).
    const hasOtpSession = !!req.cookies.get('otp_session_id')?.value;
    if (!userId && !hasOtpSession) return redirectToSignIn();
  }
});

export function clerkMiddlewareHandler(
  request: NextRequest,
  event: NextFetchEvent
) {
  return clerkHandler(request, event);
}
