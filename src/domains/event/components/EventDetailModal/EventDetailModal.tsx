'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  MapPin,
  Calendar,
  Clock,
  Building2,
  X,
  ChevronDown,
  ChevronUp,
  Paperclip,
  Mail,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import {
  EventApiService,
  eventQueryKeys,
  invalidateEventListCaches,
} from '../../services/event-service';
import type { GignologyEvent, EventPosition } from '../../types';
import type {
  EnrollmentCheckResult,
  EnrollmentType,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function enrollmentBadge(type: EnrollmentType | undefined) {
  if (!type || type === 'Not Roster') return null;
  if (type === 'Roster') {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500 text-emerald-700 shrink-0"
      >
        On Roster
      </Badge>
    );
  }
  if (type === 'Waitlist') {
    return (
      <Badge
        variant="outline"
        className="border-amber-400 text-amber-700 shrink-0"
      >
        Waitlisted
      </Badge>
    );
  }
  if (type === 'Request') {
    return (
      <Badge
        variant="outline"
        className="border-blue-400 text-blue-700 shrink-0"
      >
        Requested
      </Badge>
    );
  }
  return null;
}

// ─── Available positions helper ───────────────────────────────────────────────

function getAvailablePositions(
  positions: EventPosition[] | undefined,
  existingApplicants: GignologyEvent['applicants']
): { label: string; value: string }[] {
  if (!positions?.length) return [];

  const filtered = positions.filter((pos) => {
    if (!pos.makePublic) return false;
    if (pos.numberPositions == null) return true;
    const assigned = (existingApplicants ?? []).filter(
      (a) =>
        a.status === 'Roster' && a.primaryPosition === pos.positionName
    ).length;
    return assigned < pos.numberPositions;
  });

  const hasEventStaff = filtered.some(
    (p) => p.positionName === DEFAULT_POSITION
  );
  const items = filtered.map((p) => ({
    label: p.positionName,
    value: p.positionName,
  }));

  if (!hasEventStaff) {
    return [{ label: DEFAULT_POSITION, value: DEFAULT_POSITION }, ...items];
  }
  return items;
}

// ─── Action section ───────────────────────────────────────────────────────────

type ActionSectionProps = {
  enrollment: EnrollmentCheckResult;
  event: GignologyEvent;
  imageBaseUrl?: string;
  onAction: (
    requestType: EnrollmentType,
    positionName?: string
  ) => Promise<void>;
  submitting: boolean;
};

function ActionSection({
  enrollment,
  event,
  onAction,
  submitting,
}: ActionSectionProps) {
  const { type, allowed, message, status } = enrollment;
  const [selectedPosition, setSelectedPosition] = useState(DEFAULT_POSITION);

  const availablePositions = useMemo(
    () => getAvailablePositions(event.positions, event.applicants),
    [event.positions, event.applicants]
  );

  const showPositionPicker =
    allowed === 'Roster' && availablePositions.length > 1;

  // ── Currently enrolled (Roster) ────────────────────────────────────────────
  if (type === 'Roster') {
    if (allowed === 'Roster' && status === 'Warning') {
      // < 48h: cannot leave
      return (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          {message}
        </div>
      );
    }
    // Can leave
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

  // ── Waitlisted ─────────────────────────────────────────────────────────────
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

  // ── Requested ─────────────────────────────────────────────────────────────
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

  // ── Not enrolled — show available action ──────────────────────────────────
  if (allowed === 'Roster') {
    return (
      <div className="space-y-3">
        {showPositionPicker && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Select a position
            </label>
            <select
              value={selectedPosition}
              onChange={(e) => setSelectedPosition(e.target.value)}
              className="w-full text-sm rounded-md border border-zinc-200 bg-white px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-appPrimary/30 focus:border-appPrimary"
            >
              {availablePositions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button
          variant="success"
          fullWidth
          loading={submitting}
          onClick={() =>
            onAction(
              'Roster',
              showPositionPicker && selectedPosition !== DEFAULT_POSITION
                ? selectedPosition
                : undefined
            )
          }
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

  // Allowed = 'Not Roster' and not enrolled → event is full or past
  return (
    <div className="flex items-center justify-center py-2 px-4 rounded-md bg-zinc-100 border border-zinc-200">
      <span className="text-sm font-medium text-zinc-500">{message}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  event: GignologyEvent;
  imageBaseUrl?: string;
  open: boolean;
  onClose: () => void;
  onEnrollmentChange?: (eventId: string, newType: string) => void;
};

export const EventDetailModal = ({
  event: initialEvent,
  imageBaseUrl,
  open,
  onClose,
  onEnrollmentChange,
}: Props) => {
  const queryClient = useQueryClient();
  const [descExpanded, setDescExpanded] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [coverModalOpen, setCoverModalOpen] = useState(false);
  const [callOffConfirmOpen, setCallOffConfirmOpen] = useState(false);
  const [callOffSubmitting, setCallOffSubmitting] = useState(false);
  const [coverIntent, setCoverIntent] =
    useState<EventCoverModalIntent>('invite-cover');

  // Reset state when modal opens for a different event
  useEffect(() => {
    setDescExpanded(false);
    setLogoError(false);
  }, [initialEvent._id]);

  useEffect(() => {
    if (!open) setCoverModalOpen(false);
  }, [open]);

  // ── Fetch venue detail (contact, map, videos) ────────────────────────────
  const { data: venueDetail } = useQuery({
    queryKey: ['venue-detail', initialEvent.venueSlug],
    queryFn: async () => {
      const res = await baseInstance.get<{
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
    enabled: open && !!initialEvent.venueSlug,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // ── Fetch full event detail ───────────────────────────────────────────────
  const { data: eventDetail } = useQuery({
    queryKey: eventQueryKeys.detail(initialEvent._id),
    queryFn: () => EventApiService.fetchEventDetail(initialEvent._id),
    enabled: open,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // ── Fetch enrollment status ───────────────────────────────────────────────
  const {
    data: enrollment,
    isLoading: enrollmentLoading,
    refetch: refetchEnrollment,
  } = useQuery({
    queryKey: eventQueryKeys.enrollment(initialEvent._id),
    queryFn: () => EventApiService.checkEnrollment(initialEvent._id),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  // Merge list data with fetched detail
  const event: GignologyEvent = eventDetail
    ? { ...initialEvent, ...eventDetail }
    : initialEvent;

  // ── Logo URL ──────────────────────────────────────────────────────────────
  const fullLogoUrl =
    event.logoUrl && !logoError
      ? event.logoUrl.startsWith('http')
        ? event.logoUrl
        : `${imageBaseUrl}/${event.venueSlug}/venues/logo/${event.logoUrl}`
      : null;

  // ── Date / time formatting ────────────────────────────────────────────────
  const dateOpts: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  };
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  const formattedDate = formatEventDate(
    event.eventDate,
    event.timeZone,
    dateOpts
  );
  const startTime = formatEventDate(event.eventDate, event.timeZone, timeOpts);
  const endTime = event.eventEndTime
    ? formatEventDate(event.eventEndTime, event.timeZone, timeOpts)
    : null;
  const reportTimeTBD = event.reportTimeTBD?.trim();

  // ── Description ───────────────────────────────────────────────────────────
  const description = stripHtml(event.description);
  const DESCRIPTION_LIMIT = 400;
  const descTooLong = description.length > DESCRIPTION_LIMIT;

  // ── Enrollment action handler ─────────────────────────────────────────────
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

      // Invalidate the enrollment query so it refetches
      queryClient.invalidateQueries({
        queryKey: eventQueryKeys.enrollment(initialEvent._id),
      });
      // Also refetch immediately
      await refetchEnrollment();

      // Use requestType as the new enrollment state: the external API's `type` field
      // reflects the pre-enrollment validation state ('Not Roster'), not the result.
      onEnrollmentChange?.(initialEvent._id, requestType);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitCallOff = async (notes: string): Promise<boolean> => {
    setCallOffSubmitting(true);
    try {
      await EventApiService.submitEventCallOff(initialEvent._id, notes || undefined);
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

  const location = [event.venueCity, event.venueState]
    .filter(Boolean)
    .join(', ');

  const showEventCoverActions =
    enrollment?.type === 'Roster' && isEventCoverWindowOpen(event.eventDate);

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header band — gradient with logo */}
        <div className="relative h-36 bg-gradient-to-br from-appPrimary/30 to-appPrimary/10 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 p-1.5 rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Logo */}
          <div className="absolute -bottom-7 left-4 w-16 h-16 rounded-xl border-2 border-white bg-white shadow-md overflow-hidden flex items-center justify-center">
            {fullLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fullLogoUrl}
                alt={event.venueName ?? event.eventName}
                className="w-full h-full object-contain"
                onError={() => setLogoError(true)}
              />
            ) : (
              <Building2 className="w-8 h-8 text-zinc-300" />
            )}
          </div>
        </div>

        {/* Scrollable body */}
        <div
          className="overflow-y-auto flex-1 pt-10 pb-6 px-5 space-y-5"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {/* Title + status */}
          <DialogHeader className="text-left space-y-1 pb-0">
            <div className="flex items-start justify-between gap-2">
              <DialogTitle className="text-base font-bold text-slate-900 leading-tight">
                {event.eventName}
              </DialogTitle>
              {enrollmentBadge(enrollment?.type)}
            </div>
            {event.venueName && (
              <p className="text-sm text-slate-500">{event.venueName}</p>
            )}
          </DialogHeader>

          {/* Event details row */}
          <div className="space-y-1.5 text-sm text-slate-600">
            {formattedDate && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 flex-shrink-0 text-appPrimary" />
                <span>{formattedDate}</span>
              </div>
            )}
            {(startTime || reportTimeTBD) && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 flex-shrink-0 text-appPrimary" />
                <span>
                  {reportTimeTBD
                    ? `Time TBD: ${reportTimeTBD}`
                    : endTime
                      ? `${startTime} – ${endTime}`
                      : startTime}
                  {event.timeZone && (
                    <span className="ml-1 text-xs text-slate-400">
                      ({event.timeZone})
                    </span>
                  )}
                </span>
              </div>
            )}
            {location && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 flex-shrink-0 text-appPrimary" />
                <span>{location}</span>
              </div>
            )}
          </div>

          {/* Enrollment action area */}
          {enrollmentLoading ? (
            <div className="h-10 rounded-lg bg-zinc-100 animate-pulse" />
          ) : enrollment ? (
            <ActionSection
              enrollment={enrollment}
              event={event}
              imageBaseUrl={imageBaseUrl}
              onAction={handleAction}
              submitting={submitting}
            />
          ) : null}

          {showEventCoverActions && (
            <div className="flex flex-wrap gap-3 items-start">
              <div className="flex flex-col gap-0.5 items-start">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCoverIntent('invite-cover');
                    setCoverModalOpen(true);
                  }}
                >
                  Let someone cover for me
                </Button>
                {event.pendingCoverRequestId ? (
                  <span className="text-[10px] text-violet-600 font-medium">
                    Requested
                  </span>
                ) : null}
              </div>
              <div className="flex flex-col gap-0.5 items-start">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCallOffConfirmOpen(true)}
                >
                  Call off
                </Button>
                {event.pendingCallOffRequestId ? (
                  <span className="text-[10px] text-amber-700 font-medium">
                    Requested
                  </span>
                ) : null}
              </div>
            </div>
          )}

          {/* Description */}
          {description ? (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-1.5">
                Event Description
              </h4>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                {descTooLong && !descExpanded
                  ? `${description.slice(0, DESCRIPTION_LIMIT)}…`
                  : description}
              </p>
              {descTooLong && (
                <button
                  type="button"
                  onClick={() => setDescExpanded((p) => !p)}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-appPrimary hover:underline"
                >
                  {descExpanded ? (
                    <>
                      <ChevronUp className="w-3 h-3" /> Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3 h-3" /> Show more
                    </>
                  )}
                </button>
              )}
            </div>
          ) : eventDetail === undefined ? (
            // Loading skeleton for description
            <div className="space-y-2">
              <div className="h-4 bg-zinc-100 rounded animate-pulse w-32" />
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-3 bg-zinc-100 rounded animate-pulse"
                  style={{ width: `${90 - i * 8}%` }}
                />
              ))}
            </div>
          ) : null}

          {/* Attachments */}
          {event.attachments &&
            event.attachments.length > 0 &&
            imageBaseUrl &&
            event.venueSlug && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">
                  Attachments
                </h4>
                <ul className="space-y-1.5">
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

          {/* Contact person */}
          {venueDetail?.venueContact1?.fullName && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">
                Contact Person
              </h4>
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

          {/* Map */}
          {venueDetail?.location?.coordinates && (
            <VenueMap coordinates={venueDetail.location.coordinates} />
          )}

          {/* Videos */}
          {venueDetail?.videoUrls && venueDetail.videoUrls.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">
                Videos
              </h4>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {venueDetail.videoUrls.map((url, i) => (
                  <VenueVideo key={i} url={url} />
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

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
