# Changelog

## [Security Patch] - 2026-02-22

### Fixed Issues

| ID | Severity | What Was Fixed | File(s) |
|---|---|---|---|
| EA-CRIT-02 | Critical | Added DOMPurify sanitization to `dangerouslySetInnerHTML` to prevent XSS | `NotificationDetailModal.tsx` |
| EA-CRIT-03 | Critical | Added DOMPurify sanitization to `dangerouslySetInnerHTML` to prevent XSS | `ClockInValidationModal.tsx` |
| EA-CRIT-04 | Critical | Debug endpoints (`/api/debug-env`, `/api/debug-tenant`) confirmed deleted | N/A (already removed) |
| EA-CRIT-05 | Critical | Validated `returnTo` parameter to prevent open redirect — only relative paths allowed | `otp/verify/route.ts` |
| EA-HIGH-02 | High | Replaced `Math.random()` with `crypto.randomInt()` for cryptographically secure OTP generation | `otp/send/route.ts` |
| EA-HIGH-03 | High | Replaced weak session ID (`Date.now()` + `Math.random()`) with `crypto.randomUUID()` | `otp/verify/route.ts` |
| EA-HIGH-04 | High | Replaced `innerHTML`-based HTML stripping with regex-based approach | `NotificationPopover.tsx` |
| EA-HIGH-05 | High | Added regex escaping for user input in MongoDB `$regex` queries to prevent ReDoS | `mongo-document-utils.ts` |
| EA-HIGH-07 | High | Added file upload validation (extension whitelist + 10MB size limit) | `documents/route.ts` |
| EA-MED-01 | Medium | OTP session cookie already has `httpOnly: true` — confirmed no change needed | N/A |
| EA-MED-02 | Medium | Console logs already stripped in production via `removeConsole: true` — confirmed no change needed | `next.config.mjs` |
| EA-MED-03 | Medium | Reduced OTP session TTL from 30 days to 24 hours (Redis session + cookies) | `otp/verify/route.ts` |
| EA-MED-08 | Medium | JSON parsing in Auth0 callback route already wrapped in try-catch — confirmed no change needed | N/A |
| EA-MED-09 | Medium | Added email format validation in OTP send route | `otp/send/route.ts` |
| EA-LOW-03 | Low | Disabled production browser source maps (`productionBrowserSourceMaps: false`) | `next.config.mjs` |

### Not Fixed (Requires Backend/Infrastructure Changes)

| ID | Severity | Issue | Reason Not Fixed |
|---|---|---|---|
| EA-CRIT-01 | Critical | Committed secrets in git history | Requires credential rotation + git history scrub |
| EA-HIGH-01 | High | Auth token passed in URL params | Requires API architecture changes |
| EA-HIGH-06 | High | Weak Content Security Policy (CSP) | Requires careful testing before tightening |
| EA-MED-04 | Medium | localStorage used for auth state | Requires architecture change |
| EA-MED-05 | Medium | Missing CORS configuration | Requires infrastructure change |
| EA-MED-06 | Medium | Missing CSRF protection | Requires architecture change |
| EA-MED-07 | Medium | IDOR on paycheck endpoints | Requires authorization review |
| EA-MED-10 | Medium | No rate limiting | Requires infrastructure setup |
| EA-MED-11 | Medium | Unencrypted Redis connection | Requires infrastructure change |
| EA-MED-12 | Medium | Public API key exposure | Requires backend proxy |
| EA-MED-13 | Medium | Geolocation logging | Covered by MED-02 (removeConsole in production) |
| EA-LOW-01 | Low | Health endpoint info disclosure | Requires review |
| EA-LOW-02 | Low | Hardcoded fallback URLs | Low risk, no action needed |
| EA-LOW-04 | Low | Analytics key in client code | Requires review |

### Build Verification
- TypeScript compilation: **passed** (no errors)
- Next.js production build: **passed** (all routes compiled successfully)

### Dependencies
- Added `dompurify` (`^3.3.1`) and `@types/dompurify` (`^3.0.5`) for HTML sanitization
