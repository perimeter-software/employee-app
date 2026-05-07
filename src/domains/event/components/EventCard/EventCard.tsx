'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Clock, ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { toast } from 'sonner';
import { clsxm } from '@/lib/utils';
import { baseInstance } from '@/lib/api/instance';
import type { GignologyEvent } from '../../types';
import type { VenueWithStatus } from '@/domains/venue/types';
import {
  EventCoverRequestModal,
  type EventCoverModalIntent,
} from '@/domains/event/components/EventCoverRequestModal/EventCoverRequestModal';
import { EventCallOffConfirmModal } from '@/domains/event/components/EventCallOffConfirmModal/EventCallOffConfirmModal';
import {
  EventApiService,
  invalidateEventListCaches,
} from '@/domains/event/services/event-service';
import { isEventCoverWindowOpen } from '@/domains/event/utils/event-cover-window';

type Props = {
  event: GignologyEvent;
  imageBaseUrl?: string;
  onClick?: () => void;
};

function rosterStatusBadge(status?: string) {
  if (!status) return null;
  if (status === 'Roster') {
    return (
      <Badge variant="outline" className="border-emerald-500 text-emerald-700 shrink-0">
        Roster
      </Badge>
    );
  }
  if (status === 'Waitlist') {
    return (
      <Badge variant="outline" className="border-amber-400 text-amber-700 shrink-0">
        Waitlist
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-zinc-400 text-zinc-600 shrink-0">
      {status}
    </Badge>
  );
}

/** Returns "TODAY" / "UPCOMING" / "PAST" based on the event date in its tz. */
function getDateBadge(eventDate?: string, timezone?: string) {
  if (!eventDate) return null;
  const event = new Date(eventDate);
  if (Number.isNaN(event.getTime())) return null;

  // Same calendar day comparison in event's timezone
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone ?? undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);

  const eventKey = dayKey(event);
  const todayKey = dayKey(new Date());

  if (eventKey === todayKey) {
    return {
      label: 'TODAY',
      classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }
  if (event.getTime() > Date.now()) {
    return {
      label: 'UPCOMING',
      classes: 'bg-sky-50 text-sky-700 border-sky-200',
    };
  }
  return {
    label: 'PAST',
    classes: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  };
}

export const EventCard = ({ event, imageBaseUrl, onClick }: Props) => {
  const queryClient = useQueryClient();
  const [logoError, setLogoError] = useState(false);
  const [bannerError, setBannerError] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverIntent, setCoverIntent] =
    useState<EventCoverModalIntent>('invite-cover');
  const [callOffConfirmOpen, setCallOffConfirmOpen] = useState(false);
  const [callOffLoading, setCallOffLoading] = useState(false);

  // ── Venue detail (for banner image) ─────────────────────────────────────────
  const { data: venueDetail } = useQuery({
    queryKey: ['venue-detail', event.venueSlug],
    queryFn: async () => {
      const res = await baseInstance.get<VenueWithStatus>(
        `venues/${event.venueSlug}`
      );
      if (!res.success || !res.data) {
        throw new Error('Failed to fetch venue detail');
      }
      return res.data;
    },
    enabled: !!event.venueSlug,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const onRoster =
    event.status === 'Roster' || event.rosterStatus === 'Roster';
  const showCoverActions =
    onRoster && isEventCoverWindowOpen(event.eventDate);

  const logoFilename = event.logoUrl || venueDetail?.logoUrl;
  const fullLogoUrl =
    logoFilename && !logoError
      ? logoFilename.startsWith('http')
        ? logoFilename
        : `${imageBaseUrl}/${event.venueSlug}/venues/logo/${logoFilename}`
      : null;

  const bannerUrl =
    imageBaseUrl && venueDetail?.bannerUrl && !bannerError
      ? `${imageBaseUrl}/${venueDetail.slug}/venues/banner/${venueDetail.bannerUrl}`
      : null;

  // ── Date / time formatting ─────────────────────────────────────────────────
  const dateLabelFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: event.timeZone ?? undefined,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: event.timeZone ?? undefined,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const dateLabel = event.eventDate
    ? dateLabelFormatter.format(new Date(event.eventDate)).toUpperCase()
    : null;

  const startTime = event.eventDate
    ? timeFormatter.format(new Date(event.eventDate))
    : null;

  const endTime = event.eventEndTime
    ? timeFormatter.format(new Date(event.eventEndTime))
    : null;

  const dateBadge = getDateBadge(event.eventDate, event.timeZone);
  const location = [event.venueCity, event.venueState].filter(Boolean).join(', ');
  const rosterStatusLabel =
    event.status && event.status !== 'Roster' && event.status !== 'Waitlist'
      ? event.status
      : event.status === 'Roster' || event.rosterStatus === 'Roster'
      ? 'Roster'
      : event.status === 'Waitlist' || event.rosterStatus === 'Waitlist'
      ? 'Waitlist'
      : undefined;

  // ── Mutations ──────────────────────────────────────────────────────────────
  const handleSubmitCallOff = async (notes: string): Promise<boolean> => {
    setCallOffLoading(true);
    try {
      await EventApiService.submitEventCallOff(event._id, notes || undefined);
      toast.success('Call-off request submitted.');
      await invalidateEventListCaches(queryClient);
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to submit call-off.'
      );
      return false;
    } finally {
      setCallOffLoading(false);
    }
  };

  const handleRemoveCallOff = async (): Promise<boolean> => {
    const rid = event.pendingCallOffRequestId;
    if (!rid) return false;
    setCallOffLoading(true);
    try {
      await EventApiService.deleteEventCallOffRequest(rid);
      toast.success('Call-off request removed.');
      await invalidateEventListCaches(queryClient);
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to remove request.'
      );
      return false;
    } finally {
      setCallOffLoading(false);
    }
  };

  return (
    <>
      <Card
        className={clsxm(
          'overflow-hidden',
          onClick && 'cursor-pointer hover:shadow-md transition-shadow'
        )}
        onClick={onClick}
      >
        {/* ── Banner header ────────────────────────────────────────────────── */}
        <div className="relative h-24 bg-gradient-to-b from-slate-700 to-slate-950">
          {bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bannerUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setBannerError(true)}
            />
          )}

          {/* Overlay so text stays readable on top of any banner */}
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/30 via-slate-900/40 to-slate-950/85" />

          {/* Logo */}
          <div className="absolute top-3 left-3 w-10 h-10 rounded-full bg-white/90 flex items-center justify-center overflow-hidden shadow-sm">
            {fullLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fullLogoUrl}
                alt={event.venueName ?? ''}
                className="w-full h-full object-contain p-1"
                onError={() => setLogoError(true)}
              />
            ) : (
              <ImageIcon className="w-5 h-5 text-slate-400" />
            )}
          </div>

          {/* Date status badge */}
          {dateBadge && (
            <span
              className={clsxm(
                'absolute top-3 right-3 px-2.5 py-0.5 text-[11px] font-semibold rounded-md border',
                dateBadge.classes
              )}
            >
              {dateBadge.label}
            </span>
          )}

          {/* Date label */}
          {dateLabel && (
            <div className="absolute bottom-2 left-3 text-white text-[11px] font-bold tracking-wider">
              {dateLabel}
            </div>
          )}
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <CardContent className="p-4">
          <h3 className="font-semibold text-zinc-900 text-base leading-tight">
            {event.eventName}
          </h3>

          {event.venueName && (
            <p className="mt-0.5 text-sm text-zinc-500">{event.venueName}</p>
          )}

          {location && (
            <div className="flex items-center gap-1.5 mt-2 text-sm">
              <MapPin className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span className="text-zinc-600 truncate">{location}</span>
            </div>
          )}

          {(startTime || endTime) && (
            <div className="flex items-center gap-1.5 mt-1 text-sm">
              <Clock className="w-4 h-4 text-zinc-500 flex-shrink-0" />
              <span className="text-red-500 font-medium">
                {startTime}
                {startTime && endTime && (
                  <span className="text-red-500 mx-1">-</span>
                )}
                {endTime}
              </span>
            </div>
          )}

          {rosterStatusLabel && (
            <div className="mt-3">{rosterStatusBadge(rosterStatusLabel)}</div>
          )}

          {showCoverActions && (
            <div
              className="mt-3 flex flex-wrap gap-3 items-start"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col gap-0.5 items-start">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-xs h-8"
                  onClick={() => {
                    setCoverIntent('invite-cover');
                    setCoverOpen(true);
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
                  size="sm"
                  variant="outline"
                  className="text-xs h-8"
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
        </CardContent>
      </Card>

      <EventCoverRequestModal
        open={coverOpen}
        onClose={() => setCoverOpen(false)}
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
        loading={callOffLoading}
      />
    </>
  );
};
