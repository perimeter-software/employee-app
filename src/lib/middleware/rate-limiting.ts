import type { NextRequest, NextResponse } from 'next/server';
import { NextResponse as Response } from 'next/server';
import redisService from '@/lib/cache/redis-client';

const RATE_LIMIT_PREFIX = 'ratelimit:';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

function getRouteConfig(pathname: string): RateLimitConfig {
  if (
    pathname.includes('/notifications') ||
    pathname.includes('/current-user') ||
    pathname.includes('/companies/primary')
  ) {
    return { windowMs: 60, maxRequests: 30 };
  }
  return { windowMs: 60, maxRequests: 60 };
}

/**
 * Redis-backed rate limiter using atomic INCR + EXPIRE.
 * Designed to run inside API route handlers (Node.js runtime),
 * NOT in Edge middleware.
 *
 * Fail-open: if Redis is unreachable the request is allowed through.
 */
export async function rateLimitCheck(
  request: NextRequest
): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  const { windowMs, maxRequests } = getRouteConfig(pathname);
  const key = `${RATE_LIMIT_PREFIX}${ip}:${pathname}`;

  try {
    const count = await redisService.incr(key, windowMs);

    if (count !== null && count > maxRequests) {
      return Response.json(
        {
          error: 'Too many requests',
          message: 'Rate limit exceeded. Please try again later.',
        },
        { status: 429 }
      );
    }
  } catch {
    // Fail-open: allow the request if Redis is unavailable
  }

  return null;
}
