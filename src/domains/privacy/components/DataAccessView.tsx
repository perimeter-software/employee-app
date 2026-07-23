'use client';

// "What we store about you" (Right to Access). Read-only, plain-language
// sections + a download button. No destructive path lives here.
import Link from 'next/link';
import { Download, ShieldCheck, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { useDataExport, useCurrentErasureRequest } from '../hooks/use-privacy';
import { isActive } from '../types';

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

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data?.sections.map((section) => (
            <Card key={section.key}>
              <CardHeader>
                <CardTitle className="text-base">{section.title}</CardTitle>
                <p className="text-xs text-gray-500">{section.purpose}</p>
              </CardHeader>
              <CardContent>
                <dl className="space-y-1.5 text-sm">
                  {section.items.map((item) => (
                    <div key={item.label} className="flex justify-between gap-4">
                      <dt className="text-gray-500">{item.label}</dt>
                      <dd className="font-medium text-gray-900">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
            <Button variant={isActive(current?.status) ? 'outline' : 'outline-danger'} rightIcon={<ChevronRight className="h-4 w-4" />}>
              {isActive(current?.status) ? 'View request' : 'Request deletion'}
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
