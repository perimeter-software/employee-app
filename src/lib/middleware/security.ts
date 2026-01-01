import type { NextResponse } from 'next/server';
import { NextResponse as Response } from 'next/server';


export async function securityMiddleware(): Promise<NextResponse | null> {
  // Add security headers
  const response = Response.next();

  // Security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');

  const connectSrc = [
    "'self'",
    'https://maps.googleapis.com',
    'https://maps.gstatic.com',
    'https://*.auth0.com',
    'https://*.pureblue.ai', // PureBlue API and services
  ];

  const frameSrc = [
    'https://*.auth0.com',
    'https://*.pureblue.info', // PureBlue chatbot iframes
    // AWS S3 URLs - allow all S3 endpoints for PDF viewing
    'https://*.amazonaws.com', // Matches all AWS S3 URLs (s3.region.amazonaws.com, bucket.s3.region.amazonaws.com, etc.)
  ];

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
