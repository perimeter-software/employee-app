// V4 middleware entrypoint. Only reached when IS_V4=true at runtime.
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import type { NextFetchEvent, NextRequest } from 'next/server';
import { routeConfig } from './routes';

// Protect everything under a configured protected prefix so nested routes
// (e.g. /dashboard/foo) inherit the guard.
const isProtected = createRouteMatcher(
  routeConfig.protectedRoutes.map((r) => `${r}(.*)`)
);

const clerkHandler = clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) {
    const { userId, redirectToSignIn } = await auth();
    if (!userId) return redirectToSignIn();
  }
});

export function clerkMiddlewareHandler(
  request: NextRequest,
  event: NextFetchEvent
) {
  return clerkHandler(request, event);
}
