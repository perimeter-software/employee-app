// app/api/auth/otp/send/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { mongoConn } from '@/lib/db/mongodb';
import {
  checkUserExistsByEmail,
  findUserAndTenantsByEmail,
} from '@/domains/user/utils/mongo-user-utils';
import redisService from '@/lib/cache/redis-client';
import emailService from '@/lib/services/email-service';
import crypto from 'crypto';
import { env } from '@/lib/config';

export const dynamic = 'force-dynamic';

// Generate a 6-digit OTP code
function generateOTP(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Employees are resolved through usermaster, so someone whose user record
    // lives in a non-default tenant is still recognized as an employee.
    const resolvedUser = await findUserAndTenantsByEmail(normalizedEmail);

    // The OTP email is templated per tenant; send it from the employee's own
    // tenant rather than whatever DEFAULT_TENANT_DB_NAME points at.
    const { db } = await mongoConn(resolvedUser?.tenant.dbName);

    // Legacy fallback: usermaster can't always resolve a membership to a tenant
    // (stale url, missing tenant doc). Check the default database exactly as
    // this route used to, so nobody who could sign in before now can't.
    const user =
      resolvedUser?.user ??
      (await checkUserExistsByEmail(db, normalizedEmail));

    // If user not found, check if applicant exists
    let isApplicant = false;
    if (!user) {
      const { findApplicantAndTenantsByEmail } = await import(
        '@/domains/user/utils/mongo-user-utils'
      );
      const applicantData =
        await findApplicantAndTenantsByEmail(normalizedEmail);
      isApplicant = !!applicantData;
    }

    // If neither user nor applicant found, return error before sending code
    if (!user && !isApplicant) {
      return NextResponse.json(
        {
          error:
            'Employee or applicant not found. Please contact your supervisor',
          employeeNotFound: true,
        },
        { status: 404 }
      );
    }

    // Generate OTP code
    const otpCode = generateOTP();

    // Store OTP in Redis with 10 minute expiry
    const otpKey = `otp:${normalizedEmail}`;
    await redisService.set(
      otpKey,
      {
        code: otpCode,
        email: normalizedEmail,
        createdAt: new Date().toISOString(),
        attempts: 0,
        isApplicantOnly: isApplicant, // Flag to indicate applicant-only login
      },
      600
    ); // 10 minutes

    // Send OTP via email
    try {
      await emailService.sendOTPCode(normalizedEmail, otpCode, db);
      if (env.isDevelopment) {
        console.log(`🔐 [dev] Login OTP for ${normalizedEmail}: ${otpCode}`);
      }
    } catch (emailError) {
      const errorMessage =
        emailError instanceof Error ? emailError.message : String(emailError);
      console.error('Failed to send OTP email:', emailError);

      // Always log the OTP code in development for testing
      if (env.isDevelopment) {
        console.log(`🔐 OTP Code for ${normalizedEmail}: ${otpCode}`);
        console.log(
          '💡 This code is logged because email sending failed. In production, ensure SES email is verified.'
        );
      }

      // Email verification issues are handled gracefully: the OTP is stored and
      // usable, and we still return success to prevent user enumeration.
      // A genuine send failure (queue/Redis down, timeout, credentials) is a
      // real outage — surface it in every environment so the UI doesn't
      // falsely tell the user a code was sent.
      const isVerificationIssue =
        errorMessage.includes('not verified') ||
        errorMessage.includes('MessageRejected');

      if (!isVerificationIssue) {
        return NextResponse.json(
          { error: 'Failed to send email. Please try again later.' },
          { status: 500 }
        );
      }
      // For verification errors, fall through to the success response below.
    }

    return NextResponse.json({
      message: 'If an account exists with this email, a code has been sent.',
    });
  } catch (error) {
    console.error('Error sending OTP:', error);
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
