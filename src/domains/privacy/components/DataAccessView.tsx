'use client';

// "What we store about you" (Right to Access). Consumes the real
// GET /me/data-export shape: three fixed sections (personalData /
// financialRecords / externalSystems), each an array of { source, recordCount,
// records? }. Read-only; the only action is a client-side download.
import Link from 'next/link';
import { Download, ShieldCheck, ChevronRight, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { useDataExport, useCurrentErasureRequest } from '../hooks/use-privacy';
import { isActive, type DataExportEntry } from '../types';

// Friendly labels for raw collection names; falls back to the raw name so a
// newly-added source degrades gracefully rather than rendering blank.
const SOURCE_LABELS: Record<string, string> = {
  // Personal data
  applicants: 'Applicant profile',
  users: 'Account',
  applicantEmbeddings: 'Search index data',
  s3messages: 'Messages',
  timecard: 'Timecards',
  eventroster: 'Events worked',
  events: 'Events worked',
  notifications: 'Notifications',
  activities: 'Activity history',
  tasks: 'Tasks',
  topics: 'Notification subscriptions',
  'suppression-list': 'Email preferences',
  'nlq-logs': 'Search history',
  agentic_reports: 'Reports',
  // Financial (retained, anonymized)
  payments: 'Payments',
  expenses: 'Expenses',
  'expense-reports': 'Expense reports',
  'paycheck-stubs': 'Paycheck stubs',
  'payroll-batches': 'Payroll batches',
  'invoice-batches': 'Invoices',
  'prism-payroll-vouchers': 'Payroll vouchers',
  'prism-billing-vouchers': 'Billing vouchers',
  'prism-import-logs': 'Payroll import records',
  'pto-requests': 'Time-off requests',
  'pto-balances': 'Time-off balances',
  // External systems
  s3: 'Uploaded files',
  usermaster: 'Login identity',
  clerk: 'Login identity',
  auth0: 'Login identity',
};

// Fallback for any source not explicitly mapped: turn a raw collection name
// into readable Title Case ("prism-import-logs" → "Prism Import Logs") so a
// newly-added source never surfaces as a bare code-y name.
function humanize(source: string): string {
  return source
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
const labelFor = (source: string) => {
  // External-system sources arrive parenthesized, e.g. "(s3)" / "(usermaster)".
  const key = source.replace(/^\(+|\)+$/g, '');
  return SOURCE_LABELS[key] ?? humanize(key);
};

// The backend's `recordCount` can understate (e.g. eventroster reports 1 but
// returns 19 records), so use the larger of the reported count and the actual
// records returned. `records` is an array for personalData, an object for
// external systems (in which case only recordCount applies).
function countFor(e: DataExportEntry): number {
  if (Array.isArray(e.records)) return Math.max(e.recordCount ?? 0, e.records.length);
  // External-system entries carry an object, e.g. S3 `{ documentCount, keys }`.
  if (e.records && typeof e.records === 'object') {
    const dc = (e.records as { documentCount?: unknown }).documentCount;
    if (typeof dc === 'number') return Math.max(e.recordCount ?? 0, dc);
  }
  return e.recordCount ?? 0;
}

function SourceList({ entries }: { entries: DataExportEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-gray-500">Nothing on file.</p>;
  }
  // Aggregate by display label so duplicate/aliased sources (e.g. two
  // `payroll-batches` entries, or `events` + `eventroster`) collapse into one
  // line with a summed count — and never collide on the React key.
  const byLabel = new Map<string, number>();
  for (const e of entries) {
    const label = labelFor(e.source);
    byLabel.set(label, (byLabel.get(label) ?? 0) + countFor(e));
  }
  return (
    <ul className="space-y-1.5 text-sm">
      {[...byLabel.entries()].map(([label, count]) => (
        <li key={label} className="flex items-center justify-between gap-4">
          <span className="text-gray-700">{label}</span>
          <span className="font-medium text-gray-900">
            {count} {count === 1 ? 'record' : 'records'}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function DataAccessView() {
  const { data, isLoading, error } = useDataExport();
  const { data: current } = useCurrentErasureRequest();

  const download = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 403 means the logged-in account has no applicant/employee record — the
  // feature simply doesn't apply. Show a gentle notice instead of an error.
  const httpStatus = (error as { response?: { status?: number } } | null)?.response?.status;
  if (httpStatus === 403) {
    return (
      <Alert>
        <AlertTitle>Not applicable to your account</AlertTitle>
        <AlertDescription>
          This page is for applicants and employees. There’s no personal record linked to your login.
        </AlertDescription>
      </Alert>
    );
  }

  const hasSoftErrors = (data?.errors?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-6 w-6 text-appPrimary" />
          <div>
            <h1 className="text-xl font-semibold">Privacy &amp; My Data</h1>
            <p className="text-sm text-gray-500">
              Everything we store about you, and why. You can download it or request deletion.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          leftIcon={<Download className="h-4 w-4" />}
          onClick={download}
          disabled={!data}
        >
          Download my data
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not load your data</AlertTitle>
          <AlertDescription>Please refresh the page and try again.</AlertDescription>
        </Alert>
      )}

      {/* `errors` may be non-empty on a successful response — soft warning. */}
      {hasSoftErrors && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Some records could not be retrieved</AlertTitle>
          <AlertDescription>
            Part of your data was temporarily unavailable. What we could load is shown below.
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : data ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personal data</CardTitle>
              <p className="text-xs text-gray-500">
                Identifies you and supports your application, jobs and communications.
              </p>
            </CardHeader>
            <CardContent>
              <SourceList entries={data.personalData} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Financial records</CardTitle>
              <p className="text-xs text-gray-500">
                Required to pay you and to meet payroll/tax law. Anonymized — not deleted — if you erase your account.
              </p>
            </CardHeader>
            <CardContent>
              <SourceList entries={data.financialRecords} />
            </CardContent>
          </Card>

          <Card className="sm:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">External systems</CardTitle>
              <p className="text-xs text-gray-500">
                File storage and identity providers that hold data outside our database.
              </p>
            </CardHeader>
            <CardContent>
              <SourceList entries={data.externalSystems} />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Delete entry point — reflects any in-flight request. */}
      <Card className="border-red-100">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="font-medium text-gray-900">Delete my account &amp; data</p>
            <p className="text-sm text-gray-500">
              {isActive(current?.status)
                ? 'You have a pending deletion request. Review its status.'
                : 'Request permanent deletion. Payroll/tax records are anonymized and retained as required by law.'}
            </p>
          </div>
          <Link href="/privacy/delete">
            <Button
              variant={isActive(current?.status) ? 'outline' : 'outline-danger'}
              rightIcon={<ChevronRight className="h-4 w-4" />}
            >
              {isActive(current?.status) ? 'View request' : 'Request deletion'}
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
