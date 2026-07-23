'use client';

// Self-service "Delete my account" flow. When a request is active it shows the
// cooling-off status + a Cancel action; otherwise it shows the request form
// (optional reason, type-to-confirm email, explicit acknowledgements).
import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Clock, Ban, ShieldOff, Loader2 } from 'lucide-react';
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
} from '../hooks/use-privacy';
import { isActive } from '../types';

function daysUntil(iso?: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
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

  const email = (user?.email as string) || '';
  const emailConfirmed = confirmEmail.trim().toLowerCase() === email.trim().toLowerCase() && !!email;
  const canSubmit = emailConfirmed && ackErase && ackRetain && !create.isPending;

  const submit = () => {
    create.mutate(
      { reason: reason.trim() || undefined, confirm: confirmEmail.trim() },
      {
        onSuccess: () => toast.success('Deletion scheduled.'),
        onError: () => toast.error('Could not submit your request. Please try again.'),
      },
    );
  };

  const onCancel = () => {
    if (!current) return;
    cancel.mutate(current.id, {
      onSuccess: () => toast.success('Your deletion request was cancelled.'),
      onError: () => toast.error('Could not cancel. Please try again.'),
    });
  };

  const loading = userLoading || currentLoading;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/privacy" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to My Data
      </Link>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : isActive(current?.status) ? (
        // ── Active request: cooling-off status + cancel ──
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800">
              <Clock className="h-5 w-5" /> Deletion scheduled
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-700">
              Your account and personal data are scheduled for deletion on{' '}
              <strong>{current?.executeAfter ? new Date(current.executeAfter).toLocaleDateString() : '—'}</strong>
              {' '}({daysUntil(current?.executeAfter)} days from now). You can cancel any time before then.
            </p>
            <Alert>
              <AlertTitle>What happens</AlertTitle>
              <AlertDescription>
                Personal data (contact info, documents, messages) is permanently deleted. Payroll and
                tax records are anonymized and retained as required by law.
              </AlertDescription>
            </Alert>
            <Button
              variant="outline"
              leftIcon={cancel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              onClick={onCancel}
              disabled={cancel.isPending}
            >
              Cancel deletion
            </Button>
          </CardContent>
        </Card>
      ) : (
        // ── No active request: the request form ──
        <Card className="border-red-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <ShieldOff className="h-5 w-5" /> Delete my account &amp; data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {current?.status === 'cancelled' && (
              <Alert>
                <AlertDescription>Your previous request was cancelled. You can submit a new one below.</AlertDescription>
              </Alert>
            )}

            <Alert variant="destructive">
              <AlertTitle>This cannot be undone once it runs</AlertTitle>
              <AlertDescription>
                After a 30-day cooling-off period your personal data is permanently deleted. During
                those 30 days you can cancel from this page.
              </AlertDescription>
            </Alert>

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
