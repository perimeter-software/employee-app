'use client';

import React, { useState } from 'react';
import { MapPin, Calendar, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import type { GignologyEvent } from '../../types';

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
  const [logoError, setLogoError] = useState(false);

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

  return (
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
        </div>
      </CardContent>
    </Card>
  );
};
