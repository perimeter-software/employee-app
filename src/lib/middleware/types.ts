import type { NextRequest, NextResponse } from "next/server";
import { Auth0SessionUser } from "@/domains/user";

export type MiddlewareFunction = (
  request: NextRequest
) => Promise<NextResponse | null>;

export type RouteConfig = {
  publicRoutes: string[];
  protectedRoutes: string[];
  authRoutes: string[];
  staticAssets: string[];
};

export type LogEntry = {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  requestId: string;
  method: string;
  url: string;
  ip: string;
  userAgent?: string;
  duration?: number;
  status?: number;
  message: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

export type AuthenticatedRequest = NextRequest & {
  user: Auth0SessionUser;
};

// Fixed: Make RouteHandler more flexible to allow different response types
export type RouteHandler<T = unknown> = (
  request: AuthenticatedRequest,
  context?: Record<string, unknown>
) => Promise<NextResponse<T> | NextResponse<unknown>>;

// Alternative: If you want to be more specific about error responses
export type ApiResponse<T> = T | { error: string; message: string };

export type StrictRouteHandler<T = unknown> = (
  request: AuthenticatedRequest,
  context?: Record<string, unknown>
) => Promise<NextResponse<ApiResponse<T>>>;
