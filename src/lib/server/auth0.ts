// lib/auth0.ts
import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const auth0 = new Auth0Client({
  // Core Auth0 settings
  domain: process.env.AUTH0_DOMAIN!,
  clientId: process.env.AUTH0_CLIENT_ID!,
  clientSecret: process.env.AUTH0_CLIENT_SECRET!,
  secret: process.env.AUTH0_SECRET!,
  appBaseUrl: process.env.APP_BASE_URL!,

  // Authorization parameters
  authorizationParameters: {
    scope: "openid profile email offline_access",
    audience: process.env.AUTH0_AUDIENCE!, // Your API audience
  },

  // Session configuration
  session: {
    rolling: true,
    absoluteDuration: 3 * 24 * 60 * 60, // 3 days in seconds
    inactivityDuration: 24 * 60 * 60, // 1 day in seconds
    cookie: {
      sameSite: "lax",
      transient: false,
    },
  },

  // Custom routes (optional - these are the defaults)
  routes: {
    callback: "/auth/callback",
    login: "/auth/login",
    logout: "/auth/logout",
  },
});
