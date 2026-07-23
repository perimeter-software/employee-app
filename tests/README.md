# E2E Tests (Playwright)

Black-box smoke tests that run against a **deployed** Employee Portal
(production by default). They check that the app is up, auth gating works, the
health API is responsive, and a signed-in user can reach their core pages.

## Files

| File | What it covers | Auth |
| --- | --- | --- |
| `page-loads.spec.ts` | Homepage + 404 (public); dashboard/profile/home load (signed in) | mixed |
| `auth.spec.ts` | Sign-in form renders, protected-route redirect, valid/invalid login, logout | self-login |
| `api.spec.ts` | `/api/health` shape & timing, 401 on protected API, 404 on unknown | none |
| `forms.spec.ts` | Sign-in form client validation | none |
| `auth.setup.ts` | Logs in once, saves session to `playwright/.auth/user.json` | — |

## Configuration

Set these as environment variables (locally) or **GitHub repository secrets**
(CI — Settings → Secrets and variables → Actions):

| Variable | Required | Notes |
| --- | --- | --- |
| `BASE_URL` | ✅ | Full origin under test, e.g. `https://portal.example.com`. No default — the run fails fast if unset. |
| `TEST_USER_EMAIL` | for authed tests | Dedicated E2E account (see below). |
| `TEST_USER_PASSWORD` | for authed tests | That account's Clerk password. |
| `SLACK_WEBHOOK_URL` | for alerts | Incoming webhook; used by `scripts/slack-notify.js`. |

### The test account must have a Clerk password

Login is driven through the real custom sign-in form, which only takes the
**password** path when the Clerk account has a password set. If the account has
no password, the form falls back to an emailed one-time code, which can't be
automated here — `auth.setup.ts` will time out.

So: create a dedicated test user and **set a password** for it in the Clerk
dashboard (don't use a real employee's credentials).

If `TEST_USER_EMAIL`/`TEST_USER_PASSWORD` are absent, the authenticated tests
skip themselves and only the public smoke tests run.

### Production + Clerk bot protection

Because the suite targets production, Clerk's bot/abuse protection may challenge
programmatic logins. If `auth.setup.ts` fails to obtain a session, either
allowlist the CI egress in Clerk or switch to Clerk testing tokens
(`@clerk/testing`) for a future iteration.

## Running

This project uses **yarn**. `BASE_URL` can be set inline (below) or dropped in
a local `.env` — `playwright.config.ts` loads it via dotenv.

```bash
yarn install --frozen-lockfile
npx playwright install --with-deps chromium firefox    # one-time
BASE_URL=https://your-portal yarn test                 # all browsers
BASE_URL=https://your-portal yarn test:ui              # interactive
yarn report                                            # open last HTML report
```

## CI

`.github/workflows/e2e-tests.yml` runs the suite daily (8am Central) and on
manual dispatch, uploads the HTML report + raw results as artifacts, posts to
Slack on failure, and fails the job if any test fails.
