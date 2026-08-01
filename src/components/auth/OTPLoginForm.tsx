// Public entry point for the OTP login form.
//
// We use the same Redis-backed OTP form for BOTH IS_V4 modes:
//   - IS_V4=false: complements Auth0 "Account Login"
//   - IS_V4=true:  complements Clerk "Account Login"
//
// The OTP backend (/api/auth/otp/send, /api/auth/otp/verify, otp_session_id
// cookie + Redis) is provider-agnostic, so it doesn't depend on whether
// the user has been provisioned in Clerk yet — they only need a record
// in MongoDB.
//
// OTPLoginForm.clerk.tsx is kept in-tree for reference (Clerk's own
// email_code first-factor flow) but is no longer wired into the app.
'use client';

export { OTPLoginFormAuth0 as OTPLoginForm } from './OTPLoginForm.auth0';
