import { NextResponse } from 'next/server';
import { AuthenticatedRequest, withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { generateS3PresignedUrl } from '@/lib/utils/s3-presigned-url';

async function getPaycheckStubPresignedUrlHandler(
  request: AuthenticatedRequest,
  context: { params: Promise<{ id: string; stubId: string }> }
) {
  try {
    const { id, stubId } = await context.params;
    const { db } = await getTenantAwareConnection(request);

    if (!id || !stubId) {
      return NextResponse.json(
        {
          success: false,
          error: 'bad-request',
          message: 'Missing applicant id or stub id',
        },
        { status: 400 }
      );
    }

    // Find the paycheck stub
    const PaycheckStubs = db.collection('paycheck-stubs');
    const paycheckStub = await PaycheckStubs.findOne({
      _id: new ObjectId(stubId),
      applicantId: id,
    });

    if (!paycheckStub) {
      return NextResponse.json(
        {
          success: false,
          error: 'not-found',
          message: 'Paycheck stub not found',
        },
        { status: 404 }
      );
    }

    // Validate that the stub belongs to the applicant
    if (paycheckStub.applicantId !== id) {
      return NextResponse.json(
        {
          success: false,
          error: 'forbidden',
          message: 'Access denied to this paycheck stub',
        },
        { status: 403 }
      );
    }

    // Extract bucket and key from metadata
    const bucket = paycheckStub.metadata?.destinationBucket;
    const key = paycheckStub.metadata?.destinationKey;

    if (!bucket || !key) {
      return NextResponse.json(
        {
          success: false,
          error: 'bad-request',
          message: 'Paycheck stub metadata missing bucket or key information',
        },
        { status: 400 }
      );
    }

    // Generate pre-signed URL (30 minutes expiration)
    const presignedUrl = await generateS3PresignedUrl(bucket, key, 1800);

    return NextResponse.json({
      success: true,
      presignedUrl,
      expiresIn: 1800, // 30 minutes in seconds
    });
  } catch (error) {
    console.error('Error generating paycheck stub pre-signed URL:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'internal-error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to generate pre-signed URL',
      },
      { status: 500 }
    );
  }
}

// Export with enhanced auth wrapper
export const GET = withEnhancedAuthAPI(getPaycheckStubPresignedUrlHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});

