'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MapPin, ChevronDown, ChevronUp } from 'lucide-react';

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

type Props = {
  coordinates: [number, number]; // [longitude, latitude]
  radius?: number;        // main geofence radius in meters
  graceDistance?: number; // grace zone width in meters
  showHeader?: boolean;
};

// Shared across every VenueMap instance so a page with several maps injects the
// <script> at most once, and later maps reuse the already-loaded API.
let mapsScriptPromise: Promise<void> | null = null;

function loadMapsScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();
  if (mapsScriptPromise) return mapsScriptPromise;

  mapsScriptPromise = new Promise<void>((resolve, reject) => {
    const existing =
      document.querySelector<HTMLScriptElement>('#gmaps-script');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('Failed to load Google Maps'))
      );
      return;
    }

    const script = document.createElement('script');
    script.id = 'gmaps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      mapsScriptPromise = null; // allow a retry on the next reveal
      reject(new Error('Failed to load Google Maps'));
    };
    document.head.appendChild(script);
  });

  return mapsScriptPromise;
}

export const VenueMap = ({ coordinates, radius, graceDistance, showHeader = true }: Props) => {
  // The map is opt-in: Google bills one "Dynamic Maps" load per `new
  // google.maps.Map(...)`, so nothing is loaded until the user asks for it.
  const [isVisible, setIsVisible] = useState(false);
  // Sticks once the user reveals the map, so hiding and re-showing only toggles
  // CSS rather than building (and paying for) a second map.
  const [hasRevealed, setHasRevealed] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geofenceCircle = useRef<google.maps.Circle | null>(null);
  const graceCircle = useRef<google.maps.Circle | null>(null);

  const [lng, lat] = coordinates;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  // Build the map exactly once. `lat`/`lng`/radii are deliberately NOT deps —
  // the sync effect below moves the existing map instead of rebuilding it.
  useEffect(() => {
    if (!hasRevealed || mapInstance.current) return;
    let cancelled = false;

    loadMapsScript()
      .then(() => {
        if (cancelled || !mapRef.current || mapInstance.current) return;
        mapInstance.current = new google.maps.Map(mapRef.current, {
          center: { lat, lng },
          zoom: 15,
          mapTypeId: 'roadmap',
          disableDefaultUI: true,
          zoomControl: true,
        });
        markerRef.current = new google.maps.Marker({
          position: { lat, lng },
          map: mapInstance.current,
        });
        setIsReady(true);
      })
      .catch(() => {
        if (!cancelled) setHasError(true);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRevealed]);

  // Keep the existing map in sync with prop changes — pan and redraw, never
  // re-instantiate, so a venue/radius change costs nothing.
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !isReady) return;

    const center = { lat, lng };
    map.setCenter(center);
    markerRef.current?.setPosition(center);

    const syncCircle = (
      ref: React.MutableRefObject<google.maps.Circle | null>,
      circleRadius: number | undefined,
      options: google.maps.CircleOptions
    ) => {
      if (circleRadius == null) {
        ref.current?.setMap(null);
        ref.current = null;
        return;
      }
      if (ref.current) {
        ref.current.setCenter(center);
        ref.current.setRadius(circleRadius);
        return;
      }
      ref.current = new google.maps.Circle({
        map,
        center,
        radius: circleRadius,
        ...options,
      });
    };

    syncCircle(geofenceCircle, radius, {
      strokeColor: 'green',
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: 'green',
      fillOpacity: 0.35,
      zIndex: 1,
    });

    // Only meaningful when there is a base radius to extend.
    const graceRadius =
      radius != null && graceDistance != null && graceDistance > 0
        ? radius + graceDistance
        : undefined;

    syncCircle(graceCircle, graceRadius, {
      strokeColor: '#F7C501',
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: 'yellow',
      fillOpacity: 0.35,
      zIndex: -1,
    });
  }, [isReady, lat, lng, radius, graceDistance]);

  // Re-centre after the container goes from hidden back to visible, otherwise
  // the tiles laid out at zero width stay offset.
  useEffect(() => {
    if (!isVisible || !isReady || !mapInstance.current) return;
    mapInstance.current.setCenter({ lat, lng });
  }, [isVisible, isReady, lat, lng]);

  const handleToggle = () => {
    setHasRevealed(true);
    setIsVisible((v) => !v);
  };

  return (
    <div>
      {showHeader && (
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-slate-700">Location</h4>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-appPrimary hover:underline inline-flex items-center gap-1"
          >
            <MapPin className="w-3 h-3" />
            Get Directions
          </a>
        </div>
      )}

      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isVisible}
        className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-zinc-50"
      >
        <MapPin className="w-3.5 h-3.5" />
        {isVisible ? 'Hide map' : 'Show map'}
        {isVisible ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
      </button>

      {hasError && (
        <p className="mt-2 text-xs text-slate-400 text-center">
          Map unavailable.
        </p>
      )}

      {/* Stays mounted once revealed so toggling never bills a second load. */}
      {hasRevealed && !hasError && (
        <div
          ref={mapRef}
          className={`w-full h-48 rounded-lg overflow-hidden border border-zinc-200 mt-2 ${
            isVisible ? '' : 'hidden'
          }`}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
};
