import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/server/auth0";

/**
 * Handle GET requests to /api/auth/profile
 * This returns the user's profile information
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth0.getSession(req);

    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    return NextResponse.json(session.user);
  } catch (error) {
    console.error("Profile route error:", error);
    return NextResponse.json(
      { error: "Failed to get profile" },
      { status: 500 }
    );
  }
}
