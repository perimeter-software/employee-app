'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  MapPin,
  Navigation,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

interface MapModalProps {
  isOpen: boolean;
  onClose: () => void;
  userLocation?: Coordinates | null;
  jobLocation?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  } | null;
  geoFenceRadius?: number;
  title?: string;
}

// Simple distance calculation
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export const GoogleMapsModal = React.memo(function GoogleMapsModal({
  isOpen,
  onClose,
  userLocation,
  jobLocation,
  geoFenceRadius = 100,
  title = 'Location Map',
}: MapModalProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  // Calculate distance only when both locations exist
  const distance =
    userLocation && jobLocation
      ? calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          jobLocation.latitude,
          jobLocation.longitude
        )
      : null;

  const isWithinGeofence = distance ? distance <= geoFenceRadius : false;

  // Load Google Maps API and initialize map
  const initializeMap = useCallback(async () => {
    if (!mapRef.current || !GOOGLE_MAPS_API_KEY) return;

    try {
      // Load Google Maps if not already loaded
      if (!window.google) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=maps`;
          script.async = true;
          script.defer = true;
          script.onload = () => resolve();
          script.onerror = () =>
            reject(new Error('Failed to load Google Maps'));
          document.head.appendChild(script);
        });
      }

      // Calculate center and zoom
      let center = { lat: 39.8283, lng: -98.5795 };
      let zoom = 4;

      if (jobLocation && userLocation) {
        center = {
          lat: (jobLocation.latitude + userLocation.latitude) / 2,
          lng: (jobLocation.longitude + userLocation.longitude) / 2,
        };
        zoom = distance && distance > 1000 ? 12 : 15;
      } else if (jobLocation) {
        center = { lat: jobLocation.latitude, lng: jobLocation.longitude };
        zoom = 15;
      } else if (userLocation) {
        center = { lat: userLocation.latitude, lng: userLocation.longitude };
        zoom = 15;
      }

      // Create map
      const map = new google.maps.Map(mapRef.current, {
        center,
        zoom,
        zoomControl: true,
        streetViewControl: false,
        fullscreenControl: true,
        mapTypeControl: true,
      });

      // Add job location marker
      if (jobLocation) {
        new google.maps.Marker({
          position: { lat: jobLocation.latitude, lng: jobLocation.longitude },
          map,
          title: 'Job Location',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#2563EB',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });

        // Add geofence circle
        if (geoFenceRadius > 0) {
          new google.maps.Circle({
            strokeColor: isWithinGeofence ? '#10B981' : '#EF4444',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: isWithinGeofence ? '#10B981' : '#EF4444',
            fillOpacity: 0.15,
            map,
            center: { lat: jobLocation.latitude, lng: jobLocation.longitude },
            radius: geoFenceRadius,
          });
        }
      }

      // Add user location marker
      if (userLocation) {
        new google.maps.Marker({
          position: { lat: userLocation.latitude, lng: userLocation.longitude },
          map,
          title: 'Your Location',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#10B981',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });
      }

      mapInstance.current = map;
      setIsMapLoaded(true);
    } catch (error) {
      console.error('Map initialization error:', error);
      setMapError('Failed to load map');
    }
  }, [
    GOOGLE_MAPS_API_KEY,
    jobLocation,
    userLocation,
    geoFenceRadius,
    distance,
    isWithinGeofence,
  ]);

  // Initialize map when modal opens
  useEffect(() => {
    if (isOpen && !isMapLoaded && !mapError) {
      const timer = setTimeout(initializeMap, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isMapLoaded, mapError, initializeMap]);

  const handleGetDirections = () => {
    if (!jobLocation) return;
    const destination = `${jobLocation.latitude},${jobLocation.longitude}`;
    const origin = userLocation
      ? `${userLocation.latitude},${userLocation.longitude}`
      : '';
    const url = `https://www.google.com/maps/dir/${origin}/${destination}`;
    window.open(url, '_blank');
  };

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">API Key Missing</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <p className="text-sm text-gray-700 mb-4">
              Google Maps API key is required.
            </p>
            <Button onClick={onClose} className="w-full">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] p-0">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-blue-600" />
              <span>{title}</span>
              {distance !== null && (
                <Badge variant={isWithinGeofence ? 'default' : 'destructive'}>
                  {isWithinGeofence ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> In Range
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3 w-3 mr-1" /> Out of Range
                    </>
                  )}
                </Badge>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-4">
          {/* Distance Info */}
          {distance !== null && (
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold mb-1">
                {formatDistance(distance)}
              </div>
              <div className="text-sm text-gray-600">
                Distance from job site • Required:{' '}
                {formatDistance(geoFenceRadius)}
              </div>
            </div>
          )}

          {/* Map */}
          <div className="relative h-96 w-full rounded-lg border overflow-hidden">
            {!isMapLoaded && !mapError && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
                  <p className="text-gray-600">Loading map...</p>
                </div>
              </div>
            )}
            {mapError && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                <div className="text-center">
                  <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                  <p className="text-red-600">{mapError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMapError(null);
                      setIsMapLoaded(false);
                    }}
                    className="mt-2"
                  >
                    Retry
                  </Button>
                </div>
              </div>
            )}
            <div ref={mapRef} className="w-full h-full" />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              {jobLocation && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                  <span>Job Site</span>
                </div>
              )}
              {userLocation && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-600 rounded-full"></div>
                  <span>Your Location</span>
                </div>
              )}
            </div>

            {jobLocation && (
              <Button onClick={handleGetDirections} size="sm">
                <Navigation className="h-4 w-4 mr-2" />
                Get Directions
              </Button>
            )}
          </div>

          {/* Status */}
          {distance !== null && (
            <div
              className={`p-3 rounded-lg text-sm ${
                isWithinGeofence
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {isWithinGeofence
                ? `✅ You are within the ${formatDistance(geoFenceRadius)} work area`
                : `⚠️ You are ${formatDistance(distance)} from the job site, outside the ${formatDistance(geoFenceRadius)} required area`}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});
