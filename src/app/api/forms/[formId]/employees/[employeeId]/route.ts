import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { ObjectId } from 'mongodb';
import { mapEmployeeToFormFields, getAllFieldsFromSections } from '@/domains/forms/utils/formMapper';

// GET Handler for Getting Form with Employee Data Pre-filled
async function getFormWithEmployeeDataHandler(
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

    const { db } = await getTenantAwareConnection(request);

    // Get the form
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

    // Get the employee from applicants collection
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

    // Verify client has access to this employee (via clientOrgs/venue slugs)
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

    // Extract all fields from form sections
    const fields = getAllFieldsFromSections(form.formData?.form?.sections || []);

    // Map employee data to form fields
    const preFilledValues = mapEmployeeToFormFields(employee, fields);

    // Check if there's an existing draft or submitted response
    const shortName = form.shortName;
    const existingResponse = (employee as any).dynamicForms?.[shortName];

    // Merge pre-filled values with existing response (existing takes precedence)
    let formValues = { ...preFilledValues };
    if (existingResponse) {
      const { _metadata, ...existingFieldValues } = existingResponse;
      formValues = { ...preFilledValues, ...existingFieldValues };
    }

    // Convert ObjectId to string for JSON serialization
    const formData = {
      ...form,
      _id: form._id.toString(),
    };

    return NextResponse.json(
      {
        success: true,
        message: 'Form with employee data retrieved successfully',
        data: {
          form: formData,
          preFilledValues: formValues,
          existingResponse: existingResponse || null,
          employee: {
            _id: employee._id.toString(),
            firstName: (employee as any).firstName,
            lastName: (employee as any).lastName,
            email: (employee as any).email,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching form with employee data:', error);
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

export const GET = withEnhancedAuthAPI(getFormWithEmployeeDataHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
