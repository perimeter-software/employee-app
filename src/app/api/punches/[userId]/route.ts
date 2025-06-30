import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import {
  deletePunchById,
  findAllOpenPunchesWithJobInfo,
} from '@/domains/punch/utils';

// GET Handler for Fetching Punches
async function getPunchesHandler(
  request: AuthenticatedRequest,
  context?: Record<string, unknown>
) {
  try {
    const user = request.user;
    const params = (await context?.params) as { userId: string } | undefined;
    const userId = params?.userId;

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'missing-parameters',
          message: 'Missing required parameters',
        },
        { status: 400 }
      );
    }

    // Get search params from URL
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    // Connect to tenant-specific database
    const { db } = await getTenantAwareConnection(request);

    let punches;

    console.log(
      '🔍 Fetching punches for user:',
      user._id,
      'with type:',
      user.applicantId
    );

    if (type === 'allOpen') {
      punches = await findAllOpenPunchesWithJobInfo(
        db,
        user._id || '',
        user.applicantId || ''
      );
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'invalid-type',
          message: "Invalid or missing type parameter. Expected 'allOpen'",
        },
        { status: 400 }
      );
    }

    // Handle empty results
    if (
      !punches ||
      (Array.isArray(punches) && punches.length === 0) ||
      (typeof punches === 'object' && Object.keys(punches).length === 0)
    ) {
      return NextResponse.json(
        {
          success: true,
          message: 'No punches found',
          data: [],
        },
        { status: 200 }
      );
    }

    // Ensure we return an array
    const punchArray = Array.isArray(punches) ? punches : [punches];

    return NextResponse.json(
      {
        success: true,
        message: 'Punches retrieved successfully',
        data: punchArray,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ Error fetching punches:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'internal-error',
        message: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// DELETE Handler for Deleting Punch by ID
async function deletePunchHandler(
  request: AuthenticatedRequest,
  context?: Record<string, unknown>
) {
  try {
    const user = request.user;
    const params = (await context?.params) as { userId: string } | undefined;
    const userId = params?.userId;

    if (!user._id || !userId) {
      console.error('❌ Missing required parameters:', {
        userId: user._id,
        punchId: userId,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'missing-parameters',
          message: 'Missing required parameters',
        },
        { status: 400 }
      );
    }

    // Connect to tenant-specific database
    const { db } = await getTenantAwareConnection(request);

    const result = await deletePunchById(db, userId);

    return NextResponse.json(
      {
        success: true,
        message: 'Punch deleted successfully',
        data: result,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ Error deleting punch:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'internal-error',
        message: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// Export with enhanced auth wrapper
export const GET = withEnhancedAuthAPI(getPunchesHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});

export const DELETE = withEnhancedAuthAPI(deletePunchHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
