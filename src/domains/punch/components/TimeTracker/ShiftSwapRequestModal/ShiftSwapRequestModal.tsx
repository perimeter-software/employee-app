'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
  PickupInterestSeekerRow,
  PickupOpportunityRow,
  ShiftDaySnapshot,
  SwapRequest,
  SwapRequestType,
  WillingSwapCandidate,
} from '@/domains/swap/types';
import type { GignologyJob } from '@/domains/job/types/job.types';
import {
  prefetchShiftSwapModalLists,
  usePickupInterestSeekersQuery,
  usePickupOpportunitiesQuery,
  useWillingSwapCandidatesQuery,
} from '@/domains/swap/hooks/use-swap-requests';
import {
  addCalendarDaysToYmd,
  firstForwardYmdMeetingSwapLead,
  shiftDayMeetsSwapLead,
  todayYmdLocal,
} from '@/domains/swap/utils/swap-lead-eligibility';
import {
  ArrowLeftRight,
  ArrowRightLeft,
  Loader2,
  Plus,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

type SwapMode = 'swap' | 'giveaway' | 'pickup_interest';

const WILLING_LIMIT = 5;

/**
 * Scrollable list regions: `min-h-0` lets flex/grid ancestors shrink; `isolate` +
 * layout containment reduce repaint cost while scrolling; `transition-colors` only
 * avoids animating layout during hover/selection.
 */
const SWAP_MODAL_LIST_SCROLL =
  'isolate min-h-0 max-h-[280px] overflow-y-auto overscroll-y-contain touch-pan-y [-webkit-overflow-scrolling:touch] [contain:layout] rounded-xl border border-gray-200 p-2 pr-1';
const SWAP_MODAL_PICKUP_SCROLL =
  'isolate min-h-0 max-h-[300px] overflow-y-auto overscroll-y-contain touch-pan-y [-webkit-overflow-scrolling:touch] [contain:layout] rounded-xl border border-gray-200 p-2 pr-1';

const WillingSwapListRow = memo(function WillingSwapListRow({
  candidate,
  selected,
  onSelect,
}: {
  candidate: WillingSwapCandidate;
  selected: boolean;
  onSelect: (swapRequestId: string) => void;
}) {
  const timeLine = useMemo(
    () => formatCandidateShiftLine(candidate.fromShiftDay),
    [candidate.fromShiftDay]
  );
  return (
    <button
      type="button"
      onClick={() => onSelect(candidate.swapRequestId)}
      className={`mb-2 flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors duration-150 ease-out last:mb-0 ${
        selected
          ? 'border-blue-500 bg-blue-50/60'
          : 'border-gray-200 hover:bg-gray-50'
      }`}
    >
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--app-primary,#0d9488)] text-sm font-semibold text-white">
        {candidate.initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-gray-900">{candidate.displayName}</div>
        <div className="text-xs text-gray-600">{timeLine}</div>
      </div>
      <Badge
        variant="outline"
        className="flex-shrink-0 border-emerald-200 bg-emerald-50 text-emerald-800"
      >
        Open
      </Badge>
    </button>
  );
});

const GiveawaySeekerListRow = memo(function GiveawaySeekerListRow({
  seeker,
  selected,
  onSelect,
}: {
  seeker: PickupInterestSeekerRow;
  selected: boolean;
  /** One row per `pickup_interest` doc; use full row so selection is unique per day. */
  onSelect: (seeker: PickupInterestSeekerRow) => void;
}) {
  const interestUs = useMemo(
    () => formatYmdUs(seeker.interestShiftDate),
    [seeker.interestShiftDate]
  );
  const relative = useMemo(
    () => formatRelativeRequested(seeker.submittedAt),
    [seeker.submittedAt]
  );
  const avatarBg = useMemo(
    () => ({ backgroundColor: avatarHueForId(seeker.employeeId) }),
    [seeker.employeeId]
  );
  return (
    <button
      type="button"
      onClick={() => onSelect(seeker)}
      className={`mb-2 flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors duration-150 ease-out last:mb-0 ${
        selected
          ? 'border-blue-500 bg-blue-50/60'
          : 'border-gray-200 hover:bg-gray-50'
      }`}
    >
      <div
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
        style={avatarBg}
      >
        {seeker.initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-gray-900">{seeker.displayName}</div>
        <div className="text-xs text-gray-600">
          Preference:{' '}
          {seeker.preferenceNote || 'Any shift · extra work'}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          Interested in {interestUs} · {relative}
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
});

const PickupOpportunityListRow = memo(function PickupOpportunityListRow({
  row,
  title,
  selected,
  onSelect,
}: {
  row: PickupOpportunityRow;
  title: string;
  selected: boolean;
  onSelect: (shiftDate: string) => void;
}) {
  const timeLine = useMemo(
    () => formatCandidateShiftLine(row.shiftDay),
    [row.shiftDay]
  );
  const weekday = useMemo(
    () => shortWeekdayLabel(row.shiftDate),
    [row.shiftDate]
  );
  const disabled =
    row.viewerAlreadyAssigned ||
    Boolean(row.viewerPickedUp) ||
    row.viewerScheduleOverlap;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!disabled) onSelect(row.shiftDate);
      }}
      className={`mb-2 flex w-full items-start gap-3 rounded-xl border p-4 text-left shadow-sm transition-colors duration-150 ease-out last:mb-0 ${
        disabled
          ? 'cursor-not-allowed border-gray-100 bg-gray-50/80 opacity-95'
          : selected
            ? 'border-blue-500 bg-blue-50/60'
            : 'border-gray-200 hover:bg-gray-50'
      }`}
    >
      <div className="flex h-12 w-12 flex-shrink-0 flex-col items-center justify-center rounded-lg bg-sky-600 text-center text-xs font-bold leading-tight text-white">
        <span>{weekday}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-gray-900">{title}</span>
          {row.viewerAlreadyAssigned && (
            <Badge
              variant="outline"
              className="border-slate-300 bg-slate-50 text-[10px] uppercase text-slate-700"
            >
              Your shift
            </Badge>
          )}
          {row.viewerPickedUp && (
            <Badge
              variant="outline"
              className="border-violet-300 bg-violet-50 text-[10px] uppercase text-violet-800"
            >
              Picked up
            </Badge>
          )}
          {row.viewerScheduleOverlap && (
            <Badge
              variant="outline"
              className="border-rose-300 bg-rose-50 text-[10px] uppercase text-rose-900"
            >
              Overlaps your shift
            </Badge>
          )}
          {row.availableNow && (
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-50 text-[10px] uppercase text-amber-900"
            >
              Available now
            </Badge>
          )}
        </div>
        <div className="mt-0.5 text-xs text-gray-600">{timeLine}</div>
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
});

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
  const giveawayRecipientName = coworkerDisplayNameFromJob(
    job,
    request.type === 'giveaway' ? request.toEmployeeId : null
  );

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
          <div className="space-y-2 border-t border-gray-200 pt-3 text-gray-700">
            {request.toEmployeeId ? (
              <p>
                {giveawayRecipientName ? (
                  <>
                    You are offering this shift-day to{' '}
                    <span className="font-semibold text-gray-900">
                      {giveawayRecipientName}
                    </span>
                    . Admin must approve before the schedule changes.
                  </>
                ) : (
                  <>
                    You are offering this shift-day to a specific coworker. Admin must approve
                    before the schedule changes.
                  </>
                )}
              </p>
            ) : request.acceptAny ? (
              <p>
                Open offer — any eligible coworker on this job/shift can ask to take this shift-day.
                Admin must approve before the schedule changes.
              </p>
            ) : (
              <p>
                You are offering this shift-day for someone else to take. Admin must approve before
                the schedule changes.
              </p>
            )}
            {request.toShiftDate && (
              <p className="text-xs text-muted-foreground">
                Their pickup interest was tagged for {formatYmdUs(request.toShiftDate)}.
              </p>
            )}
          </div>
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
  const [giveawaySelection, setGiveawaySelection] = useState<{
    swapRequestId: string;
    employeeId: string;
    /** YYYY-MM-DD — day the seeker tagged in their pickup interest (not the giver’s shift-day). */
    interestShiftDate: string;
  } | null>(null);
  /** Open giveaway: any eligible coworker may claim (pending admin), no named seeker. */
  const [giveawayAcceptAny, setGiveawayAcceptAny] = useState(false);
  const [pickupSelectedDate, setPickupSelectedDate] = useState<string | null>(
    null
  );
  /** `null` = use full schedule week for willing-swap list; set to YYYY-MM-DD to filter peers by that offered day only. */
  const [willingPeerDayFilter, setWillingPeerDayFilter] = useState<
    string | null
  >(null);
  /** Debounced for API only — avoids a network request on every calendar keystroke. */
  const [debouncedWillingPeerDay, setDebouncedWillingPeerDay] = useState<
    string | null
  >(null);
  const [notes, setNotes] = useState('');

  const queryClient = useQueryClient();
  const jobSlug = shiftInfo?.jobSlug ?? '';
  const shiftSlug = shiftInfo?.shiftSlug ?? '';
  const listRangeStart = pickupListDateRange?.startDate ?? '';
  const listRangeEnd = pickupListDateRange?.endDate ?? '';
  const hasListDateRange = Boolean(listRangeStart && listRangeEnd);
  const willingQueryStart = debouncedWillingPeerDay ?? listRangeStart;
  const willingQueryEnd = debouncedWillingPeerDay ?? listRangeEnd;

  useEffect(() => {
    if (willingPeerDayFilter == null) {
      setDebouncedWillingPeerDay(null);
      return;
    }
    const id = window.setTimeout(() => {
      setDebouncedWillingPeerDay(willingPeerDayFilter);
    }, 280);
    return () => window.clearTimeout(id);
  }, [willingPeerDayFilter]);
  const giveawaySeekersDay = shiftInfo?.fromShiftDate?.trim() ?? '';
  const hasGiveawaySeekersDay = Boolean(giveawaySeekersDay);

  const minSwapLeadHours = useMemo(() => {
    const n = Number(contextJob?.additionalConfig?.swapBeforeHours);
    return Number.isFinite(n) && n >= 0 ? n : 48;
  }, [contextJob]);

  /** Any future day up to ~1y; min is first day that satisfies advance-notice when job schedule is known. */
  const willingDayPickerMaxYmd = addCalendarDaysToYmd(todayYmdLocal(), 365);
  const willingDayPickerMinYmd = useMemo(() => {
    const today = todayYmdLocal();
    if (!contextJob || !shiftSlug) return today;
    return (
      firstForwardYmdMeetingSwapLead(
        contextJob,
        shiftSlug,
        minSwapLeadHours,
        today,
        365
      ) ?? today
    );
  }, [contextJob, shiftSlug, minSwapLeadHours]);

  const canFilterWillingByEligibleDay = useMemo(() => {
    if (!hasListDateRange) return false;
    if (!contextJob || !shiftSlug) return true;
    const today = todayYmdLocal();
    return (
      firstForwardYmdMeetingSwapLead(
        contextJob,
        shiftSlug,
        minSwapLeadHours,
        today,
        365
      ) != null
    );
  }, [hasListDateRange, contextJob, shiftSlug, minSwapLeadHours]);

  useEffect(() => {
    if (!isOpen || existingRequest || !jobSlug || !shiftSlug) {
      return;
    }
    if (!hasListDateRange && !hasGiveawaySeekersDay) {
      return;
    }
    void prefetchShiftSwapModalLists(queryClient, {
      jobSlug,
      shiftSlug,
      ...(hasListDateRange
        ? { weekStart: listRangeStart, weekEnd: listRangeEnd }
        : {}),
      ...(hasGiveawaySeekersDay
        ? { pickupSeekersInterestDate: giveawaySeekersDay }
        : {}),
    });
  }, [
    isOpen,
    existingRequest,
    jobSlug,
    shiftSlug,
    hasListDateRange,
    hasGiveawaySeekersDay,
    giveawaySeekersDay,
    listRangeStart,
    listRangeEnd,
    queryClient,
  ]);

  const willingQuery = useWillingSwapCandidatesQuery({
    jobSlug,
    shiftSlug,
    page: willingPage,
    startDate: willingQueryStart,
    endDate: willingQueryEnd,
    enabled:
      isOpen &&
      mode === 'swap' &&
      Boolean(jobSlug && shiftSlug && hasListDateRange) &&
      !existingRequest,
  });

  const seekersQuery = usePickupInterestSeekersQuery({
    jobSlug,
    shiftSlug,
    page: seekersPage,
    interestShiftDate: giveawaySeekersDay,
    enabled:
      isOpen &&
      mode === 'giveaway' &&
      Boolean(jobSlug && shiftSlug && hasGiveawaySeekersDay) &&
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
      setGiveawaySelection(null);
      setGiveawayAcceptAny(false);
      setPickupSelectedDate(null);
      setWillingPeerDayFilter(null);
      setDebouncedWillingPeerDay(null);
      setNotes('');
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedSwapRequestId(null);
    setWillingPage(1);
    setSeekersPage(1);
    setGiveawaySelection(null);
    setGiveawayAcceptAny(false);
    setPickupSelectedDate(null);
    setWillingPeerDayFilter(null);
    setDebouncedWillingPeerDay(null);
  }, [mode, jobSlug, shiftSlug, listRangeStart, listRangeEnd, giveawaySeekersDay]);

  useEffect(() => {
    if (acceptAny) setSelectedSwapRequestId(null);
  }, [acceptAny]);

  useEffect(() => {
    setSelectedSwapRequestId(null);
    setWillingPage(1);
  }, [willingPeerDayFilter]);

  useEffect(() => {
    if (!willingPeerDayFilter) return;
    const today = todayYmdLocal();
    const maxY = addCalendarDaysToYmd(today, 365);
    if (willingPeerDayFilter < today || willingPeerDayFilter > maxY) {
      setWillingPeerDayFilter(null);
      return;
    }
    if (contextJob && shiftSlug) {
      if (
        !shiftDayMeetsSwapLead(
          contextJob,
          shiftSlug,
          willingPeerDayFilter,
          minSwapLeadHours
        )
      ) {
        setWillingPeerDayFilter(null);
      }
    }
  }, [willingPeerDayFilter, contextJob, shiftSlug, minSwapLeadHours]);

  /** Drop pickup selection if that day is no longer selectable (e.g. already picked up). */
  useEffect(() => {
    if (mode !== 'pickup_interest' || !pickupSelectedDate) return;
    const items = opportunitiesQuery.data?.items;
    if (!items?.length) return;
    const row = items.find((r) => r.shiftDate === pickupSelectedDate);
    if (
      row &&
      (row.viewerPickedUp ||
        row.viewerAlreadyAssigned ||
        row.viewerScheduleOverlap)
    ) {
      setPickupSelectedDate(null);
    }
  }, [mode, pickupSelectedDate, opportunitiesQuery.data?.items]);

  const handleSelectWilling = useCallback((swapRequestId: string) => {
    setSelectedSwapRequestId(swapRequestId);
  }, []);

  const handleSelectGiveawaySeeker = useCallback(
    (seeker: PickupInterestSeekerRow) => {
      setGiveawayAcceptAny(false);
      setGiveawaySelection({
        swapRequestId: seeker.swapRequestId,
        employeeId: seeker.employeeId,
        interestShiftDate: seeker.interestShiftDate,
      });
    },
    []
  );

  const handleSelectPickupDate = useCallback((shiftDate: string) => {
    setPickupSelectedDate(shiftDate);
  }, []);

  const opportunityDefaultTitle = useMemo(
    () => shiftLabel(contextJob, shiftSlug) || 'Shift',
    [contextJob, shiftSlug]
  );

  const pickupOpportunityRows = useMemo(() => {
    const items = opportunitiesQuery.data?.items;
    if (!items?.length) return null;
    return items.map((row) => {
      const rowDisabled =
        row.viewerAlreadyAssigned ||
        Boolean(row.viewerPickedUp) ||
        row.viewerScheduleOverlap;
      return (
        <PickupOpportunityListRow
          key={row.shiftDate}
          row={row}
          title={row.shiftName || opportunityDefaultTitle}
          selected={
            !rowDisabled && pickupSelectedDate === row.shiftDate
          }
          onSelect={handleSelectPickupDate}
        />
      );
    });
  }, [
    opportunitiesQuery.data?.items,
    opportunityDefaultTitle,
    pickupSelectedDate,
    handleSelectPickupDate,
  ]);

  const willingSwapRows = useMemo(() => {
    const items = willingQuery.data?.items;
    if (!items?.length) return null;
    return items.map((c) => (
      <WillingSwapListRow
        key={c.swapRequestId}
        candidate={c}
        selected={selectedSwapRequestId === c.swapRequestId}
        onSelect={handleSelectWilling}
      />
    ));
  }, [willingQuery.data?.items, selectedSwapRequestId, handleSelectWilling]);

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
      if (giveawayAcceptAny) {
        return Boolean(hasGiveawaySeekersDay);
      }
      return Boolean(giveawaySelection?.employeeId);
    }
    if (mode === 'pickup_interest') {
      if (!pickupSelectedDate) return false;
      const row = opportunitiesQuery.data?.items?.find(
        (r) => r.shiftDate === pickupSelectedDate
      );
      return Boolean(
        row &&
          !row.viewerAlreadyAssigned &&
          !row.viewerPickedUp &&
          !row.viewerScheduleOverlap
      );
    }
    return false;
  }, [
    mode,
    acceptAny,
    selectedCandidate,
    shiftInfo?.fromShiftDate,
    onAcceptPeerSwap,
    giveawaySelection,
    giveawayAcceptAny,
    hasGiveawaySeekersDay,
    pickupSelectedDate,
    opportunitiesQuery.data?.items,
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
      if (giveawayAcceptAny) {
        if (!hasGiveawaySeekersDay) return;
        onSubmit({
          type: 'giveaway',
          acceptAny: true,
          toEmployeeId: null,
          toShiftSlug: null,
          toShiftDate: null,
          notes: notes.trim() || undefined,
        });
        return;
      }
      if (!giveawaySelection?.employeeId) return;
      const interestYmd = giveawaySelection.interestShiftDate?.trim() || null;
      onSubmit({
        type: 'giveaway',
        toEmployeeId: giveawaySelection.employeeId,
        toShiftSlug: shiftInfo?.shiftSlug?.trim() || null,
        toShiftDate: interestYmd,
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
    if (opp.viewerPickedUp) return;
    if (opp.viewerScheduleOverlap) return;

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

  const willingBlockingLoad =
    willingQuery.isFetching && willingQuery.data == null;
  const willingSoftRefresh =
    willingQuery.isFetching && willingQuery.data != null;

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
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="flex-shrink-0 bg-appPrimary text-white px-6 py-4 rounded-t-lg">
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
        <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-6 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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

        <div className="space-y-4">
          {mode === 'swap' && (
            <>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Select a shift-day from another employee who is willing to swap.
                Or check <strong>Accept any available</strong> to match with the
                first employee who agrees.
              </p>
              {!hasListDateRange ? (
                <p className="text-sm text-amber-800 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  Swap list uses the same week as the Employee Shifts table. Open
                  this modal from the schedule when a date range is visible.
                </p>
              ) : (
                <div className="space-y-3 rounded-xl border border-gray-100 bg-gradient-to-b from-slate-50/90 to-white p-4 shadow-sm">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {willingPeerDayFilter ? (
                      <>
                        Showing coworkers whose <strong>offered</strong>{' '}
                        shift-day is{' '}
                        <strong>{formatYmdUs(willingPeerDayFilter)}</strong>. That
                        day must be at least{' '}
                        <strong>{minSwapLeadHours} hours</strong> before the
                        shift starts (job advance-notice).
                      </>
                    ) : (
                      <>
                        By default, willing swaps are listed for the peer&apos;s
                        offered day within your table week{' '}
                        <strong>
                          {formatYmdUs(listRangeStart)} –{' '}
                          {formatYmdUs(listRangeEnd)}
                        </strong>
                        . Use the optional date filter to narrow to{' '}
                        <strong>any future day</strong> (up to one year ahead)
                        where this shift starts at least{' '}
                        <strong>{minSwapLeadHours} hours</strong> from now — same
                        rule as &quot;Pick Up&quot; opportunities.
                      </>
                    )}
                  </p>
                  {contextJob && shiftSlug && !canFilterWillingByEligibleDay ? (
                    <p className="text-xs text-amber-800 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2">
                      No upcoming day in the next year meets the advance-notice
                      rule ({minSwapLeadHours}h before shift start) for this
                      shift. You can still browse the default week list, or try
                      again later.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                    <div className="flex min-w-[200px] flex-col gap-1.5">
                      <span className="text-xs font-medium text-gray-700">
                        Peer&apos;s offered day{' '}
                        <span className="font-normal text-muted-foreground">
                          (optional)
                        </span>
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="date"
                          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm transition-shadow focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                          min={
                            contextJob && shiftSlug
                              ? willingDayPickerMinYmd
                              : todayYmdLocal()
                          }
                          max={willingDayPickerMaxYmd}
                          value={willingPeerDayFilter ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (!v.length) {
                              setWillingPeerDayFilter(null);
                              return;
                            }
                            const today = todayYmdLocal();
                            if (v < today) {
                              toast.info('Pick a date from today onward.');
                              return;
                            }
                            if (v > willingDayPickerMaxYmd) {
                              toast.info(
                                'Pick a date within the next year from today.'
                              );
                              return;
                            }
                            if (contextJob && shiftSlug) {
                              if (
                                !shiftDayMeetsSwapLead(
                                  contextJob,
                                  shiftSlug,
                                  v,
                                  minSwapLeadHours
                                )
                              ) {
                                toast.info(
                                  `That shift-day is within the advance-notice window. Choose a day whose shift starts at least ${minSwapLeadHours} hours from now.`
                                );
                                return;
                              }
                            }
                            setWillingPeerDayFilter(v);
                          }}
                          disabled={
                            loading ||
                            (Boolean(contextJob && shiftSlug) &&
                              !canFilterWillingByEligibleDay)
                          }
                          aria-label="Filter willing swaps by peer offered day"
                        />
                        {willingPeerDayFilter ? (
                          <button
                            type="button"
                            className="text-sm font-medium text-sky-700 underline-offset-2 hover:underline"
                            onClick={() => setWillingPeerDayFilter(null)}
                          >
                            Clear
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <label
                className={`mt-1 flex cursor-pointer flex-col gap-1.5 rounded-xl border p-4 text-sm transition-colors ${
                  acceptAny ? 'border-sky-300 bg-sky-50/60' : 'border-gray-200 bg-white'
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

              {!acceptAny && hasListDateRange && (
                <>
                  <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-2">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                      Employees willing to swap
                    </h3>
                    {willingQuery.data != null && (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium tabular-nums text-slate-700">
                        {willingQuery.data.total}{' '}
                        {willingQuery.data.total === 1 ? 'person' : 'people'}
                      </span>
                    )}
                  </div>

                  <div
                    className={`${SWAP_MODAL_LIST_SCROLL} relative ${willingBlockingLoad ? 'min-h-[120px]' : ''}`}
                  >
                    {willingBlockingLoad && (
                      <div
                        className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[10px] bg-white/90 px-4"
                        aria-live="polite"
                        aria-busy="true"
                      >
                        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                        <p className="text-center text-sm text-muted-foreground">
                          Loading coworkers…
                        </p>
                      </div>
                    )}
                    {willingSoftRefresh && (
                      <div
                        className="pointer-events-none absolute inset-x-0 top-1 z-[5] flex justify-center"
                        aria-hidden
                      >
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200/80 bg-white/95 px-2.5 py-0.5 text-[11px] font-medium text-sky-800 shadow-sm">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Updating list…
                        </span>
                      </div>
                    )}
                    {willingQuery.isError && !willingQuery.isFetching && (
                      <div className="p-4 text-sm text-red-600">
                        Could not load the list. Try again.
                      </div>
                    )}
                    {willingQuery.data &&
                      willingQuery.data.items.length === 0 &&
                      !willingQuery.isFetching && (
                        <div className="p-4 text-sm leading-relaxed text-muted-foreground">
                          No open swap offers from coworkers yet. Turn on{' '}
                          <strong>Accept any available</strong> or try again
                          later.
                        </div>
                      )}
                    {!willingBlockingLoad && (
                      <div
                        className={
                          willingSoftRefresh ? 'opacity-[0.65] transition-opacity' : undefined
                        }
                      >
                        {willingSwapRows}
                      </div>
                    )}
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
                Select a coworker who tagged pickup interest for this day, or
                check <strong>Offer to any eligible employee</strong> so anyone
                on this job/shift can request your shift (pickup list will show
                it as available). Admin approval still required.
              </p>
              {!hasGiveawaySeekersDay ? (
                <p className="text-sm text-amber-800 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  Open this modal from a shift row on the schedule so we know
                  which day you are offering — only coworkers who tagged pickup
                  interest for that same calendar day are listed.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Showing coworkers who tagged pickup interest for{' '}
                  <strong>{formatYmdUs(giveawaySeekersDay)}</strong> only (same
                  day as this shift).
                </p>
              )}
              {!hasGiveawaySeekersDay ? null : (
              <label
                className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-4 text-sm ${
                  giveawayAcceptAny
                    ? 'border-blue-400 bg-blue-50/50'
                    : 'border-gray-200'
                }`}
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={giveawayAcceptAny}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setGiveawayAcceptAny(on);
                      if (on) setGiveawaySelection(null);
                    }}
                    disabled={loading}
                  />
                  Offer to any eligible employee
                </span>
                <span className="pl-6 text-xs text-muted-foreground">
                  No need to pick someone from the list — coworkers will see
                  this day as <strong>Available now</strong> on the Pick Up tab
                  and can request it.
                </span>
              </label>
              )}
              {!hasGiveawaySeekersDay ? null : (
              <div className={SWAP_MODAL_LIST_SCROLL}>
                {giveawayAcceptAny ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    Coworker list isn&apos;t needed for an open offer. Submit to
                    post this shift-day for others to pick up.
                  </div>
                ) : (
                  <>
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
                          No coworkers have tagged pickup interest for this
                          shift-day yet. You can still use{' '}
                          <strong>Offer to any eligible employee</strong> above.
                        </div>
                      )}
                    {seekersQuery.data?.items.map((s) => (
                      <GiveawaySeekerListRow
                        key={s.swapRequestId}
                        seeker={s}
                        selected={
                          giveawaySelection?.swapRequestId === s.swapRequestId
                        }
                        onSelect={handleSelectGiveawaySeeker}
                      />
                    ))}
                  </>
                )}
              </div>
              )}
              {hasGiveawaySeekersDay &&
                !giveawayAcceptAny &&
                seekersQuery.data &&
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
              <p className="text-sm leading-relaxed text-muted-foreground">
                Tag shift-days or events you&apos;re interested in taking on.{' '}
                <Zap className="inline h-3.5 w-3.5 text-amber-500 align-[-2px]" />{' '}
                <strong>Available now</strong> means someone has already offered
                that slot — the exchange can be completed right here. Days where
                you already work another overlapping shift on the same calendar
                day can&apos;t be selected.
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
                    <p className="mt-1 text-xs text-muted-foreground">
                      Days shown match your schedule week{' '}
                      <strong>
                        {formatYmdUs(pickupListDateRange.startDate)} –{' '}
                        {formatYmdUs(pickupListDateRange.endDate)}
                      </strong>
                      .
                    </p>
                  </div>
                  <div className={SWAP_MODAL_PICKUP_SCROLL}>
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
                    {pickupOpportunityRows}
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

        </div>

        <DialogFooter className="flex-shrink-0 gap-2 border-t bg-gray-50 px-6 py-4 rounded-b-lg">
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
