import { middleware as coreMiddleware, matcher } from '@/lib/middleware/core';

export { coreMiddleware as middleware };

// Next.js requires `config.matcher` (not a top-level `matcher` export) to
// apply matcher patterns. Without this, Clerk middleware was not setting up
// the auth context for API routes, causing `auth()` to return signed-out
// even when the browser had valid Clerk cookies.
export const config = {
  matcher,
};
