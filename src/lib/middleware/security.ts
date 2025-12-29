import type { NextResponse } from 'next/server';
import { NextResponse as Response } from 'next/server';

/**
 * Get PureBlue URLs from environment variables for CSP
 */
function getPureBlueUrls(): { apiUrl?: string; chatUrl?: string } {
  const apiUrl = process.env.NEXT_PUBLIC_PUREBLUE_API_URL;
  const chatUrl = process.env.NEXT_PUBLIC_PUREBLUE_CHAT_URL;
  return { apiUrl, chatUrl };
}

export async function securityMiddleware(): Promise<NextResponse | null> {
  // Add security headers
  const response = Response.next();

  // Security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Get PureBlue URLs for CSP
  const { apiUrl, chatUrl } = getPureBlueUrls();

  // Build CSP directives
  const connectSrc = [
    "'self'",
    'https://maps.googleapis.com',
    'https://maps.gstatic.com',
    'https://*.auth0.com',
  ];
  if (apiUrl) {
    connectSrc.push(apiUrl);
  }

  const frameSrc = ['https://*.auth0.com'];
  if (chatUrl) {
    frameSrc.push(chatUrl);
  }

  // CSP header with Google Maps and PureBlue support
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https: blob:",
      "font-src 'self' https://fonts.gstatic.com",
      `connect-src ${connectSrc.join(' ')}`,
      `frame-src ${frameSrc.join(' ')}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      'upgrade-insecure-requests',
    ].join('; ')
  );

  return response;
}
