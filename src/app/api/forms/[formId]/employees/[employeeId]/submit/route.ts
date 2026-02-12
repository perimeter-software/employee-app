import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { ObjectId } from 'mongodb';
import { validateForm } from '@/domains/forms/utils/formValidator';
import { getAllFieldsFromSections } from '@/domains/forms/utils/formMapper';

// POST Handler for Submitting Form
async function submitFormHandler(
  request: AuthenticatedRequest,
  { params }: { params: { formId: string; employeeId: string } }
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

    const { formId, employeeId } = params;

    if (!ObjectId.isValid(formId) || !ObjectId.isValid(employeeId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'bad-request',
          message: 'Invalid form ID or employee ID format.',
        },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { formValues } = body;

    if (!formValues || typeof formValues !== 'object') {
      return NextResponse.json(
        {
          success: false,
          error: 'bad-request',
          message: 'Form values are required.',
        },
        { status: 400 }
      );
    }

    const { db } = await getTenantAwareConnection(request);

    // Get the form to validate and get shortName
    const form = await db.collection('dynamicForms').findOne({
      _id: new ObjectId(formId),
      'metadata.status': 'Active',
    });

    if (!form) {
      return NextResponse.json(
        {
          success: false,
          error: 'not-found',
          message: 'Form not found.',
        },
        { status: 404 }
      );
    }

    // Extract all fields from form sections for validation
    const fields = getAllFieldsFromSections(form.formData?.form?.sections || []);

    // Validate form (isSubmit = true enforces required fields)
    const validationResult = validateForm(formValues, fields, true);

    if (!validationResult.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: 'validation-error',
          message: 'Form validation failed.',
          errors: validationResult.errors,
        },
        { status: 422 }
      );
    }

    // Verify employee exists and client has access
    const employeeObjectId = new ObjectId(employeeId);
    const employee = await db.collection('applicants').findOne({
      _id: employeeObjectId,
    });

    if (!employee) {
      return NextResponse.json(
        {
          success: false,
          error: 'not-found',
          message: 'Employee not found.',
        },
        { status: 404 }
      );
    }

    // Verify client has access to this employee
    const userObjectId = new ObjectId(user._id.toString());
    const clientUser = await db.collection('users').findOne({ _id: userObjectId });
    
    if (!clientUser) {
      return NextResponse.json(
        {
          success: false,
          error: 'not-found',
          message: 'User not found.',
        },
        { status: 404 }
      );
    }

    const clientOrgs = (clientUser as any)?.clientOrgs || [];
    const clientOrgSlugs = clientOrgs
      .map((org: any) => org.slug)
      .filter((slug: any) => typeof slug === 'string' && slug.trim() !== '');

    const employeeVenueSlugs = (employee as any)?.venues?.map((v: any) => v.venueSlug) || [];
    const hasAccess = employeeVenueSlugs.some((slug: string) => clientOrgSlugs.includes(slug));

    if (!hasAccess) {
      return NextResponse.json(
        {
          success: false,
          error: 'forbidden',
          message: 'You do not have access to this employee.',
        },
        { status: 403 }
      );
    }

    const shortName = form.shortName;

    // Prepare form response data
    const now = new Date();
    const formResponse = {
      ...formValues,
      _metadata: {
        status: 'submitted',
        lastSavedAt: now,
        submittedAt: now,
        completedBy: `${user.firstName} ${user.lastName}`,
        completedById: user._id.toString(),
      },
    };

    // Update employee's dynamicForms field
    const updateResult = await db.collection('applicants').updateOne(
      { _id: employeeObjectId },
      {
        $set: {
          [`dynamicForms.${shortName}`]: formResponse,
        },
      }
    );

    if (updateResult.matchedCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'not-found',
          message: 'Employee not found for update.',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Form submitted successfully',
        data: {
          shortName,
          metadata: formResponse._metadata,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error submitting form:', error);
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

export const POST = withEnhancedAuthAPI(submitFormHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
