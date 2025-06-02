import type { NextRequest, NextResponse } from "next/server";
import { NextResponse as Response } from "next/server";

const rateLimitMap = new Map<string, { count: number; lastReset: number }>();

export async function rateLimitMiddleware(
  request: NextRequest
): Promise<NextResponse | null> {
  const ip =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 100;

  const userLimit = rateLimitMap.get(ip) || { count: 0, lastReset: now };

  // Reset if window expired
  if (now - userLimit.lastReset > windowMs) {
    userLimit.count = 0;
    userLimit.lastReset = now;
  }

  userLimit.count++;
  rateLimitMap.set(ip, userLimit);

  // Check if over limit
  if (userLimit.count > maxRequests) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  return null;
}
