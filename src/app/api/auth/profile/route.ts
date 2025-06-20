import { NextResponse } from "next/server";
import { withEnhancedAuthAPI } from "@/lib/middleware";
import type { AuthenticatedRequest } from "@/domains/user/types";

/**
 * Handle GET requests to /api/auth/profile
 * This returns the user's profile information
 */
async function getProfileHandler(
  request: AuthenticatedRequest,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  try {
    const user = request.user;

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Profile route error:", error);
    return NextResponse.json(
      { error: "internal-error", message: "Failed to get profile" },
      { status: 500 }
    );
  }
}

// Export with enhanced auth wrapper (validates database user AND tenant)
export const GET = withEnhancedAuthAPI(getProfileHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
