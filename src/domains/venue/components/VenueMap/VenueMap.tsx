'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Map } from 'lucide-react';

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

type Props = {
  coordinates: [number, number]; // [longitude, latitude]
};

export const VenueMap = ({ coordinates }: Props) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const [showMap, setShowMap] = useState(false);

  const [lng, lat] = coordinates;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  useEffect(() => {
    if (!showMap || !mapRef.current) return;

    const initMap = () => {
      if (!mapRef.current || mapInstance.current) return;
      mapInstance.current = new google.maps.Map(mapRef.current, {
        center: { lat, lng },
        zoom: 15,
        mapTypeId: 'roadmap',
        disableDefaultUI: true,
        zoomControl: true,
      });
      new google.maps.Marker({ position: { lat, lng }, map: mapInstance.current });
    };

    if (window.google?.maps) {
      initMap();
      return;
    }

    if (document.querySelector('#gmaps-script')) {
      // Script already injected — wait for it
      const poll = setInterval(() => {
        if (window.google?.maps) { clearInterval(poll); initMap(); }
      }, 100);
      return () => clearInterval(poll);
    }

    const script = document.createElement('script');
    script.id = 'gmaps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}`;
    script.async = true;
    script.onload = initMap;
    document.head.appendChild(script);
  }, [showMap, lat, lng]);

  // Reset map instance when coordinates change so it re-initialises
  useEffect(() => { mapInstance.current = null; }, [lat, lng]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-slate-700">Location</h4>
        <div className="flex items-center gap-2">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-appPrimary hover:underline inline-flex items-center gap-1"
          >
            <MapPin className="w-3 h-3" />
            Get Directions
          </a>
          <button
            type="button"
            onClick={() => setShowMap((p) => !p)}
            className="text-xs font-medium text-appPrimary hover:underline inline-flex items-center gap-1"
          >
            <Map className="w-3 h-3" />
            {showMap ? 'Hide Map' : 'Show Map'}
          </button>
        </div>
      </div>
      {showMap && (
        <div
          ref={mapRef}
          className="w-full h-48 rounded-lg overflow-hidden border border-zinc-200"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
};
