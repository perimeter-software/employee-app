// lib/auth0.ts - Auth0 v3 setup using named exports
// Using named exports approach instead of initAuth0

// Re-export Auth0 functions for consistency
export { 
  getSession, 
  getAccessToken, 
  withApiAuthRequired, 
  withPageAuthRequired,
  handleAuth,
  handleLogin,
  handleLogout,
  handleCallback,
  handleProfile
} from '@auth0/nextjs-auth0';
