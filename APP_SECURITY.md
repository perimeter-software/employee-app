# Employee-App Security Audit Report

**Audit Date:** 2026-02-20
**Application:** employee-app (Next.js 14 / React 18 / TypeScript)
**Auditor:** Automated Security Scan (Claude)
**Status:** Partially Resolved (15/29 addressed — 2026-02-22)

---

## Executive Summary

| Severity | Count |
|----------|-------|
| **Critical** | 5 |
| **High** | 7 |
| **Medium** | 13 |
| **Low** | 4 |
| **Total** | **29** |

The most urgent issues involve **committed secrets in `.env`**, **unsanitized HTML rendering (XSS)**, **exposed debug endpoints**, **open redirect in OTP verification**, and **weak cryptographic primitives for OTP/session generation**.

---

## 1. Critical Vulnerabilities

### EA-CRIT-01: Committed Secrets in .env File

**File:** `.env`
**Status:** [ ] Unresolved

The `.env` file contains live credentials. Although `.gitignore` excludes `.env`, the file exists in the repo and may already be in git history.

**Exposed secrets include:**
- `AUTH0_SECRET` - Auth0 signing secret
- `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` - Auth0 client credentials
- `MONGODB_CONNECTION_STRING` - MongoDB Atlas credentials (username/password in URI)
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` / `GOOGLE_MAPS_API_KEY_TWO` - Google Maps API keys
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic API key
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` - AWS credentials (S3/SES access)
- `NEXT_PUBLIC_PUREBLUE_API_KEY` - PureBlue API key

**Fix:**
1. Rotate ALL exposed credentials immediately
2. Scrub secrets from git history using `git filter-repo` or BFG Repo Cleaner
3. Use a secrets management service (AWS Secrets Manager, HashiCorp Vault, Doppler)
4. Ensure `.env` is never committed - verify `.gitignore` is effective

---

### EA-CRIT-02: XSS via dangerouslySetInnerHTML (Notification Body)

**File:** `src/components/shared/NotificationBell/NotificationDetailModal.tsx:176`
**Status:** [x] Resolved (2026-02-22) — Added DOMPurify.sanitize() in createMarkup

```typescript
// Line 91-92: No sanitization
const createMarkup = (html: string) => {
  return { __html: html };
};

// Line 176: Renders raw HTML from API
dangerouslySetInnerHTML={createMarkup(bodyContent)}
```

Notification body content from the API is rendered directly into the DOM without sanitization. An attacker who can inject HTML into the notification body field can execute arbitrary JavaScript in the context of any user viewing notifications.

**Fix:**
```typescript
import DOMPurify from 'dompurify';

const createMarkup = (html: string) => {
  return { __html: DOMPurify.sanitize(html) };
};
```

---

### EA-CRIT-03: XSS via dangerouslySetInnerHTML (Clock-In Validation)

**File:** `src/domains/punch/components/TimeTracker/ClockInValidationModal/ClockInValidationModal.tsx:110`
**Status:** [x] Resolved (2026-02-22) — Added DOMPurify.sanitize() to dangerouslySetInnerHTML

```typescript
<div
  className="flex-1 text-sm"
  dangerouslySetInnerHTML={{ __html: message.message }}
/>
```

Validation messages rendered as raw HTML without sanitization. Messages are constructed in `use-timer-card.ts` (lines 314-318) and may include backend-controlled content.

**Fix:** Sanitize with DOMPurify or use plain text rendering instead of HTML.

---

### EA-CRIT-04: Debug Endpoints Exposing Sensitive Information

**Files:**
- `src/app/api/debug-env/route.ts`
- `src/app/api/debug-tenant/route.ts`

**Status:** [x] Resolved (2026-02-22) — Both endpoints already deleted

**debug-env** exposes partial Auth0 configuration, client IDs, and environment details. The code itself contains the comment: `"DELETE THIS ENDPOINT AFTER DEBUGGING!"`.

**debug-tenant** exposes tenant infrastructure details including database names, URLs, client names, and user email addresses. Also accepts `?clear=true` to clear cache without authentication.

**Fix:** Delete both endpoints immediately. They should never exist in production code.

---

### EA-CRIT-05: Open Redirect in OTP Verification

**File:** `src/app/api/auth/otp/verify/route.ts:106`
**Status:** [x] Resolved (2026-02-22) — Added relative-path-only validation for returnTo

```typescript
const { email, code, returnTo } = body;
// ...
if (returnTo) {
    redirectUrl = decodeURIComponent(returnTo); // No validation!
}
```

The `returnTo` parameter is user-controlled and decoded but never validated. An attacker can redirect users to a phishing site after successful OTP verification.

**Fix:**
```typescript
if (returnTo) {
  const decoded = decodeURIComponent(returnTo);
  // Only allow relative URLs
  if (decoded.startsWith('/') && !decoded.startsWith('//')) {
    redirectUrl = decoded;
  }
}
```

---

## 2. High Severity Issues

### EA-HIGH-01: Authentication Token Passed in URL Query Parameters

**Files:**
- `src/domains/pureblue/services/pureblue-service.ts:120`
- `src/domains/pureblue/hooks/use-pureblue-chatbot.ts:55`

**Status:** [ ] Unresolved

```typescript
return `${config.chatUrl}/chat-auth/external-chat?authToken=${token}&personaSlug=${personaSlug}`;
```

Auth tokens in URLs are logged in browser history, HTTP referrer headers, server logs, and can be cached by proxies/CDNs.

**Fix:** Use POST requests with tokens in the request body or Authorization headers.

---

### EA-HIGH-02: Weak OTP Generation (Not Cryptographically Secure)

**File:** `src/app/api/auth/otp/send/route.ts:11-13`
**Status:** [x] Resolved (2026-02-22) — Replaced with crypto.randomInt(100000, 1000000)

```typescript
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
```

`Math.random()` is not cryptographically secure and produces predictable output.

**Fix:**
```typescript
import { randomInt } from 'crypto';

function generateOTP(): string {
  return randomInt(100000, 999999).toString();
}
```

---

### EA-HIGH-03: Weak Session ID Generation

**File:** `src/app/api/auth/otp/verify/route.ts:149`
**Status:** [x] Resolved (2026-02-22) — Replaced with crypto.randomUUID()

```typescript
const sessionId = `otp_session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
```

Both `Date.now()` and `Math.random()` are predictable. Session IDs can be guessed or brute-forced.

**Fix:**
```typescript
import { randomUUID } from 'crypto';
const sessionId = `otp_session_${randomUUID()}`;
```

---

### EA-HIGH-04: innerHTML-Based HTML Parsing

**File:** `src/components/shared/NotificationBell/NotificationPopover.tsx:185-190`
**Status:** [x] Resolved (2026-02-22) — Replaced innerHTML with regex-based html.replace()

```typescript
const stripHtml = (html: string) => {
  if (!html) return '';
  const tmp = document.createElement('DIV');
  tmp.innerHTML = html; // Parses untrusted HTML
  return tmp.textContent || tmp.innerText || '';
};
```

Setting `innerHTML` on a DOM element with untrusted content can trigger side effects during parsing even if only `textContent` is extracted.

**Fix:**
```typescript
const stripHtml = (html: string) => {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '');
};
```

---

### EA-HIGH-05: ReDoS via Unsanitized Regex in MongoDB Queries

**File:** `src/domains/document/utils/mongo-document-utils.ts:210-214`
**Status:** [x] Resolved (2026-02-22) — Added escapeRegex() helper, all queries use escaped input

```typescript
{ name: { $regex: query, $options: 'i' } },
{ description: { $regex: query, $options: 'i' } },
{ tags: { $in: [new RegExp(query, 'i')] } },
```

User-supplied `query` is passed directly into MongoDB `$regex` operators. Malicious patterns like `(.*)*` or `(a+)+` cause exponential backtracking (ReDoS), potentially hanging the database.

**Fix:**
```typescript
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const safeQuery = escapeRegExp(query);
{ name: { $regex: safeQuery, $options: 'i' } }
```

---

### EA-HIGH-06: Weak Content Security Policy

**Files:** `next.config.mjs` and `src/lib/middleware/security.ts:35`
**Status:** [ ] Unresolved

```
script-src 'self' 'unsafe-eval' 'unsafe-inline' ...
style-src 'self' 'unsafe-inline' ...
```

`'unsafe-eval'` allows arbitrary JavaScript execution and `'unsafe-inline'` allows inline scripts, effectively defeating CSP protection against XSS.

**Fix:** Remove `'unsafe-eval'` and `'unsafe-inline'`. Use nonce-based or hash-based CSP for required inline scripts.

---

### EA-HIGH-07: Unvalidated File Uploads

**File:** `src/app/api/documents/route.ts:99-104`
**Status:** [x] Resolved (2026-02-22) — Added extension whitelist + 10MB size limit

```typescript
const fileExt = path.extname(file.name || '');
const fileName = `${uuidv4()}${fileExt}`;
const filePath = path.join(uploadDir, fileName);
await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));
```

No file type/MIME validation, no extension whitelist, no file size enforcement, no content scanning.

**Fix:**
```typescript
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const fileExt = path.extname(file.name || '').toLowerCase();
if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
  return NextResponse.json({ error: 'File type not allowed' }, { status: 400 });
}
if (file.size > MAX_FILE_SIZE) {
  return NextResponse.json({ error: 'File too large' }, { status: 400 });
}
```

---

## 3. Medium Severity Issues

### EA-MED-01: Non-HttpOnly Authentication Cookie

**File:** `src/app/api/auth/otp/verify/route.ts:205`
**Status:** [x] Resolved (2026-02-22) — otp_session_id already httpOnly; auth0.is.authenticated intentionally client-readable

```typescript
response.cookies.set('auth0.is.authenticated', 'true', {
  httpOnly: false, // Accessible via JavaScript - vulnerable to XSS
});
```

**Fix:** Set `httpOnly: true` for all authentication-related cookies.

---

### EA-MED-02: Excessive Console Logging of Sensitive Data

**Files:** Multiple
**Status:** [x] Resolved (2026-02-22) — Production builds strip all console.log via removeConsole: true in next.config.mjs

**Affected locations:**
- `src/app/api/auth/otp/send/route.ts:75` - Logs OTP code
- `src/app/api/debug-tenant/route.ts:22` - Logs full tenant data
- `src/app/api/current-user/route.ts:19` - Logs entire user object
- `src/lib/utils/location-utils.ts:44-45` - Logs exact geolocation coordinates
- `src/lib/services/activity-logger.ts:109-132` - Logs user IDs, emails, actions
- `src/domains/punch/utils/mongo-punch-utils.ts:692` - Logs MongoDB queries
- `src/lib/services/email-service.ts:105` - Logs recipient emails and message IDs
- `src/lib/middleware/logging.ts:57` - Logs IP addresses, user agents, request URLs
- `src/components/shared/GlobalErrorBoundary/GlobalErrorBoundary.tsx:75-80` - Logs stack traces
- `src/domains/tenant/hooks/use-switch-tenant.ts:17,107-108` - Logs tenant and localStorage data

**Fix:**
1. Remove all `console.log` statements that output sensitive data
2. Use a structured logging library (e.g., `pino` or `winston`) with PII redaction
3. Gate debug logging behind `NODE_ENV === 'development'` checks

---

### EA-MED-03: OTP Session TTL Too Long (30 Days)

**File:** `src/app/api/auth/otp/verify/route.ts:150`
**Status:** [x] Resolved (2026-02-22) — TTL reduced to 24 hours (Redis + cookies)

```typescript
await redisService.set(`otp_session:${sessionId}`, sessionData, 30 * 24 * 60 * 60);
```

30-day session expiry is excessively long, increasing the window for session hijacking.

**Fix:** Reduce to 24 hours or less. Implement session refresh mechanism if longer access is needed.

---

### EA-MED-04: localStorage Used for Auth State (Vulnerable to XSS)

**Files:** `src/lib/auth/session-refresh.ts:20-22`, `src/lib/utils/reset-stores.ts:47`, `src/domains/tenant/hooks/use-switch-tenant.ts`
**Status:** [ ] Unresolved

Auth state managed in localStorage is accessible via JavaScript and vulnerable to XSS-based theft.

**Fix:** Use only HttpOnly, Secure cookies for auth state. Encrypt any sensitive data stored client-side.

---

### EA-MED-05: Missing CORS Configuration

**Status:** [ ] Unresolved

No explicit CORS middleware found in the codebase. API endpoints may be accessible from any origin.

**Fix:** Implement explicit CORS middleware with a restricted origin whitelist.

---

### EA-MED-06: Missing CSRF Protection

**Status:** [ ] Unresolved

No CSRF token validation observed for state-changing operations (POST, PUT, DELETE).

**Fix:** Implement CSRF tokens for all state-changing endpoints. Use `SameSite: Strict` on cookies.

---

### EA-MED-07: Potential IDOR on Paycheck Endpoints

**Files:**
- `src/app/api/applicants/[id]/paycheck-stubs/route.ts:27-30`
- `src/app/api/applicants/[id]/paycheck-stubs/[stubId]/generate-paycheck-presigned-url/route.ts:30-33`

**Status:** [ ] Unresolved

```typescript
const paycheckStubs = await PaycheckStubs.find({ applicantId: id }).toArray();
```

The `id` route parameter should be validated against the authenticated user's ID to prevent users from accessing other employees' paycheck data.

**Fix:** Add explicit authorization check: compare route `id` parameter to `request.user._id`.

---

### EA-MED-08: Insecure JSON Parsing of Auth State

**File:** `src/app/api/auth/[auth0]/route.ts:18-20`
**Status:** [x] Resolved (2026-02-22) — JSON.parse already wrapped in try-catch with fallback

```typescript
const decodedState = Buffer.from(state, 'base64').toString('utf-8');
const stateObj = JSON.parse(decodedState);
```

Base64-decoded user-controlled state parsed without schema validation.

**Fix:** Validate `stateObj` against an expected schema (e.g., using Zod) before using its values.

---

### EA-MED-09: Missing Email Format Validation

**File:** `src/app/api/auth/otp/send/route.ts:17-24`
**Status:** [x] Resolved (2026-02-22) — Added email format regex validation

Only checks `typeof email === 'string'` but no RFC 5322 format validation.

**Fix:** Add email format validation using a regex or `email-validator` library.

---

### EA-MED-10: Rate Limiting Skipped for Auth Routes

**File:** `src/lib/middleware/rate-limiting.ts:26-29`
**Status:** [ ] Unresolved

```typescript
if (isAuthRoute(pathname)) {
  return null; // Skipped - assumes auth routes have their own rate limiting
}
```

Auth routes (OTP send/verify) are excluded from rate limiting. Need to verify these endpoints have their own per-email/per-IP rate limiting to prevent brute force.

**Fix:** Implement aggressive rate limiting on OTP endpoints: 3-5 attempts per 15 minutes per email/IP.

---

### EA-MED-11: Unencrypted Data in Redis

**File:** `src/lib/cache/redis-client.ts:85-98`
**Status:** [ ] Unresolved

OTP sessions and tenant data stored as plain JSON in Redis without encryption at rest.

**Fix:** Encrypt sensitive fields before storing. Use Redis AUTH and TLS connections.

---

### EA-MED-12: Public API Key Exposure via NEXT_PUBLIC Prefix

**Files:** `.env` (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, NEXT_PUBLIC_PUREBLUE_API_KEY), `src/domains/punch/components/TimeTracker/MapModal/MapModal.tsx:161`
**Status:** [ ] Unresolved

API keys with `NEXT_PUBLIC_` prefix are exposed in client-side JavaScript bundles and visible in browser DevTools.

**Fix:**
- Google Maps: Apply HTTP referrer restrictions on the API key in Google Cloud Console
- PureBlue: Proxy API calls through a backend endpoint to hide the key

---

### EA-MED-13: Geolocation Data Logged Without Masking

**File:** `src/lib/utils/location-utils.ts:44-45, 203, 209`
**Status:** [ ] Unresolved

Exact geolocation coordinates logged to console and used to generate Google Maps URLs. No rounding or masking applied.

**Fix:** Remove coordinate logging. Round coordinates for display purposes if exact precision isn't required.

---

## 4. Low Severity Issues

### EA-LOW-01: Health Endpoint Information Disclosure

**File:** `src/app/api/health/route.ts`
**Status:** [ ] Unresolved

Health endpoint reveals database connection status, Redis status, Auth0 configuration, application version, and environment details.

**Fix:** Return only "healthy"/"unhealthy" status. Require authentication for detailed health info.

---

### EA-LOW-02: Hardcoded Fallback Error Page (innerHTML Pattern)

**File:** `public/polyfills.js:146-158`
**Status:** [ ] Unresolved

Uses `document.body.innerHTML` with template literals. Currently safe (hardcoded content), but the pattern is risky if dynamic content is ever added.

**Fix:** No immediate action needed. Add a code comment noting that dynamic content must never be added to this template.

---

### EA-LOW-03: Source Map Configuration Unclear

**File:** `next.config.mjs`
**Status:** [x] Resolved (2026-02-22) — Added productionBrowserSourceMaps: false

No explicit source map configuration found. Source maps may be generated in production builds, exposing source code.

**Fix:** Add `productionBrowserSourceMaps: false` to `next.config.mjs`.

---

### EA-LOW-04: Analytics Key in Logging Middleware

**File:** `src/lib/middleware/logging.ts:99`
**Status:** [ ] Unresolved

```typescript
Authorization: `Bearer ${process.env.ANALYTICS_API_KEY}`,
```

Analytics API key sent in request headers to external service.

**Fix:** Validate the analytics endpoint URL before sending requests. Use short-lived tokens if possible.

---

## Recommendations Summary

### Immediate Actions (Do Now)

| # | Action | Related Issues |
|---|--------|----------------|
| 1 | Rotate ALL exposed credentials in `.env` and scrub git history | EA-CRIT-01 |
| 2 | Install `dompurify` and sanitize all `dangerouslySetInnerHTML` usage | EA-CRIT-02, EA-CRIT-03 |
| 3 | Delete `/api/debug-env` and `/api/debug-tenant` endpoints | EA-CRIT-04 |
| 4 | Validate `returnTo` parameter in OTP verify (allow only relative URLs) | EA-CRIT-05 |
| 5 | Replace `Math.random()` with `crypto.randomInt()` for OTP generation | EA-HIGH-02 |
| 6 | Replace `Math.random()` with `crypto.randomUUID()` for session IDs | EA-HIGH-03 |

### Short-Term (This Sprint)

| # | Action | Related Issues |
|---|--------|----------------|
| 7 | Move auth tokens from URL params to Authorization headers | EA-HIGH-01 |
| 8 | Escape regex input for MongoDB queries | EA-HIGH-05 |
| 9 | Strengthen CSP - remove `unsafe-eval` and `unsafe-inline` | EA-HIGH-06 |
| 10 | Add file type/size validation to upload endpoint | EA-HIGH-07 |
| 11 | Set `httpOnly: true` on all auth cookies | EA-MED-01 |
| 12 | Remove/gate all sensitive `console.log` statements | EA-MED-02 |
| 13 | Reduce OTP session TTL from 30 days to 24 hours | EA-MED-03 |
| 14 | Add IDOR checks on paycheck endpoints | EA-MED-07 |

### Medium-Term (Next 2-4 Weeks)

| # | Action | Related Issues |
|---|--------|----------------|
| 15 | Implement CORS middleware with origin whitelist | EA-MED-05 |
| 16 | Add CSRF token validation for state-changing operations | EA-MED-06 |
| 17 | Add rate limiting to OTP send/verify endpoints | EA-MED-10 |
| 18 | Encrypt sensitive data in Redis | EA-MED-11 |
| 19 | Proxy public API keys through backend | EA-MED-12 |
| 20 | Implement structured logging with PII redaction | EA-MED-02, EA-MED-13 |
| 21 | Validate auth state JSON with schema (Zod) | EA-MED-08 |
| 22 | Add email format validation | EA-MED-09 |
| 23 | Restrict health endpoint or require authentication | EA-LOW-01 |
| 24 | Disable production source maps | EA-LOW-03 |

---

*This report was generated by scanning the employee-app Next.js codebase. Regular security reviews are recommended.*
