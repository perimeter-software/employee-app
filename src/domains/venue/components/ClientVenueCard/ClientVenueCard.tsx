'use client';

import React, { useState } from 'react';
import { MapPin, Building2, Users, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { VenueWithStatus } from '../../types';

type Props = {
  venue: VenueWithStatus;
  imageBaseUrl?: string;
  onViewDetails: () => void;
  onStaffingPool: () => void;
};

export const ClientVenueCard = ({
  venue,
  imageBaseUrl,
  onViewDetails,
  onStaffingPool,
}: Props) => {
  const [logoError, setLogoError] = useState(false);
  const location = [venue.city, venue.state].filter(Boolean).join(', ');

  const fullLogoUrl =
    imageBaseUrl && venue.logoUrl && !logoError
      ? `${imageBaseUrl}/${venue.slug}/venues/logo/${venue.logoUrl}`
      : null;

  return (
    <Card className="hover:shadow-md transition-shadow hover:border-appPrimary/40 h-full">
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
          <button
            type="button"
            onClick={onViewDetails}
            className="text-left w-full"
          >
            <h3 className="font-semibold text-zinc-900 text-sm leading-tight truncate hover:text-appPrimary transition-colors">
              {venue.name}
            </h3>
          </button>

          {(location || venue.address) && (
            <div className="flex items-center gap-1 mt-1 text-xs text-zinc-500">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">
                {venue.address ? `${venue.address}, ` : ''}
                {location}
              </span>
            </div>
          )}

          <div className="mt-2.5 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={onViewDetails}
            >
              <Info className="w-3.5 h-3.5" />
              Info
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs gap-1.5 bg-appPrimary text-white hover:bg-appPrimary/90"
              onClick={onStaffingPool}
            >
              <Users className="w-3.5 h-3.5" />
              Staffing Pool
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
