'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import type {
  ShiftDaySnapshot,
  SwapRequest,
  SwapRequestType,
} from '@/domains/swap/types';
import type { GignologyJob } from '@/domains/job/types/job.types';
import {
  usePickupInterestSeekersQuery,
  usePickupOpportunitiesQuery,
  useWillingSwapCandidatesQuery,
} from '@/domains/swap/hooks/use-swap-requests';
import { ArrowLeftRight, ArrowRightLeft, Plus, Zap } from 'lucide-react';

type SwapMode = 'swap' | 'giveaway' | 'pickup_interest';

const WILLING_LIMIT = 5;

export interface ShiftSwapRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  loading?: boolean;
  /** Shown in header; include date, times, job, shift name as needed */
  shiftInfo?: {
    summaryLine: string;
    jobSlug: string;
    shiftSlug: string;
    /** YYYY-MM-DD for the row the user is trading (responder leg). */
    fromShiftDate: string;
  } | null;
  /** Date range (e.g. table week) used to list pickup opportunities for this shift. */
  pickupListDateRange?: { startDate: string; endDate: string } | null;
  onSubmit: (input: {
    type: SwapRequestType;
    toEmployeeId?: string | null;
    toShiftSlug?: string | null;
    toShiftDate?: string | null;
    acceptAny?: boolean;
    notes?: string;
    /** Option 3: consume open giveaway via create payload (`matchGiveawayId`). */
    matchGiveawayId?: string | null;
    /** Option 3: tag interest for this shift-day (YYYY-MM-DD). */
    pickupTargetShiftDate?: string | null;
  }) => void;
  /**
   * When the user picks a coworker from “willing to swap”, update that open
   * request (PATCH accept) instead of creating a second document.
   */
  onAcceptPeerSwap?: (input: {
    swapRequestId: string;
    toShiftSlug: string;
    toShiftDate: string;
    notes?: string;
  }) => void;
  /** When set, modal shows read-only details for an open request (from the row). */
  existingRequest?: {
    request: SwapRequest;
    viewerRole: 'from' | 'to';
  } | null;
  /** Job from the shift row — used to resolve shift names in the summary. */
  contextJob?: GignologyJob | null;
  /** Withdraw / remove (initiator only; server enforces). */
  onWithdraw?: (swapRequestId: string) => void;
}

const TABS: Array<{ id: SwapMode; label: string; Icon: typeof ArrowLeftRight }> = [
  { id: 'swap', label: 'Swap with Another Employee', Icon: ArrowLeftRight },
  { id: 'giveaway', label: 'Let Someone Take My Shift', Icon: ArrowRightLeft },
  { id: 'pickup_interest', label: 'Pick Up More Shifts / Events', Icon: Plus },
];

function formatCandidateShiftLine(s: ShiftDaySnapshot): string {
  const day =
    s.dayOfWeek?.charAt(0).toUpperCase() +
    (s.dayOfWeek?.slice(1).toLowerCase() || '');
  const d = new Date(`${s.date}T12:00:00`);
  const md = d.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
  let timePart = '';
  if (s.start && s.end) {
    const st = new Date(s.start).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const en = new Date(s.end).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    timePart = ` · ${st} – ${en}`;
  }
  return `${day}, ${md}${timePart}`;
}

function formatYmdUs(ymd: string): string {
  const d = Date.parse(`${ymd}T12:00:00`);
  if (Number.isNaN(d)) return ymd;
  return new Date(d).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

function shiftLabel(job: GignologyJob | null | undefined, slug: string | null | undefined) {
  if (!job || !slug) return null;
  const s = job.shifts?.find((sh) => sh.slug === slug);
  return s?.shiftName || s?.slug || null;
}

/** Resolve applicant display name from shift rosters (`_id` matches swap `*EmployeeId`). */
function coworkerDisplayNameFromJob(
  job: GignologyJob | null | undefined,
  employeeId: string | null | undefined
): string | null {
  if (!job?.shifts || !employeeId) return null;
  const id = String(employeeId);
  for (const sh of job.shifts) {
    const roster = sh.shiftRoster;
    if (!Array.isArray(roster)) continue;
    for (const a of roster) {
      if (!a || typeof a !== 'object' || !('_id' in a)) continue;
      if (String((a as { _id: string })._id) !== id) continue;
      const rec = a as {
        fullName?: string;
        firstName?: string;
        lastName?: string;
      };
      const full = rec.fullName?.trim();
      if (full) return full;
      const parts = [rec.firstName, rec.lastName].filter(
        (x): x is string => typeof x === 'string' && x.trim() !== ''
      );
      if (parts.length) return parts.join(' ');
    }
  }
  return null;
}

function formatSubmittedAt(iso: string): string {
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return iso;
  return new Date(d).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatRelativeRequested(iso: string): string {
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return '';
  const sec = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (sec < 60) return 'Requested just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `Requested ${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `Requested ${h}h ago`;
  const days = Math.floor(h / 24);
  return `Requested ${days}d ago`;
}

function shortWeekdayLabel(ymd: string): string {
  const d = Date.parse(`${ymd}T12:00:00`);
  if (Number.isNaN(d)) return '';
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short' });
}

function avatarHueForId(id: string): string {
  const palette = ['#0d9488', '#ea580c', '#7c3aed', '#db2777', '#0369a1', '#16a34a'];
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h + id.charCodeAt(i) * 17) % palette.length;
  }
  return palette[h] ?? palette[0];
}

function SwapRequestDetailPanel({
  request,
  viewerRole,
  job,
  loading,
  onWithdraw,
}: {
  request: SwapRequest;
  viewerRole: 'from' | 'to';
  job: GignologyJob | null | undefined;
  loading: boolean;
  onWithdraw?: (id: string) => void;
}) {
  const statusLabel =
    request.status === 'pending_match'
      ? 'Waiting for match'
      : request.status === 'pending_approval'
        ? 'Awaiting approval'
        : request.status;

  const typeLabel =
    request.type === 'swap'
      ? 'Swap with another employee'
      : request.type === 'giveaway'
        ? 'Giveaway — let someone take your shift'
        : 'Pick up more shifts / events';

  const swapPeerEmployeeId =
    viewerRole === 'to' ? request.fromEmployeeId : request.toEmployeeId ?? null;
  const swapPeerName = coworkerDisplayNameFromJob(job, swapPeerEmployeeId);

  /** Spec: remove only for giveaway / pickup without a named coworker; never for swap or assigned giveaway/pickup. */
  const canWithdraw =
    viewerRole === 'from' &&
    ['pending_match', 'pending_approval'].includes(request.status) &&
    typeof onWithdraw === 'function' &&
    (request.type === 'giveaway' || request.type === 'pickup_interest') &&
    !request.toEmployeeId;

  return (
    <div className="space-y-4 px-6 pb-2">
      <div className="rounded-xl border border-gray-200 bg-gray-50/90 p-4 space-y-3 text-sm text-gray-800">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">
            {statusLabel}
          </Badge>
        </div>
        <p>
          <span className="font-semibold text-gray-700">Request type: </span>
          {typeLabel}
        </p>

        {request.type === 'swap' && (
          <div className="space-y-2 border-t border-gray-200 pt-3 text-gray-700">
            <p className="font-medium text-gray-900">How you matched</p>
            {request.acceptAny && !request.toEmployeeId ? (
              <p>
                Open offer — any coworker on this job/shift can match with you.
              </p>
            ) : request.toEmployeeId ? (
              <p>
                {viewerRole === 'to'
                  ? swapPeerName
                    ? `${swapPeerName} requested this swap with you. It is waiting for administrator approval.`
                    : 'A coworker requested this swap with you. It is waiting for administrator approval.'
                  : swapPeerName
                    ? `You matched with ${swapPeerName}. It is waiting for administrator approval.`
                    : 'You matched with a coworker (willing list). It is waiting for administrator approval.'}
              </p>
            ) : (
              <p>
                You chose a specific coworker from the willing list (or a directed swap). Your
                partner must confirm before admin approval.
              </p>
            )}
            {(request.toShiftDate || request.toShiftSlug) && (
              <p>
                <span className="font-medium">Other side:</span>{' '}
                {[shiftLabel(job, request.toShiftSlug), request.toShiftDate ? formatYmdUs(request.toShiftDate) : null]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </p>
            )}
          </div>
        )}

        {request.type === 'giveaway' && (
          <p className="border-t border-gray-200 pt-3 text-gray-700">
            You are offering this shift-day for someone else to take. Admin must approve before the
            schedule changes.
          </p>
        )}

        {request.type === 'pickup_interest' && (
          <p className="border-t border-gray-200 pt-3 text-gray-700">
            {request.taggedOnly
              ? 'Interest is saved — we will notify you when matching shifts open.'
              : 'You asked to pick up extra shifts when they become available.'}
          </p>
        )}

        <p className="text-xs text-muted-foreground border-t border-gray-200 pt-3">
          Submitted {formatSubmittedAt(request.submittedAt)}
        </p>

        {request.notes != null && String(request.notes).trim() !== '' && (
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-gray-800">{request.notes}</p>
          </div>
        )}
      </div>

      {viewerRole === 'from' &&
        request.type === 'swap' &&
        ['pending_match', 'pending_approval'].includes(request.status) && (
          <p className="text-xs text-muted-foreground">
            Swap requests cannot be removed from the app. Contact an administrator if you need to
            cancel.
          </p>
        )}

      {viewerRole === 'from' &&
        (request.type === 'giveaway' || request.type === 'pickup_interest') &&
        request.toEmployeeId &&
        ['pending_match', 'pending_approval'].includes(request.status) && (
          <p className="text-xs text-muted-foreground">
            This request names a specific coworker. To cancel, contact an administrator.
          </p>
        )}

      {viewerRole === 'to' && (
        <p className="text-xs text-muted-foreground">
          You are the partner on this request. To cancel your side, contact an administrator.
        </p>
      )}

      {canWithdraw && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline-danger"
            disabled={loading}
            onClick={() => onWithdraw?.(request._id)}
          >
            {loading ? 'Removing…' : 'Remove request'}
          </Button>
          <span className="text-xs text-muted-foreground">
            Withdraws this request from the queue.
          </span>
        </div>
      )}
    </div>
  );
}

export function ShiftSwapRequestModal({
  isOpen,
  onClose,
  loading = false,
  shiftInfo,
  pickupListDateRange,
  onSubmit,
  onAcceptPeerSwap,
  existingRequest,
  contextJob,
  onWithdraw,
}: ShiftSwapRequestModalProps) {
  const [mode, setMode] = useState<SwapMode>('swap');
  const [acceptAny, setAcceptAny] = useState(false);
  const [selectedSwapRequestId, setSelectedSwapRequestId] = useState<
    string | null
  >(null);
  const [willingPage, setWillingPage] = useState(1);
  const [seekersPage, setSeekersPage] = useState(1);
  const [giveawaySelectedEmployeeId, setGiveawaySelectedEmployeeId] = useState<
    string | null
  >(null);
  const [pickupSelectedDate, setPickupSelectedDate] = useState<string | null>(
    null
  );
  const [notes, setNotes] = useState('');

  const jobSlug = shiftInfo?.jobSlug ?? '';
  const shiftSlug = shiftInfo?.shiftSlug ?? '';

  const willingQuery = useWillingSwapCandidatesQuery({
    jobSlug,
    shiftSlug,
    page: willingPage,
    enabled:
      isOpen &&
      mode === 'swap' &&
      Boolean(jobSlug && shiftSlug) &&
      !existingRequest,
  });

  const seekersQuery = usePickupInterestSeekersQuery({
    jobSlug,
    shiftSlug,
    page: seekersPage,
    enabled:
      isOpen &&
      mode === 'giveaway' &&
      Boolean(jobSlug && shiftSlug) &&
      !existingRequest,
  });

  const opportunitiesQuery = usePickupOpportunitiesQuery({
    jobSlug,
    shiftSlug,
    startDate: pickupListDateRange?.startDate ?? '',
    endDate: pickupListDateRange?.endDate ?? '',
    enabled:
      isOpen &&
      mode === 'pickup_interest' &&
      Boolean(
        jobSlug &&
          shiftSlug &&
          pickupListDateRange?.startDate &&
          pickupListDateRange?.endDate
      ) &&
      !existingRequest,
  });

  useEffect(() => {
    if (!isOpen) {
      setMode('swap');
      setAcceptAny(false);
      setSelectedSwapRequestId(null);
      setWillingPage(1);
      setSeekersPage(1);
      setGiveawaySelectedEmployeeId(null);
      setPickupSelectedDate(null);
      setNotes('');
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedSwapRequestId(null);
    setWillingPage(1);
    setSeekersPage(1);
    setGiveawaySelectedEmployeeId(null);
    setPickupSelectedDate(null);
  }, [mode, jobSlug, shiftSlug]);

  useEffect(() => {
    if (acceptAny) setSelectedSwapRequestId(null);
  }, [acceptAny]);

  const selectedCandidate = useMemo(() => {
    if (!selectedSwapRequestId || !willingQuery.data?.items) return null;
    return willingQuery.data.items.find(
      (c) => c.swapRequestId === selectedSwapRequestId
    );
  }, [selectedSwapRequestId, willingQuery.data?.items]);

  const isValid = useMemo(() => {
    if (mode === 'swap') {
      if (acceptAny) return true;
      return Boolean(
        selectedCandidate &&
          shiftInfo?.fromShiftDate &&
          onAcceptPeerSwap
      );
    }
    if (mode === 'giveaway') {
      return Boolean(giveawaySelectedEmployeeId);
    }
    if (mode === 'pickup_interest') {
      return Boolean(pickupSelectedDate);
    }
    return false;
  }, [
    mode,
    acceptAny,
    selectedCandidate,
    shiftInfo?.fromShiftDate,
    onAcceptPeerSwap,
    giveawaySelectedEmployeeId,
    pickupSelectedDate,
  ]);

  const submit = () => {
    if (!isValid) return;

    if (mode === 'swap') {
      if (acceptAny) {
        onSubmit({
          type: 'swap',
          acceptAny: true,
          toEmployeeId: null,
          toShiftSlug: null,
          toShiftDate: null,
          notes: notes.trim() || undefined,
        });
        return;
      }
      if (
        selectedCandidate &&
        shiftInfo?.fromShiftDate &&
        onAcceptPeerSwap
      ) {
        onAcceptPeerSwap({
          swapRequestId: selectedCandidate.swapRequestId,
          toShiftSlug: shiftInfo.shiftSlug,
          toShiftDate: shiftInfo.fromShiftDate,
          notes: notes.trim() || undefined,
        });
        return;
      }
      return;
    }

    if (mode === 'giveaway') {
      if (!giveawaySelectedEmployeeId) return;
      onSubmit({
        type: 'giveaway',
        toEmployeeId: giveawaySelectedEmployeeId,
        toShiftSlug: null,
        toShiftDate: null,
        acceptAny: false,
        notes: notes.trim() || undefined,
      });
      return;
    }

    const opp = opportunitiesQuery.data?.items.find(
      (r) => r.shiftDate === pickupSelectedDate
    );
    if (!opp) return;
    if (opp.viewerAlreadyAssigned) return;

    const matchOpenGiveaway =
      opp.giveawayRequestId &&
      opp.availableNow &&
      !opp.directedToOther &&
      !opp.viewerAlreadyAssigned;

    if (matchOpenGiveaway) {
      onSubmit({
        type: 'pickup_interest',
        matchGiveawayId: opp.giveawayRequestId,
        pickupTargetShiftDate: opp.shiftDate,
        toEmployeeId: null,
        toShiftSlug: null,
        toShiftDate: null,
        acceptAny: false,
        notes: notes.trim() || undefined,
      });
      return;
    }

    onSubmit({
      type: 'pickup_interest',
      pickupTargetShiftDate: opp.shiftDate,
      matchGiveawayId: null,
      toEmployeeId: null,
      toShiftSlug: null,
      toShiftDate: null,
      acceptAny: false,
      notes: notes.trim() || undefined,
    });
  };

  const totalPages = willingQuery.data
    ? Math.max(1, Math.ceil(willingQuery.data.total / willingQuery.data.limit))
    : 1;

  const seekerTotalPages = seekersQuery.data
    ? Math.max(
        1,
        Math.ceil(seekersQuery.data.total / seekersQuery.data.limit)
      )
    : 1;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="bg-appPrimary text-white px-6 py-4 rounded-t-lg">
          <DialogTitle className="text-3xl">
            {existingRequest ? 'Swap request details' : 'Shift Swap Request'}
          </DialogTitle>
          <DialogDescription className="text-blue-100">
            {shiftInfo?.summaryLine ||
              (existingRequest
                ? 'Review your open request for this shift-day.'
                : 'Create a swap request for this shift-day.')}
          </DialogDescription>
        </DialogHeader>

        {existingRequest ? (
          <>
            <SwapRequestDetailPanel
              request={existingRequest.request}
              viewerRole={existingRequest.viewerRole}
              job={contextJob}
              loading={loading}
              onWithdraw={onWithdraw}
            />
            <DialogFooter className="gap-2 border-t bg-gray-50 px-6 py-4 rounded-b-lg">
              <Button variant="outline" onClick={onClose} disabled={loading}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
        <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMode(tab.id)}
              className={`rounded-lg border px-3 py-3 text-sm font-medium transition ${
                mode === tab.id
                  ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <div className="flex flex-col items-center justify-center gap-1">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full ${mode === tab.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  <tab.Icon className="h-4 w-4" />
                </span>
                <span>{tab.label}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {mode === 'swap' && (
            <>
              <p className="text-sm text-muted-foreground">
                Select a shift-day from another employee who is willing to swap.
                Or check <strong>Accept any available</strong> to match with the
                first employee who agrees.
              </p>

              <label
                className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-4 text-sm ${
                  acceptAny ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200'
                }`}
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={acceptAny}
                    onChange={(e) => setAcceptAny(e.target.checked)}
                    disabled={loading}
                  />
                  Accept any available swap
                </span>
                <span className="text-xs text-muted-foreground pl-6">
                  Automatically confirms when any willing employee agrees — no
                  manual selection needed.
                </span>
              </label>

              {!acceptAny && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Employees willing to swap
                    </h3>
                    {willingQuery.data != null && (
                      <span className="text-xs text-muted-foreground">
                        {willingQuery.data.total} total
                      </span>
                    )}
                  </div>

                  <div className="max-h-[280px] overflow-y-auto rounded-xl border border-gray-200 p-2 pr-1">
                    {willingQuery.isLoading && (
                      <div className="p-4 text-sm text-muted-foreground">
                        Loading…
                      </div>
                    )}
                    {willingQuery.isError && (
                      <div className="p-4 text-sm text-red-600">
                        Could not load the list. Try again.
                      </div>
                    )}
                    {willingQuery.data &&
                      willingQuery.data.items.length === 0 && (
                        <div className="p-4 text-sm text-muted-foreground">
                          No open swap offers from coworkers yet. Turn on{' '}
                          <strong>Accept any available</strong> or try again
                          later.
                        </div>
                      )}
                    {willingQuery.data?.items.map((c) => {
                      const selected = selectedSwapRequestId === c.swapRequestId;
                      return (
                        <button
                          key={c.swapRequestId}
                          type="button"
                          onClick={() =>
                            setSelectedSwapRequestId(c.swapRequestId)
                          }
                          className={`mb-2 flex w-full items-start gap-3 rounded-xl border p-4 text-left transition last:mb-0 ${
                            selected
                              ? 'border-blue-500 bg-blue-50/60'
                              : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <div
                            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                            style={{
                              backgroundColor: 'var(--app-primary, #0d9488)',
                            }}
                          >
                            {c.initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-gray-900">
                              {c.displayName}
                            </div>
                            <div className="text-xs text-gray-600">
                              {formatCandidateShiftLine(c.fromShiftDay)}
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className="flex-shrink-0 border-emerald-200 bg-emerald-50 text-emerald-800"
                          >
                            Open
                          </Badge>
                        </button>
                      );
                    })}
                  </div>

                  {willingQuery.data && willingQuery.data.total > WILLING_LIMIT && (
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={willingPage <= 1 || willingQuery.isFetching}
                        onClick={() =>
                          setWillingPage((p) => Math.max(1, p - 1))
                        }
                      >
                        Previous
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Page {willingPage} of {totalPages}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={
                          !willingQuery.data.hasMore || willingQuery.isFetching
                        }
                        onClick={() => setWillingPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {mode === 'giveaway' && (
            <>
              <p className="text-sm text-muted-foreground">
                These employees want extra work and won&apos;t give up one of
                their own shifts in return. Select one to offer them your
                shift-day. Admin approval still required.
              </p>
              <div className="max-h-[280px] overflow-y-auto rounded-xl border border-gray-200 p-2 pr-1">
                {seekersQuery.isLoading && (
                  <div className="p-4 text-sm text-muted-foreground">
                    Loading…
                  </div>
                )}
                {seekersQuery.isError && (
                  <div className="p-4 text-sm text-red-600">
                    Could not load the list. Try again.
                  </div>
                )}
                {seekersQuery.data &&
                  seekersQuery.data.items.length === 0 && (
                    <div className="p-4 text-sm text-muted-foreground">
                      No coworkers have tagged extra-shift interest for this
                      job yet. Check back later.
                    </div>
                  )}
                {seekersQuery.data?.items.map((s) => {
                  const selected =
                    giveawaySelectedEmployeeId === s.employeeId;
                  return (
                    <button
                      key={`${s.employeeId}-${s.swapRequestId}`}
                      type="button"
                      onClick={() =>
                        setGiveawaySelectedEmployeeId(s.employeeId)
                      }
                      className={`mb-2 flex w-full items-start gap-3 rounded-xl border p-4 text-left transition last:mb-0 ${
                        selected
                          ? 'border-blue-500 bg-blue-50/60'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                        style={{
                          backgroundColor: avatarHueForId(s.employeeId),
                        }}
                      >
                        {s.initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-gray-900">
                          {s.displayName}
                        </div>
                        <div className="text-xs text-gray-600">
                          Preference:{' '}
                          {s.preferenceNote || 'Any shift · extra work'}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Interested in {formatYmdUs(s.interestShiftDate)} ·{' '}
                          {formatRelativeRequested(s.submittedAt)}
                        </div>
                      </div>
                      <span
                        className={`mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                          selected
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-gray-300'
                        }`}
                        aria-hidden
                      >
                        {selected ? '✓' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
              {seekersQuery.data &&
                seekersQuery.data.total > seekersQuery.data.limit && (
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={seekersPage <= 1 || seekersQuery.isFetching}
                      onClick={() =>
                        setSeekersPage((p) => Math.max(1, p - 1))
                      }
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Page {seekersPage} of {seekerTotalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        !seekersQuery.data.hasMore || seekersQuery.isFetching
                      }
                      onClick={() => setSeekersPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
            </>
          )}

          {mode === 'pickup_interest' && (
            <>
              <p className="text-sm text-muted-foreground">
                Tag shift-days or events you&apos;re interested in taking on.{' '}
                <Zap className="inline h-3.5 w-3.5 text-amber-500 align-[-2px]" />{' '}
                <strong>Available now</strong> means someone has already offered
                that slot — the exchange can be completed right here.
              </p>
              {!pickupListDateRange?.startDate ||
              !pickupListDateRange?.endDate ? (
                <p className="text-sm text-amber-800 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  Pickup list needs a date range. Try closing and opening the
                  modal from the schedule again.
                </p>
              ) : (
                <div className="space-y-2">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Available opportunities
                    </h3>
                    {typeof opportunitiesQuery.data?.swapBeforeHours ===
                      'number' && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Only shift-days whose start is at least{' '}
                        <strong>
                          {opportunitiesQuery.data.swapBeforeHours} hours
                        </strong>{' '}
                        away are listed (from job settings).
                      </p>
                    )}
                  </div>
                  <div className="max-h-[300px] overflow-y-auto rounded-xl border border-gray-200 p-2 pr-1">
                    {opportunitiesQuery.isLoading && (
                      <div className="p-4 text-sm text-muted-foreground">
                        Loading…
                      </div>
                    )}
                    {opportunitiesQuery.isError && (
                      <div className="p-4 text-sm text-red-600">
                        Could not load opportunities. Try again.
                      </div>
                    )}
                    {opportunitiesQuery.data &&
                      opportunitiesQuery.data.items.length === 0 && (
                        <div className="p-4 text-sm text-muted-foreground">
                          No shift-days in this range are far enough out to meet
                          this job&apos;s advance-notice rule, match this shift
                          template, or the shift is not scheduled on those
                          weekdays.
                        </div>
                      )}
                    {opportunitiesQuery.data?.items.map((row) => {
                      const selected = pickupSelectedDate === row.shiftDate;
                      const title =
                        row.shiftName ||
                        shiftLabel(contextJob, shiftSlug) ||
                        'Shift';
                      const timeLine = formatCandidateShiftLine(row.shiftDay);
                      const rowDisabled = row.viewerAlreadyAssigned;
                      return (
                        <button
                          key={row.shiftDate}
                          type="button"
                          disabled={rowDisabled}
                          onClick={() =>
                            !rowDisabled && setPickupSelectedDate(row.shiftDate)
                          }
                          className={`mb-2 flex w-full items-start gap-3 rounded-xl border p-4 text-left shadow-sm transition last:mb-0 ${
                            rowDisabled
                              ? 'cursor-not-allowed border-gray-100 bg-gray-50/80 opacity-95'
                              : selected
                                ? 'border-blue-500 bg-blue-50/60'
                                : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex h-12 w-12 flex-shrink-0 flex-col items-center justify-center rounded-lg bg-sky-600 text-center text-xs font-bold text-white leading-tight">
                            <span>{shortWeekdayLabel(row.shiftDate)}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-gray-900">
                                {title}
                              </span>
                              {row.viewerAlreadyAssigned && (
                                <Badge
                                  variant="outline"
                                  className="border-slate-300 bg-slate-50 text-slate-700 text-[10px] uppercase"
                                >
                                  Your shift
                                </Badge>
                              )}
                              {row.availableNow && (
                                <Badge
                                  variant="outline"
                                  className="border-amber-300 bg-amber-50 text-amber-900 text-[10px] uppercase"
                                >
                                  Available now
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-gray-600 mt-0.5">
                              {timeLine}
                            </div>
                            {row.availableNow && row.offererDisplayName && (
                              <div className="mt-1 flex items-center gap-1 text-xs text-orange-600">
                                <Zap className="h-3 w-3 shrink-0" />
                                <span>
                                  {row.directedToOther
                                    ? `${row.offererDisplayName} offered this shift`
                                    : `${row.offererDisplayName} is offering this shift`}
                                </span>
                              </div>
                            )}
                          </div>
                          <span
                            className={`mt-2 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                              selected
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-gray-300'
                            }`}
                            aria-hidden
                          >
                            {selected ? '✓' : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          <Textarea
            rows={3}
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={loading}
          />
        </div>

        {mode === 'swap' && (
          <p className="text-xs text-muted-foreground">
            Both employees must agree before admin approval is required.
          </p>
        )}

        <DialogFooter className="gap-2 border-t bg-gray-50 px-6 py-4 rounded-b-lg">
          {mode === 'swap' && (
            <p className="mr-auto text-xs text-muted-foreground">
              Both employees must agree before admin approval is required.
            </p>
          )}
          {mode === 'giveaway' && (
            <p className="mr-auto text-xs text-muted-foreground">
              Your shift stays active until Admin approves the change.
            </p>
          )}
          {mode === 'pickup_interest' && (
            <p className="mr-auto text-xs text-muted-foreground">
              You&apos;ll be notified when a tagged opportunity is confirmed.
            </p>
          )}
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading || !isValid} className="bg-sky-400 hover:bg-sky-500 text-white">
            {loading ? 'Submitting...' : 'Submit Request'}
          </Button>
        </DialogFooter>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
