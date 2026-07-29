'use client';

// Self-service "Delete my account" flow. Screen state is driven entirely by
// GET /me/erasure-requests/current (the guide's single source of truth): the
// Cancel button follows `canCancel`, the countdown follows
// `secondsUntilExecution`. Otherwise it shows the request form with an impact
// preview, email-confirm, and explicit acknowledgements.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Clock, Ban, ShieldOff, Loader2, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import { useCurrentUser } from '@/domains/user/hooks/use-current-user';
import {
  useCurrentErasureRequest,
  useCreateErasureRequest,
  useCancelErasureRequest,
  useErasurePreview,
} from '../hooks/use-privacy';
import { isActive } from '../types';

// Coarse, on-or-after wording — the server sweep runs hourly, so execution is
// at or shortly after `executeAfter`, not to the second.
function humanizeSeconds(secs: number | null): string {
  if (secs == null || secs <= 0) return 'soon';
  const days = Math.floor(secs / 86_400);
  if (days >= 1) return `in about ${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.floor(secs / 3_600);
  if (hours >= 1) return `in about ${hours} hour${hours === 1 ? '' : 's'}`;
  return 'within the hour';
}

export default function ErasureRequestFlow() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data: current, isLoading: currentLoading } = useCurrentErasureRequest();
  const create = useCreateErasureRequest();
  const cancel = useCancelErasureRequest();

  const [reason, setReason] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [ackErase, setAckErase] = useState(false);
  const [ackRetain, setAckRetain] = useState(false);

  const noActiveRequest = !isActive(current?.status);
  // Fetch the impact preview only when the form is actually shown.
  const preview = useErasurePreview(noActiveRequest && !currentLoading);

  const email = (user?.email as string) || '';
  const emailConfirmed = confirmEmail.trim().toLowerCase() === email.trim().toLowerCase() && !!email;
  const canSubmit = emailConfirmed && ackErase && ackRetain && !create.isPending;

  // Local countdown ticker seeded from the server's secondsUntilExecution.
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    setSecondsLeft(current?.secondsUntilExecution ?? null);
  }, [current?.secondsUntilExecution]);
  const counting = secondsLeft != null;
  useEffect(() => {
    if (!counting) return;
    const t = setInterval(() => setSecondsLeft((s) => (s == null ? s : Math.max(0, s - 1))), 1000);
    return () => clearInterval(t);
  }, [counting]);

  const submit = () => {
    create.mutate(
      { reason: reason.trim() || undefined, confirm: confirmEmail.trim() },
      {
        onSuccess: (res) =>
          toast.success(res.alreadyExisted ? 'You already have a request in progress.' : 'Deletion scheduled.'),
        onError: () => toast.error('Could not submit your request. Please try again.'),
      },
    );
  };

  const onCancel = () => {
    if (!current) return;
    cancel.mutate(current.requestId, {
      onSuccess: () => toast.success('Your deletion request was cancelled.'),
      // On a 409 (lost race), the invalidate refetches current → re-renders as in-progress.
      onError: () => toast.error('Could not cancel — refreshing status.'),
    });
  };

  const loading = userLoading || currentLoading;
  const status = current?.status;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/privacy" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to My Data
      </Link>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : status === 'completed' || status === 'completed_with_errors' ? (
        // Terminal — the account is (being) removed. The session will end soon.
        <Card className="border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-800">
              <CheckCircle2 className="h-5 w-5" /> Your data has been erased
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-700">
            <p>
              Your personal data was erased{current?.completedAt ? ` on ${new Date(current.completedAt).toLocaleDateString()}` : ''}.
              Payroll and tax records were anonymized and retained as required by law.
            </p>
            <p>You will be signed out shortly.</p>
          </CardContent>
        </Card>
      ) : status === 'failed' ? (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-700">Something went wrong</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-700">
            We hit a problem processing your request and our team has been notified. Please check back later.
          </CardContent>
        </Card>
      ) : isActive(status) ? (
        // scheduled / pending / running
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800">
              {status === 'scheduled' ? <Clock className="h-5 w-5" /> : <Loader2 className="h-5 w-5 animate-spin" />}
              {status === 'scheduled' ? 'Deletion scheduled' : status === 'pending' ? 'Deletion queued' : 'Deletion in progress'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {status === 'scheduled' ? (
              <p className="text-sm text-gray-700">
                Your account and personal data will be deleted on or after{' '}
                <strong>{current?.executeAfter ? new Date(current.executeAfter).toLocaleDateString() : '—'}</strong>
                {' '}({humanizeSeconds(secondsLeft)}). You can cancel any time before then.
              </p>
            ) : (
              <p className="text-sm text-gray-700">
                Your deletion is being processed. This can’t be cancelled anymore.
              </p>
            )}
            {current?.source === 'admin' && (
              <Alert>
                <AlertDescription>This request was started by our team. You can still cancel it while it’s scheduled.</AlertDescription>
              </Alert>
            )}
            <Alert>
              <AlertTitle>What happens</AlertTitle>
              <AlertDescription>
                Personal data (contact info, documents, messages) is permanently deleted. Payroll and
                tax records are anonymized and retained as required by law.
              </AlertDescription>
            </Alert>
            {current?.canCancel && (
              <Button
                variant="outline"
                leftIcon={cancel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                onClick={onCancel}
                disabled={cancel.isPending}
              >
                Cancel deletion
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        // No active request (never made, or previously cancelled) → the form.
        <Card className="border-red-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <ShieldOff className="h-5 w-5" /> Delete my account &amp; data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {status === 'cancelled' && (
              <Alert>
                <AlertDescription>Your previous request was cancelled. You can submit a new one below.</AlertDescription>
              </Alert>
            )}

            <Alert variant="destructive">
              <AlertTitle>This cannot be undone once it runs</AlertTitle>
              <AlertDescription>
                After a cooling-off period (30 days by default) your personal data is permanently
                deleted. You can cancel any time during that period from this page.
              </AlertDescription>
            </Alert>

            {/* Impact preview (totals only for self-service). */}
            {preview.data && (
              <div className="rounded-md border bg-gray-50 p-3 text-sm">
                <p className="mb-1 font-medium text-gray-800">What this affects</p>
                <ul className="space-y-0.5 text-gray-600">
                  <li><strong className="text-gray-900">{preview.data.totals.piiRecords}</strong> personal records deleted</li>
                  <li><strong className="text-gray-900">{preview.data.totals.financialRecords}</strong> financial records anonymized &amp; kept (required by law)</li>
                  <li><strong className="text-gray-900">{preview.data.totals.externalSystems}</strong> external systems (files, identity)</li>
                </ul>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Textarea
                id="reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Tell us why you're leaving (optional)"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-email">
                Type your email <span className="font-semibold">{email}</span> to confirm
              </Label>
              <Input
                id="confirm-email"
                autoComplete="off"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder={email}
              />
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={ackErase} onChange={(e) => setAckErase(e.target.checked)} />
              <span>I understand my personal data will be permanently deleted after the cooling-off period.</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={ackRetain} onChange={(e) => setAckRetain(e.target.checked)} />
              <span>I understand payroll and tax records will be anonymized and retained as required by law.</span>
            </label>

            <Button
              variant="outline-danger"
              onClick={submit}
              disabled={!canSubmit}
              leftIcon={create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
            >
              Schedule deletion
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
