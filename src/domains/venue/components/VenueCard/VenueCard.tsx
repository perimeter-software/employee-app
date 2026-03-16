'use client';

import React, { useState } from 'react';
import { MapPin, Building2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { venueBadge } from '../../utils';
import type { VenueWithStatus } from '../../types';

type Props = {
  venue: VenueWithStatus;
  imageBaseUrl?: string;
  onClick: () => void;
};

export const VenueCard = ({ venue, imageBaseUrl, onClick }: Props) => {
  const [logoError, setLogoError] = useState(false);
  const location = [venue.city, venue.state].filter(Boolean).join(', ');

  const fullLogoUrl =
    imageBaseUrl && venue.logoUrl && !logoError
      ? `${imageBaseUrl}/${venue.slug}/venues/logo/${venue.logoUrl}`
      : null;

  return (
    <button type="button" onClick={onClick} className="text-left w-full">
      <Card className="hover:shadow-md transition-shadow hover:border-appPrimary/40 cursor-pointer h-full">
        <CardContent className="p-4 flex gap-4 items-start">
          <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-zinc-100 flex items-center justify-center">
            {fullLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fullLogoUrl}
                alt={venue.name}
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
                {venue.name}
              </h3>
              {venueBadge(venue.userVenueStatus)}
            </div>

            {(location || venue.address) && (
              <div className="flex items-center gap-1 mt-1 text-xs text-zinc-500">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">
                  {venue.address ? `${venue.address}, ` : ''}
                  {location}
                </span>
              </div>
            )}

            {venue.distanceInMiles != null && (
              <p className="mt-1 text-xs text-zinc-400">{venue.distanceInMiles} mi away</p>
            )}
          </div>
        </CardContent>
      </Card>
    </button>
  );
};
