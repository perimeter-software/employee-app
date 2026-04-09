'use client';

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MapPin, Calendar, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { toast } from 'sonner';
import type { GignologyEvent } from '../../types';
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

function statusBadge(status?: string) {
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

export const EventCard = ({ event, imageBaseUrl, onClick }: Props) => {
  const queryClient = useQueryClient();
  const [logoError, setLogoError] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverIntent, setCoverIntent] =
    useState<EventCoverModalIntent>('invite-cover');
  const [callOffConfirmOpen, setCallOffConfirmOpen] = useState(false);
  const [callOffLoading, setCallOffLoading] = useState(false);

  const onRoster =
    event.status === 'Roster' || event.rosterStatus === 'Roster';
  const showCoverActions =
    onRoster && isEventCoverWindowOpen(event.eventDate);

  const fullLogoUrl =
    event.logoUrl && !logoError
      ? event.logoUrl.startsWith('http')
        ? event.logoUrl
        : `${imageBaseUrl}/${event.venueSlug}/venues/logo/${event.logoUrl}`
      : null;

  const formatter = (timezone?: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone ?? undefined,
      weekday: 'short',
      month: 'short',
      day: '2-digit',
    });

  const formattedDate = event.eventDate
    ? formatter(event.timeZone).format(new Date(event.eventDate))
    : null;

  const location = [event.venueCity, event.venueState].filter(Boolean).join(', ');

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
      className={onClick ? 'h-full cursor-pointer hover:shadow-md transition-shadow' : 'h-full'}
      onClick={onClick}
    >
      <CardContent className="p-4 flex gap-4 items-start">
        <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-zinc-100 flex items-center justify-center">
          {fullLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fullLogoUrl}
              alt={event.venueName}
              className="w-full h-full object-contain"
              onError={() => setLogoError(true)}
            />
          ) : (
            <Building2 className="w-7 h-7 text-zinc-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-zinc-900 text-sm leading-tight truncate">
              {event.eventName}
            </h3>
            {statusBadge(event.status ?? event.rosterStatus)}
          </div>

          {event.venueName && (
            <p className="mt-0.5 text-xs text-zinc-500 truncate">{event.venueName}</p>
          )}

          {formattedDate && (
            <div className="flex items-center gap-1 mt-1 text-xs text-zinc-500">
              <Calendar className="w-3 h-3 flex-shrink-0" />
              <span>{formattedDate}</span>
            </div>
          )}

          {location && (
            <div className="flex items-center gap-1 mt-0.5 text-xs text-zinc-500">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{location}</span>
            </div>
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
        </div>
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
