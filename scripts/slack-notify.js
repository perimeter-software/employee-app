#!/usr/bin/env node

/**
 * Slack notifier for the E2E suite.
 *
 * Reads the Playwright JSON report (test-results/results.json) and posts a
 * summary to a Slack incoming webhook. Invoked by:
 *   - the CI workflow on test failure
 *   - `npm run notify` (manual)
 *
 * Environment:
 *   SLACK_WEBHOOK_URL   (required) Slack incoming webhook URL
 *   CI_PIPELINE_URL     (optional) Link to the CI run, included in the message
 *   CI_PROJECT_NAME     (optional) Repo / project name shown in the header
 *   BASE_URL            (optional) The environment the tests ran against
 *
 * Never exits non-zero — a failed notification must not mask the real test
 * result, which the CI job reports separately.
 */

const fs = require('node:fs');
const path = require('node:path');

const WEBHOOK = process.env.SLACK_WEBHOOK_URL;
const RESULTS_PATH = path.resolve(
  process.cwd(),
  'test-results',
  'results.json'
);

function readReport() {
  try {
    const raw = fs.readFileSync(RESULTS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Recursively collect titles of specs that failed. */
function collectFailures(suites, trail = []) {
  const failures = [];
  for (const suite of suites ?? []) {
    const nextTrail = suite.title ? [...trail, suite.title] : trail;
    for (const spec of suite.specs ?? []) {
      if (spec.ok === false) {
        failures.push([...nextTrail, spec.title].filter(Boolean).join(' › '));
      }
    }
    failures.push(...collectFailures(suite.suites, nextTrail));
  }
  return failures;
}

async function main() {
  if (!WEBHOOK) {
    console.error('SLACK_WEBHOOK_URL is not set — skipping Slack notification.');
    return;
  }

  const report = readReport();
  const stats = report?.stats ?? {};
  const passed = stats.expected ?? 0;
  const failed = stats.unexpected ?? 0;
  const flaky = stats.flaky ?? 0;
  const skipped = stats.skipped ?? 0;

  const failures = report ? collectFailures(report.suites) : [];
  const ok = failed === 0;

  const project = process.env.CI_PROJECT_NAME || 'employee-app';
  const target = process.env.BASE_URL ? `\nTarget: ${process.env.BASE_URL}` : '';
  const runLink = process.env.CI_PIPELINE_URL
    ? `\n<${process.env.CI_PIPELINE_URL}|View the full run →>`
    : '';

  const header = ok
    ? `✅ E2E passed — ${project}`
    : `🚨 E2E failed — ${project}`;

  const summary =
    report == null
      ? 'No test report was found (test-results/results.json missing). The run may have crashed before producing results.'
      : `*${passed}* passed · *${failed}* failed · *${flaky}* flaky · *${skipped}* skipped`;

  const failureList =
    failures.length > 0
      ? '\n\n*Failures:*\n' +
        failures
          .slice(0, 15)
          .map((f) => `• ${f}`)
          .join('\n') +
        (failures.length > 15 ? `\n…and ${failures.length - 15} more` : '')
      : '';

  const text = `${header}\n${summary}${failureList}${target}${runLink}`;

  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    console.error(
      `Slack webhook responded ${res.status}: ${await res.text().catch(() => '')}`
    );
    return;
  }

  console.log('Slack notification sent.');
}

main().catch((err) => {
  console.error('Failed to send Slack notification:', err);
  // Intentionally do not rethrow — see file header.
});
