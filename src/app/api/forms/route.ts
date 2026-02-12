import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';

// GET Handler for Getting List of Active Forms for Client Users
async function getFormsListHandler(request: AuthenticatedRequest) {
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

    const { db } = await getTenantAwareConnection(request);

    // Get all active forms for the current tenant (no visibility filter)
    const forms = await db
      .collection('dynamicForms')
      .find({
        'metadata.status': 'Active',
      })
      .project({
        _id: 1,
        name: 1,
        shortName: 1,
        'formData.form.title': 1,
        'formData.form.subtitle': 1,
        metadata: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .sort({ name: 1 })
      .toArray();

    // Transform to match API response type
    const formsListItems = forms.map((form) => ({
      _id: form._id.toString(),
      name: form.name,
      shortName: form.shortName,
      title: form.formData?.form?.title || form.name,
      subtitle: form.formData?.form?.subtitle,
      metadata: form.metadata,
      createdAt: form.createdAt,
      updatedAt: form.updatedAt,
    }));

    return NextResponse.json(
      {
        success: true,
        message: 'Forms list retrieved successfully',
        count: formsListItems.length,
        data: formsListItems,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching forms list:', error);
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

export const GET = withEnhancedAuthAPI(getFormsListHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
