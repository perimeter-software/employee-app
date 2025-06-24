import { handleAuth } from '@auth0/nextjs-auth0';

// Force dynamic rendering for Auth0 routes
export const dynamic = 'force-dynamic';

export const GET = handleAuth();
