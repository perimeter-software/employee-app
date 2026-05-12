'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  MapPin,
  Building2,
  ChevronLeft,
  Paperclip,
  Mail,
  Clock,
  Navigation,
  CheckCircle2,
  Plus,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import {
  EventApiService,
  eventQueryKeys,
  invalidateEventListCaches,
} from '../../services/event-service';
import type { GignologyEvent, EventPosition } from '../../types';
import type {
  EnrollmentCheckResult,
  EnrollmentType,
  ShowClockInResult,
} from '../../services/event-service';
import { VenueMap } from '@/domains/venue/components/VenueMap';
import { VenueVideo } from '@/domains/venue/components/VenueVideo';
import { baseInstance } from '@/lib/api/instance';
import {
  EventCoverRequestModal,
  type EventCoverModalIntent,
} from '@/domains/event/components/EventCoverRequestModal/EventCoverRequestModal';
import { EventCallOffConfirmModal } from '@/domains/event/components/EventCallOffConfirmModal/EventCallOffConfirmModal';
import { isEventCoverWindowOpen } from '@/domains/event/utils/event-cover-window';
import { useEventClockIn, useEventClockOut } from '@/domains/event/hooks';
import { useCurrentUser } from '@/domains/user';
import { clsxm } from '@/lib/utils';

// ── Clock state ───────────────────────────────────────────────────────────────

type ClockState = ShowClockInResult & {
  clockInTime?: string;
  clockOutTime?: string;
};

const formatDisplayTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

function formatWorkedTime(timeIn: string, timeOut: string): string {
  const ms = new Date(timeOut).getTime() - new Date(timeIn).getTime();
  const totalMinutes = Math.round(ms / (1000 * 60));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.round((ms / (1000 * 60 * 60)) * 10) / 10;
  return `${hours} hrs`;
}

function buildGoogleCalendarUrl(event: GignologyEvent): string {
  const start = new Date(event.eventDate);
  const end = event.eventEndTime
    ? new Date(event.eventEndTime)
    : new Date(start.getTime() + 4 * 60 * 60 * 1000);
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const location = [event.venueName, event.venueCity, event.venueState]
    .filter(Boolean)
    .join(', ');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.eventName,
    dates: `${fmt(start)}/${fmt(end)}`,
    ...(location && { location }),
  });
  return `https://www.google.com/calendar/render?${params}`;
}

// ── Misc helpers ─────────────────────────────────────────────────────────────

const DEFAULT_POSITION = 'Event Staff';

function stripHtml(html?: string): string {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

function formatEventDate(
  dateStr: string | undefined,
  timeZone: string | undefined,
  options: Intl.DateTimeFormatOptions
): string {
  if (!dateStr) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone ?? undefined,
      ...options,
    }).format(new Date(dateStr));
  } catch {
    return new Date(dateStr).toLocaleString();
  }
}

function getDateChip(eventDate?: string, timezone?: string) {
  if (!eventDate) return null;
  const event = new Date(eventDate);
  if (Number.isNaN(event.getTime())) return null;
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone ?? undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  const eventKey = dayKey(event);
  const todayKey = dayKey(new Date());
  if (eventKey === todayKey)
    return { label: 'TODAY', classes: 'bg-emerald-500 text-white' };
  if (event.getTime() > Date.now())
    return { label: 'UPCOMING', classes: 'bg-sky-500 text-white' };
  return { label: 'PAST', classes: 'bg-zinc-500 text-white' };
}

function getAvailablePositions(
  positions: EventPosition[] | undefined,
  existingApplicants: GignologyEvent['applicants']
): { label: string; value: string }[] {
  if (!positions?.length) return [];
  const filtered = positions.filter((pos) => {
    if (!pos.makePublic) return false;
    if (pos.numberPositions == null) return true;
    const assigned = (existingApplicants ?? []).filter(
      (a) => a.status === 'Roster' && a.primaryPosition === pos.positionName
    ).length;
    return assigned < Number(pos.numberPositions);
  });
  const hasEventStaff = filtered.some(
    (p) => p.positionName === DEFAULT_POSITION
  );
  const items = filtered.map((p) => ({
    label: p.positionName,
    value: p.positionName,
  }));
  if (!hasEventStaff)
    return [{ label: DEFAULT_POSITION, value: DEFAULT_POSITION }, ...items];
  return items;
}

// ── Enrollment action section ─────────────────────────────────────────────────

type ActionSectionProps = {
  enrollment: EnrollmentCheckResult;
  onAction: (requestType: EnrollmentType, positionName?: string) => Promise<void>;
  submitting: boolean;
  selectedPosition: string;
};

function ActionSection({
  enrollment,
  onAction,
  submitting,
  selectedPosition,
}: ActionSectionProps) {
  const { type, allowed, message, status } = enrollment;

  if (type === 'Roster') {
    if (allowed === 'Roster' && status === 'Warning') {
      return (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          {message}
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-center py-2 px-4 rounded-md bg-emerald-50 border border-emerald-200">
          <span className="text-sm font-medium text-emerald-700">
            You are on the roster
          </span>
        </div>
        <Button
          variant="outline-danger"
          fullWidth
          size="sm"
          loading={submitting}
          onClick={() => onAction('Not Roster')}
        >
          Remove myself from this event
        </Button>
      </div>
    );
  }

  if (type === 'Waitlist') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-center py-2 px-4 rounded-md bg-amber-50 border border-amber-200">
          <span className="text-sm font-medium text-amber-700">
            You are on the waitlist
          </span>
        </div>
        <Button
          variant="outline-danger"
          fullWidth
          size="sm"
          loading={submitting}
          onClick={() => onAction('Not Roster')}
        >
          Remove myself from waitlist
        </Button>
      </div>
    );
  }

  if (type === 'Request') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-center py-2 px-4 rounded-md bg-blue-50 border border-blue-200">
          <span className="text-sm font-medium text-blue-700">
            You have requested this event
          </span>
        </div>
        <Button
          variant="outline-danger"
          fullWidth
          size="sm"
          loading={submitting}
          onClick={() => onAction('Not Roster')}
        >
          Cancel request
        </Button>
      </div>
    );
  }

  if (allowed === 'Roster') {
    return (
      <div className="space-y-3">
        <Button
          variant="success"
          fullWidth
          loading={submitting}
          onClick={() => onAction('Roster', selectedPosition)}
        >
          Register for Event
        </Button>
      </div>
    );
  }

  if (allowed === 'Waitlist') {
    return (
      <Button
        variant="primary"
        fullWidth
        loading={submitting}
        onClick={() => onAction('Waitlist')}
        className="bg-amber-500 hover:bg-amber-600"
      >
        Add me to Waitlist
      </Button>
    );
  }

  if (allowed === 'Request') {
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-500 text-center">{message}</p>
        <Button
          variant="secondary"
          fullWidth
          loading={submitting}
          onClick={() => onAction('Request')}
        >
          Request this Event
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-2 px-4 rounded-md bg-zinc-100 border border-zinc-200">
      <span className="text-sm font-medium text-zinc-500">{message}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  event: GignologyEvent;
  imageBaseUrl?: string;
  onClose: () => void;
  onEnrollmentChange?: (eventId: string, newType: string) => void;
};

export const EventDetailView = ({
  event: initialEvent,
  imageBaseUrl,
  onClose,
  onEnrollmentChange,
}: Props) => {
  const { data: currentUser } = useCurrentUser();
  const queryClient = useQueryClient();

  const applicantId = currentUser?.applicantId ?? '';
  const userId = currentUser?._id ?? '';
  const agentName =
    [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ') ||
    currentUser?.email ||
    '';

  const [descExpanded, setDescExpanded] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [bannerError, setBannerError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [coverModalOpen, setCoverModalOpen] = useState(false);
  const [callOffConfirmOpen, setCallOffConfirmOpen] = useState(false);
  const [callOffSubmitting, setCallOffSubmitting] = useState(false);
  const [coverIntent, setCoverIntent] =
    useState<EventCoverModalIntent>('invite-cover');
  const [selectedPosition, setSelectedPosition] = useState(DEFAULT_POSITION);

  useEffect(() => {
    setDescExpanded(false);
    setLogoError(false);
    setBannerError(false);
    setSelectedPosition(DEFAULT_POSITION);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [initialEvent._id]);

  const clockInMutation = useEventClockIn();
  const clockOutMutation = useEventClockOut();
  const isMutating = clockInMutation.isPending || clockOutMutation.isPending;

  // ── Data fetching ─────────────────────────────────────────────────────────

  const { data: venueDetail } = useQuery({
    queryKey: ['venue-detail', initialEvent.venueSlug],
    queryFn: async () => {
      const res = await baseInstance.get<{
        bannerUrl?: string;
        logoUrl?: string;
        venueContact1?: {
          fullName?: string;
          firstName?: string;
          lastName?: string;
          email?: string;
        };
        location?: { coordinates?: [number, number] };
        videoUrls?: string[];
      }>(`venues/${initialEvent.venueSlug}`);
      if (!res.success || !res.data) throw new Error('Failed to fetch venue');
      return res.data;
    },
    enabled: !!initialEvent.venueSlug,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: eventDetail } = useQuery({
    queryKey: eventQueryKeys.detail(initialEvent._id),
    queryFn: () => EventApiService.fetchEventDetail(initialEvent._id),
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const {
    data: enrollment,
    isLoading: enrollmentLoading,
    refetch: refetchEnrollment,
  } = useQuery({
    queryKey: eventQueryKeys.enrollment(initialEvent._id),
    queryFn: () => EventApiService.checkEnrollment(initialEvent._id),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  const event: GignologyEvent = eventDetail
    ? { ...initialEvent, ...eventDetail }
    : initialEvent;

  // ── Derived values ────────────────────────────────────────────────────────

  const logoFilename = event.logoUrl || venueDetail?.logoUrl;
  const fullLogoUrl =
    logoFilename && !logoError
      ? logoFilename.startsWith('http')
        ? logoFilename
        : `${imageBaseUrl}/${event.venueSlug}/venues/logo/${logoFilename}`
      : null;

  const bannerUrl =
    imageBaseUrl && venueDetail?.bannerUrl && !bannerError
      ? `${imageBaseUrl}/${initialEvent.venueSlug}/venues/banner/${venueDetail.bannerUrl}`
      : null;

  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };
  const dateChip = getDateChip(event.eventDate, event.timeZone);
  const formattedShortDate = formatEventDate(event.eventDate, event.timeZone, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const startTime = formatEventDate(event.eventDate, event.timeZone, timeOpts);
  const endTime = event.eventEndTime
    ? formatEventDate(event.eventEndTime, event.timeZone, timeOpts)
    : null;
  const reportTimeTBD = event.reportTimeTBD?.trim();
  const timeDisplay = reportTimeTBD
    ? `Time TBD: ${reportTimeTBD}`
    : endTime
      ? `${startTime} – ${endTime}`
      : startTime;
  const location = [event.venueCity, event.venueState].filter(Boolean).join(', ');

  const description = stripHtml(event.description);
  const DESCRIPTION_LIMIT = 400;
  const descTooLong = description.length > DESCRIPTION_LIMIT;

  // Applicant entry from event detail (position, reportTime, timeIn, timeOut)
  const applicantEntry = useMemo(
    () =>
      event.applicants?.find(
        (a) => a.id === applicantId && a.status === 'Roster'
      ),
    [event.applicants, applicantId]
  );

  const userPosition = applicantEntry?.primaryPosition ?? DEFAULT_POSITION;
  const isOnRoster = !!applicantEntry || enrollment?.type === 'Roster';

  const availablePositions = useMemo(
    () => getAvailablePositions(event.positions, event.applicants),
    [event.positions, event.applicants]
  );
  const isPositionLocked =
    isOnRoster ||
    enrollment?.type === 'Waitlist' ||
    enrollment?.type === 'Request';
  const showPositionPicker =
    !isPositionLocked &&
    enrollment?.allowed === 'Roster' &&
    availablePositions.length > 1;

  // Mirror mobile app's isWithin6Hours: only show clock UI (and call the server)
  // when current time is within [reportTime - 6h, eventEndTime + 6.5h].
  const { isWithinClockWindow, isClockWindowPassed } = useMemo(() => {
    const reportTimeIso = applicantEntry?.reportTime ?? event.eventDate;
    const endTimeIso = event.eventEndTime ?? reportTimeIso;
    const now = Date.now();
    const windowStart = new Date(reportTimeIso).getTime() - 6 * 60 * 60 * 1000;
    const windowEnd = new Date(endTimeIso).getTime() + 6.5 * 60 * 60 * 1000;
    return {
      isWithinClockWindow: now >= windowStart && now <= windowEnd,
      isClockWindowPassed: now > windowEnd,
    };
  }, [applicantEntry?.reportTime, event.eventDate, event.eventEndTime]);

  // Server-driven clock state — same pattern as the mobile app's getClockedDetails
  const {
    data: serverClockState,
    refetch: refetchClockState,
    isFetching: isClockStateFetching,
  } = useQuery({
    queryKey: eventQueryKeys.showClockIn(initialEvent._id, applicantId),
    queryFn: () =>
      EventApiService.getShowClockIn(initialEvent._id, agentName, String(userId)),
    enabled: isOnRoster && !!applicantId && isWithinClockWindow,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  const clockState: ClockState = useMemo(() => {
    // Prefer applicantEntry timestamps (from event detail) for display; fall back
    // to server-provided ISO strings (returned by showclockin when clocked in).
    const rawTimeIn = applicantEntry?.timeIn ?? serverClockState?.clockInTime;
    const rawTimeOut = applicantEntry?.timeOut ?? serverClockState?.clockOutTime;
    const clockInTime = rawTimeIn ? formatDisplayTime(rawTimeIn) : undefined;
    const clockOutTime = rawTimeOut ? formatDisplayTime(rawTimeOut) : undefined;

    if (serverClockState) {
      return { ...serverClockState, clockInTime, clockOutTime };
    }
    // Fallback while server state loads: derive from local timestamps
    return {
      showClockIn: !rawTimeIn,
      showClockOut: !!rawTimeIn && !rawTimeOut,
      clockInButtonDisabled: true,
      clockOutButtonDisabled: true,
      showEarlyClockInWarning: false,
      clockInTime,
      clockOutTime,
    };
  }, [serverClockState, applicantEntry]);

  const rawTimeInForCalc = applicantEntry?.timeIn ?? serverClockState?.clockInTime;
  const rawTimeOutForCalc = applicantEntry?.timeOut ?? serverClockState?.clockOutTime;
  const workedHours =
    rawTimeInForCalc && rawTimeOutForCalc
      ? formatWorkedTime(rawTimeInForCalc, rawTimeOutForCalc)
      : null;
  const isClockBusy = isMutating || isClockStateFetching;
  const googleCalendarUrl = buildGoogleCalendarUrl(event);

  const showEventCoverActions =
    enrollment?.type === 'Roster' && isEventCoverWindowOpen(event.eventDate);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAction = async (
    requestType: EnrollmentType,
    positionName?: string
  ) => {
    setSubmitting(true);
    try {
      const result = await EventApiService.submitEnrollment(
        initialEvent._id,
        requestType,
        positionName
      );
      toast.success(result.message);
      queryClient.invalidateQueries({
        queryKey: eventQueryKeys.enrollment(initialEvent._id),
      });
      await refetchEnrollment();
      onEnrollmentChange?.(initialEvent._id, requestType);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitCallOff = async (notes: string): Promise<boolean> => {
    setCallOffSubmitting(true);
    try {
      await EventApiService.submitEventCallOff(
        initialEvent._id,
        notes || undefined
      );
      toast.success('Call-off request submitted.');
      await queryClient.invalidateQueries({
        queryKey: eventQueryKeys.detail(initialEvent._id),
      });
      await invalidateEventListCaches(queryClient);
      return true;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Unable to submit call-off.'
      );
      return false;
    } finally {
      setCallOffSubmitting(false);
    }
  };

  const handleRemoveCallOff = async (): Promise<boolean> => {
    const rid = event.pendingCallOffRequestId;
    if (!rid) return false;
    setCallOffSubmitting(true);
    try {
      await EventApiService.deleteEventCallOffRequest(rid);
      toast.success('Call-off request removed.');
      await queryClient.invalidateQueries({
        queryKey: eventQueryKeys.detail(initialEvent._id),
      });
      await invalidateEventListCaches(queryClient);
      return true;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Unable to remove request.'
      );
      return false;
    } finally {
      setCallOffSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 space-y-4 pb-10">
        {/* Back to Events */}
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Events
        </button>

        {/* Hero card */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-b from-slate-700 to-slate-950 min-h-[160px] flex flex-col justify-end">
          {bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bannerUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setBannerError(true)}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/20 via-slate-900/50 to-slate-950/90" />

          {/* TODAY / UPCOMING / PAST chip */}
          {dateChip && (
            <span
              className={clsxm(
                'absolute top-4 left-4 px-2.5 py-0.5 text-[11px] font-bold rounded-md',
                dateChip.classes
              )}
            >
              {dateChip.label}
            </span>
          )}

          {/* Content */}
          <div className="relative p-5 pt-10">
            {/* Logo */}
            <div className="absolute top-0 right-5 -translate-y-1/2 w-14 h-14 rounded-xl border-2 border-white/20 bg-white/10 backdrop-blur-sm overflow-hidden flex items-center justify-center">
              {fullLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fullLogoUrl}
                  alt={event.venueName ?? event.eventName}
                  className="w-full h-full object-contain"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <Building2 className="w-7 h-7 text-white/60" />
              )}
            </div>

            <p className="text-xs font-bold tracking-widest text-cyan-400 uppercase mb-1">
              {formattedShortDate}
            </p>
            <h1 className="text-2xl font-bold text-white leading-tight">
              {event.eventName}
            </h1>
            {(event.venueName || location) && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <MapPin className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                <p className="text-sm text-slate-300">
                  {[event.venueName, location].filter(Boolean).join(' · ')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Info tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Date', value: formattedShortDate || '—' },
            { label: 'Time', value: timeDisplay || '—' },
            { label: 'Location', value: location || '—' },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                {label}
              </p>
              <p className="text-sm font-semibold text-slate-900 leading-snug">
                {value}
              </p>
            </div>
          ))}
          {/* Position tile — dropdown when registering, locked text when on roster */}
          <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Position
            </p>
            {showPositionPicker ? (
              <select
                title="Select a position"
                value={selectedPosition}
                onChange={(e) => setSelectedPosition(e.target.value)}
                className="w-full text-sm font-semibold text-slate-900 bg-transparent border-0 p-0 focus:outline-none cursor-pointer"
              >
                {availablePositions.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm font-semibold text-slate-900 leading-snug">
                {userPosition}
              </p>
            )}
          </div>
        </div>

        {/* Clock In / Out */}
        {isOnRoster && (
          <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm space-y-2">
            {isClockWindowPassed ? (
              /* ── Event ended, clock-out window closed ── */
              <div className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-slate-50 text-slate-500 text-sm font-medium">
                <Clock className="w-4 h-4" />
                This event has ended
              </div>
            ) : !isWithinClockWindow ? (
              /* ── Future event: outside clock window ── */
              <>
                <div className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-slate-50 text-slate-400 text-sm font-medium">
                  <Clock className="w-4 h-4" />
                  Clock In opens at start time
                </div>
                <a
                  href={googleCalendarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-appPrimary text-appPrimary text-sm font-semibold hover:bg-appPrimary/5 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add to Calendar
                </a>
              </>
            ) : isClockStateFetching && !serverClockState ? (
              /* ── Initial load: skeleton ── */
              <div className="h-12 rounded-xl bg-zinc-100 animate-pulse" />
            ) : clockState.clockInTime && clockState.clockOutTime ? (
              /* ── Completed: show worked hours ── */
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-500" strokeWidth={1.5} />
                <p className="text-xl font-bold text-slate-900">
                  Worked {workedHours}
                </p>
                <p className="text-sm text-slate-500">Time card approved</p>
              </div>
            ) : clockState.showClockOut ? (
              /* ── Clocked in, waiting for clock-out ── */
              <>
                <button
                  type="button"
                  disabled={isClockBusy || clockState.clockOutButtonDisabled}
                  onClick={() =>
                    clockOutMutation.mutate(
                      { eventId: event._id, payload: { applicantId, agent: agentName, createAgent: userId } },
                      { onSuccess: () => refetchClockState() }
                    )
                  }
                  className={clsxm(
                    'w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-base font-bold transition-all',
                    'bg-red-500 hover:bg-red-600 text-white shadow-md',
                    (isClockBusy || clockState.clockOutButtonDisabled) &&
                      'opacity-50 cursor-not-allowed'
                  )}
                >
                  <Clock className="w-5 h-5" />
                  {clockOutMutation.isPending ? 'Clocking Out…' : 'Clock Out'}
                </button>
                {clockState.clockInTime && (
                  <p className="text-xs text-center text-slate-500">
                    Clocked in at {clockState.clockInTime}
                  </p>
                )}
              </>
            ) : clockState.showClockIn ? (
              /* ── In window: clock-in button ── */
              <>
                <button
                  type="button"
                  disabled={isClockBusy || clockState.clockInButtonDisabled}
                  onClick={() =>
                    clockInMutation.mutate(
                      { eventId: event._id, payload: { applicantId, agent: agentName, createAgent: userId }, geoFence: event.geoFence },
                      { onSuccess: () => refetchClockState() }
                    )
                  }
                  className={clsxm(
                    'w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-base font-bold transition-all',
                    'bg-[#00BCD4] hover:bg-[#00ACC1] text-white shadow-md',
                    (isClockBusy || clockState.clockInButtonDisabled) &&
                      'opacity-50 cursor-not-allowed'
                  )}
                >
                  <Clock className="w-5 h-5" />
                  {clockInMutation.isPending ? 'Clocking In…' : 'Clock In Now'}
                </button>
                {clockState.showEarlyClockInWarning && (
                  <p className="text-xs text-center text-amber-600">
                    Early clock-in is enabled for this event
                  </p>
                )}
                {event.geoFence === 'Yes' && (
                  <p className="text-xs text-center text-slate-400">
                    You must be within the venue geofence to clock in.
                  </p>
                )}
              </>
            ) : (
              /* ── Not yet in window ── */
              <>
                <div className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-slate-50 text-slate-400 text-sm font-medium">
                  <Clock className="w-4 h-4" />
                  Clock In opens at start time
                </div>
                <a
                  href={googleCalendarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-appPrimary text-appPrimary text-sm font-semibold hover:bg-appPrimary/5 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add to Calendar
                </a>
              </>
            )}
          </div>
        )}

        {/* Enrollment actions */}
        {enrollmentLoading ? (
          <div className="h-16 rounded-xl bg-zinc-100 animate-pulse" />
        ) : enrollment ? (
          <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
            <ActionSection
              enrollment={enrollment}
              onAction={handleAction}
              submitting={submitting}
              selectedPosition={selectedPosition}
            />
          </div>
        ) : null}

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
          {/* Left column */}
          <div className="space-y-4 min-w-0">
            {/* Description */}
            {description ? (
              <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
                <h3 className="font-bold text-slate-900 mb-2">
                  About this event
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {descTooLong && !descExpanded
                    ? `${description.slice(0, DESCRIPTION_LIMIT)}…`
                    : description}
                </p>
                {descTooLong && (
                  <button
                    type="button"
                    onClick={() => setDescExpanded((p) => !p)}
                    className="mt-2 text-xs font-medium text-appPrimary hover:underline"
                  >
                    {descExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
            ) : eventDetail === undefined ? (
              <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm space-y-2">
                <div className="h-5 bg-zinc-100 rounded animate-pulse w-40" />
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={clsxm(
                      'h-3 bg-zinc-100 rounded animate-pulse',
                      i === 1 && 'w-[89%]',
                      i === 2 && 'w-[82%]',
                      i === 3 && 'w-[75%]',
                      i === 4 && 'w-[68%]'
                    )}
                  />
                ))}
              </div>
            ) : null}

            {/* Attachments */}
            {event.attachments &&
              event.attachments.length > 0 &&
              imageBaseUrl &&
              event.venueSlug && (
                <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
                  <h3 className="font-bold text-slate-900 mb-3">Attachments</h3>
                  <ul className="space-y-2">
                    {event.attachments.map((att) => (
                      <li key={att.filename}>
                        <a
                          href={`${imageBaseUrl}/${event.venueSlug}/events/${event.eventUrl}/${att.filename}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-appPrimary hover:underline"
                        >
                          <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{att.filename}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            {/* Videos */}
            {venueDetail?.videoUrls && venueDetail.videoUrls.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm overflow-hidden">
                <h3 className="font-bold text-slate-900 mb-3">Videos</h3>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5">
                  {venueDetail.videoUrls.map((url, i) => (
                    <VenueVideo key={i} url={url} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Map */}
            {venueDetail?.location?.coordinates && (
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-5 pb-0">
                  <VenueMap
                    coordinates={venueDetail.location.coordinates}
                    showHeader={false}
                  />
                </div>
                <div className="p-5 space-y-1">
                  {event.venueName && (
                    <p className="font-semibold text-slate-900 text-sm">
                      {event.venueName}
                    </p>
                  )}
                  {location && (
                    <p className="text-sm text-slate-500">{location}</p>
                  )}
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${venueDetail.location.coordinates[1]},${venueDetail.location.coordinates[0]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 w-full inline-flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-appPrimary text-appPrimary text-sm font-medium hover:bg-appPrimary/5 transition-colors"
                  >
                    <Navigation className="w-4 h-4" />
                    Get directions
                  </a>
                </div>
              </div>
            )}

            {/* Need help (cover / call off) */}
            {showEventCoverActions && (
              <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
                <h3 className="font-bold text-slate-900 mb-3">Need help?</h3>
                <div className="space-y-2">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setCoverIntent('invite-cover');
                        setCoverModalOpen(true);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      Let someone cover for me
                    </button>
                    {event.pendingCoverRequestId && (
                      <span className="text-[10px] text-violet-600 font-medium text-center">
                        Requested
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => setCallOffConfirmOpen(true)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Call off
                    </button>
                    {event.pendingCallOffRequestId && (
                      <span className="text-[10px] text-amber-700 font-medium text-center">
                        Requested
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Contact person */}
            {venueDetail?.venueContact1?.fullName && (
              <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
                <h3 className="font-bold text-slate-900 mb-3">
                  Contact Person
                </h3>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-appPrimary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-appPrimary">
                      {`${venueDetail.venueContact1.firstName?.[0] ?? ''}${venueDetail.venueContact1.lastName?.[0] ?? ''}` ||
                        '?'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {venueDetail.venueContact1.fullName}
                    </p>
                    {venueDetail.venueContact1.email && (
                      <a
                        href={`mailto:${venueDetail.venueContact1.email}`}
                        className="inline-flex items-center gap-1 text-xs text-appPrimary hover:underline mt-0.5"
                      >
                        <Mail className="w-3 h-3" />
                        {venueDetail.venueContact1.email}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <EventCoverRequestModal
        open={coverModalOpen}
        onClose={() => setCoverModalOpen(false)}
        event={event}
        intent={coverIntent}
        pendingPeerEmail={event.pendingCoverPeerEmail ?? null}
      />
      <EventCallOffConfirmModal
        open={callOffConfirmOpen}
        onClose={() => setCallOffConfirmOpen(false)}
        pendingRequestId={event.pendingCallOffRequestId ?? null}
        onConfirm={async (notes) => {
          const ok = await handleSubmitCallOff(notes);
          if (ok) setCallOffConfirmOpen(false);
        }}
        onRemoveRequest={async () => {
          const ok = await handleRemoveCallOff();
          if (ok) setCallOffConfirmOpen(false);
        }}
        loading={callOffSubmitting}
      />
    </>
  );
};
