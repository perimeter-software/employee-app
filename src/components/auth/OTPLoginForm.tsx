// Public entry point for the OTP login form. Picks the Auth0-backed or
// Clerk-backed implementation at module load based on IS_V4, so the rest of
// the codebase can keep importing { OTPLoginForm } without caring which
// provider is active. When Auth0 is removed, delete OTPLoginForm.auth0.tsx
// and this shim can be collapsed.
'use client';

import { IS_V4 } from '@/lib/config/auth-mode';
import { OTPLoginFormAuth0 } from './OTPLoginForm.auth0';
import { OTPLoginFormClerk } from './OTPLoginForm.clerk';

export const OTPLoginForm = IS_V4 ? OTPLoginFormClerk : OTPLoginFormAuth0;
