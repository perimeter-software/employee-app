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

export const MapModal = React.memo(function GoogleMapsModal({
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

  // 🔄 Clean up map when modal closes
  const cleanupMap = useCallback(() => {
    if (mapInstance.current) {
      mapInstance.current = null;
    }
    setIsMapLoaded(false);
    setMapError(null);
    console.log('🧹 Map cleaned up');
  }, []);

  // Load Google Maps API and initialize map
  const initializeMap = useCallback(async () => {
    if (!mapRef.current || !GOOGLE_MAPS_API_KEY) return;

    try {
      // Load Google Maps if not already loaded
      if (!window.google) {
        console.log('📦 Loading Google Maps API...');
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=maps`;
          script.async = true;
          script.defer = true;
          script.onload = () => {
            console.log('✅ Google Maps API loaded successfully');
            resolve();
          };
          script.onerror = () =>
            reject(new Error('Failed to load Google Maps'));
          document.head.appendChild(script);
        });
      }

      // 🎯 ALWAYS CENTER ON USER LOCATION FIRST
      let center = { lat: 39.8283, lng: -98.5795 }; // Default fallback
      let zoom = 4;

      if (userLocation) {
        // 🎯 PRIMARY: Always center on user location
        center = { lat: userLocation.latitude, lng: userLocation.longitude };
        zoom = 16; // Close zoom on user
        console.log('🎯 Map centered on USER location:', center);
      } else if (jobLocation) {
        // 🏢 FALLBACK: Only if no user location
        center = { lat: jobLocation.latitude, lng: jobLocation.longitude };
        zoom = 16;
        console.log('🏢 Map centered on JOB location (fallback):', center);
      }

      // Create map
      const map = new google.maps.Map(mapRef.current, {
        center,
        zoom,
        zoomControl: true,
        streetViewControl: false,
        fullscreenControl: true,
        mapTypeControl: true,
        gestureHandling: 'auto',
      });

      console.log('🗺️ Map created successfully');

      // 🟢 Add USER location marker FIRST (PRIMARY - larger and prominent)
      if (userLocation) {
        const userMarker = new google.maps.Marker({
          position: { lat: userLocation.latitude, lng: userLocation.longitude },
          map,
          title: 'Your Current Location',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 15, // Larger than job marker
            fillColor: '#10B981',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 4,
          },
          zIndex: 1000, // Higher z-index to appear on top
        });

        // Add info window for user location
        const userInfoWindow = new google.maps.InfoWindow({
          content: `
            <div style="padding: 12px; text-align: center;">
              <h3 style="margin: 0 0 8px 0; color: #10B981;">📍 Your Location</h3>
              <p style="margin: 0; font-size: 12px;">
                ${userLocation.latitude.toFixed(6)}, ${userLocation.longitude.toFixed(6)}
              </p>
              ${userLocation.accuracy ? `<p style="margin: 4px 0 0 0; font-size: 11px; color: #666;">Accuracy: ±${Math.round(userLocation.accuracy)}m</p>` : ''}
            </div>
          `,
        });

        userMarker.addListener('click', () => {
          userInfoWindow.open(map, userMarker);
        });

        // Add accuracy circle around user location
        if (userLocation.accuracy && userLocation.accuracy > 0) {
          new google.maps.Circle({
            strokeColor: '#10B981',
            strokeOpacity: 0.5,
            strokeWeight: 1,
            fillColor: '#10B981',
            fillOpacity: 0.1,
            map,
            center: { lat: userLocation.latitude, lng: userLocation.longitude },
            radius: userLocation.accuracy,
            zIndex: 1,
          });
        }
      }

      // 🔵 Add JOB location marker SECOND (SECONDARY - smaller)
      if (jobLocation) {
        const jobMarker = new google.maps.Marker({
          position: { lat: jobLocation.latitude, lng: jobLocation.longitude },
          map,
          title: `Job Site: ${jobLocation.name || 'Job Location'}`,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12, // Smaller than user marker
            fillColor: '#2563EB',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
          },
          zIndex: 999, // Lower z-index than user marker
        });

        // Add info window for job location
        const jobInfoWindow = new google.maps.InfoWindow({
          content: `
            <div style="padding: 12px; text-align: center;">
              <h3 style="margin: 0 0 8px 0; color: #2563EB;">🏢 ${jobLocation.name || 'Job Site'}</h3>
              ${jobLocation.address ? `<p style="margin: 0 0 4px 0; font-size: 12px;">${jobLocation.address}</p>` : ''}
              <p style="margin: 0; font-size: 11px; color: #666;">
                ${jobLocation.latitude.toFixed(6)}, ${jobLocation.longitude.toFixed(6)}
              </p>
            </div>
          `,
        });

        jobMarker.addListener('click', () => {
          jobInfoWindow.open(map, jobMarker);
        });

        // Add geofence circle around job location
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
            zIndex: 0, // Lowest z-index
          });
        }
      }

      mapInstance.current = map;
      setIsMapLoaded(true);
      console.log('✅ Map initialization complete');
    } catch (error) {
      console.error('❌ Map initialization error:', error);
      setMapError('Failed to load map');
    }
  }, [
    GOOGLE_MAPS_API_KEY,
    userLocation,
    jobLocation,
    geoFenceRadius,
    isWithinGeofence,
  ]);

  // 🔄 Handle modal open/close
  useEffect(() => {
    if (isOpen) {
      // Reset state when opening
      if (!isMapLoaded && !mapError) {
        console.log('🚀 Modal opened, initializing map...');
        const timer = setTimeout(initializeMap, 100);
        return () => clearTimeout(timer);
      }
    } else {
      // Clean up when closing
      console.log('🚪 Modal closed, cleaning up...');
      cleanupMap();
    }
  }, [isOpen, isMapLoaded, mapError, initializeMap, cleanupMap]);

  // 🎯 Add "Center on Me" button functionality
  const centerOnUser = useCallback(() => {
    if (!mapInstance.current || !userLocation) return;

    const userPosition = {
      lat: userLocation.latitude,
      lng: userLocation.longitude,
    };
    mapInstance.current.setCenter(userPosition);
    mapInstance.current.setZoom(17); // Zoom in close
    console.log('🎯 Centered on user location');
  }, [userLocation]);

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

          {/* 🎯 Center on Me Button */}
          {userLocation && isMapLoaded && (
            <div className="flex justify-center">
              <Button
                onClick={centerOnUser}
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <MapPin className="h-4 w-4 mr-2" />
                Center on My Location
              </Button>
            </div>
          )}

          {/* Map */}
          <div className="relative h-96 w-full rounded-lg border overflow-hidden">
            {!isMapLoaded && !mapError && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
                  <p className="text-gray-600">Loading map...</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Centering on your location...
                  </p>
                </div>
              </div>
            )}
            {mapError && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
                <div className="text-center">
                  <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                  <p className="text-red-600">{mapError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMapError(null);
                      setIsMapLoaded(false);
                      console.log('🔄 Retrying map initialization...');
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
              {userLocation && (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-600 rounded-full border-2 border-white shadow"></div>
                  <span className="font-medium">Your Location</span>
                </div>
              )}
              {jobLocation && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-600 rounded-full border-2 border-white shadow"></div>
                  <span>Job Site</span>
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

          {/* Debug Info */}
          <details className="text-xs">
            <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
              🔧 Debug Information
            </summary>
            <div className="mt-2 p-3 bg-gray-50 rounded border space-y-1">
              <div>
                <strong>Map Loaded:</strong> {isMapLoaded ? 'Yes' : 'No'}
              </div>
              <div>
                <strong>Map Error:</strong> {mapError || 'None'}
              </div>
              <div>
                <strong>User Location:</strong>{' '}
                {userLocation
                  ? `${userLocation.latitude.toFixed(6)}, ${userLocation.longitude.toFixed(6)}`
                  : 'None'}
              </div>
              <div>
                <strong>Job Location:</strong>{' '}
                {jobLocation
                  ? `${jobLocation.latitude.toFixed(6)}, ${jobLocation.longitude.toFixed(6)}`
                  : 'None'}
              </div>
              <div>
                <strong>Distance:</strong>{' '}
                {distance ? `${distance.toFixed(2)}m` : 'N/A'}
              </div>
            </div>
          </details>
        </div>
      </DialogContent>
    </Dialog>
  );
});
