import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { ObjectId } from 'mongodb';

// GET Handler for Getting a Single Form by ID
async function getFormHandler(
  request: AuthenticatedRequest,
  { params }: { params: { formId: string } }
) {
  try {
    const user = request.user;

    // Only Client users can access forms
    if (user.userType !== 'Client') {
      return NextResponse.json(
        {
          success: false,
          error: 'unauthorized',
          message: 'Access denied. Client role required.',
        },
        { status: 403 }
      );
    }

    const { formId } = params;

    if (!ObjectId.isValid(formId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'bad-request',
          message: 'Invalid form ID format.',
        },
        { status: 400 }
      );
    }

    const { db } = await getTenantAwareConnection(request);

    // Get the form (all active forms, no visibility filter)
    const form = await db.collection('dynamicForms').findOne({
      _id: new ObjectId(formId),
      'metadata.status': 'Active',
    });

    if (!form) {
      return NextResponse.json(
        {
          success: false,
          error: 'not-found',
          message: 'Form not found or not accessible.',
        },
        { status: 404 }
      );
    }

    // Convert ObjectId to string for JSON serialization
    const formData = {
      ...form,
      _id: form._id.toString(),
    };

    return NextResponse.json(
      {
        success: true,
        message: 'Form retrieved successfully',
        data: formData,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching form:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'internal-error',
        message: 'Internal server error.',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

export const GET = withEnhancedAuthAPI(getFormHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
