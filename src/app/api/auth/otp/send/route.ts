// app/api/auth/otp/send/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { mongoConn } from '@/lib/db/mongodb';
import { checkUserExistsByEmail } from '@/domains/user/utils/mongo-user-utils';
import redisService from '@/lib/cache/redis-client';
import emailService from '@/lib/services/email-service';

export const dynamic = 'force-dynamic';

// Generate a 6-digit OTP code
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists in database
    const { db } = await mongoConn();
    const user = await checkUserExistsByEmail(db, normalizedEmail);

    if (!user) {
      // Don't reveal if user exists for security
      // Still send a response to prevent email enumeration
      return NextResponse.json({
        message: 'If an account exists with this email, a code has been sent.',
      });
    }

    // Generate OTP code
    const otpCode = generateOTP();

    // Store OTP in Redis with 10 minute expiry
    const otpKey = `otp:${normalizedEmail}`;
    await redisService.set(otpKey, {
      code: otpCode,
      email: normalizedEmail,
      createdAt: new Date().toISOString(),
      attempts: 0,
    }, 600); // 10 minutes

    // Send OTP via email
    try {
      await emailService.sendOTPCode(normalizedEmail, otpCode);
    } catch (emailError) {
      const errorMessage = emailError instanceof Error ? emailError.message : String(emailError);
      console.error('Failed to send OTP email:', emailError);
      
      // Always log the OTP code in development for testing
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔐 OTP Code for ${normalizedEmail}: ${otpCode}`);
        console.log('💡 This code is logged because email sending failed. In production, ensure SES email is verified.');
      }
      
      // In production, only fail if it's not an email verification issue
      // (Email verification issues are handled gracefully by the email service)
      if (process.env.NODE_ENV === 'production') {
        // If it's an email verification error, the email service already logged it
        // We'll still return success to prevent user enumeration
        if (!errorMessage.includes('not verified') && !errorMessage.includes('MessageRejected')) {
          return NextResponse.json(
            { error: 'Failed to send email. Please try again later.' },
            { status: 500 }
          );
        }
        // For verification errors, we still return success (security best practice)
        // The OTP is stored and can be used, but email wasn't sent
      }
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

