// Single source of truth for whether this build runs on Clerk (V4) or Auth0 (legacy).
// Exposed publicly so client and server resolve to the same value without prop drilling.
// Default is false — Auth0 path is untouched unless explicitly opted in at build time.
export const IS_V4 =
  process.env.NEXT_PUBLIC_IS_V4 === 'true' || process.env.IS_V4 === 'true';
