"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { MapPin, Navigation } from "lucide-react";
import {
  Map,
  Marker,
  InfoWindow,
  useMap,
  useApiIsLoaded,
} from "@vis.gl/react-google-maps";

interface MapModalProps {
  isOpen: boolean;
  onClose: () => void;
  userLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  } | null;
  jobLocation?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  } | null;
  geoFenceRadius?: number; // in meters
  title?: string;
}

// Custom marker icons as base64 data URLs
const JOB_MARKER_ICON = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="20" r="18" fill="#3B82F6" stroke="white" stroke-width="3"/>
    <circle cx="20" cy="20" r="6" fill="white"/>
  </svg>
`)}`;

const USER_MARKER_ICON = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="20" r="18" fill="#10B981" stroke="white" stroke-width="3"/>
    <circle cx="20" cy="20" r="6" fill="white"/>
  </svg>
`)}`;

// Component to handle circles (needs to be inside APIProvider)
function MapCircles({
  jobLocation,
  userLocation,
  geoFenceRadius,
}: {
  jobLocation?: { latitude: number; longitude: number } | null;
  userLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  } | null;
  geoFenceRadius: number;
}) {
  const map = useMap();

  const isLoaded = useApiIsLoaded();

  useEffect(() => {
    if (!map || !isLoaded) return;

    // Wait for google to be available
    const checkGoogle = () => {
      if (typeof window === "undefined" || !window.google?.maps?.Circle) {
        return false;
      }
      return true;
    };

    if (!checkGoogle()) {
      // Retry after a short delay
      const timeout = setTimeout(() => {
        if (checkGoogle()) {
          createCircles();
        }
      }, 1000);
      return () => clearTimeout(timeout);
    } else {
      createCircles();
    }

    function createCircles() {
      if (!window.google?.maps?.Circle) return;

      const circles: google.maps.Circle[] = [];

      // Add geofence circle around job location
      if (jobLocation && geoFenceRadius > 0) {
        const geofenceCircle = new window.google.maps.Circle({
          strokeColor: "#3B82F6",
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: "#3B82F6",
          fillOpacity: 0.15,
          map,
          center: { lat: jobLocation.latitude, lng: jobLocation.longitude },
          radius: geoFenceRadius,
        });
        circles.push(geofenceCircle);
      }

      // Add accuracy circle around user location
      if (userLocation?.accuracy) {
        const accuracyCircle = new window.google.maps.Circle({
          strokeColor: "#10B981",
          strokeOpacity: 0.6,
          strokeWeight: 1,
          fillColor: "#10B981",
          fillOpacity: 0.1,
          map,
          center: { lat: userLocation.latitude, lng: userLocation.longitude },
          radius: userLocation.accuracy,
        });
        circles.push(accuracyCircle);
      }

      // Cleanup function
      return () => {
        circles.forEach((circle) => circle.setMap(null));
      };
    }
  }, [map, jobLocation, userLocation, geoFenceRadius, isLoaded]);

  return null;
}

export function GoogleMapsModal({
  isOpen,
  onClose,
  userLocation,
  jobLocation,
  geoFenceRadius = 100,
  title = "Location Map",
}: MapModalProps) {
  const [selectedMarker, setSelectedMarker] = useState<"job" | "user" | null>(
    null
  );
  const [mapError, setMapError] = useState<string | null>(null);

  const isLoaded = useApiIsLoaded();

  // Calculate map center and bounds
  const mapConfig = useMemo(() => {
    if (jobLocation && userLocation) {
      const centerLat = (jobLocation.latitude + userLocation.latitude) / 2;
      const centerLng = (jobLocation.longitude + userLocation.longitude) / 2;
      return {
        center: { lat: centerLat, lng: centerLng },
        zoom: 16,
      };
    } else if (jobLocation) {
      return {
        center: { lat: jobLocation.latitude, lng: jobLocation.longitude },
        zoom: 17,
      };
    } else if (userLocation) {
      return {
        center: { lat: userLocation.latitude, lng: userLocation.longitude },
        zoom: 17,
      };
    }
    return {
      center: { lat: 39.8283, lng: -98.5795 }, // Center of US
      zoom: 4,
    };
  }, [jobLocation, userLocation]);

  // Calculate distance between locations
  const distance = useMemo(() => {
    if (!userLocation || !jobLocation) return null;
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (userLocation.latitude * Math.PI) / 180;
    const φ2 = (jobLocation.latitude * Math.PI) / 180;
    const Δφ = ((jobLocation.latitude - userLocation.latitude) * Math.PI) / 180;
    const Δλ =
      ((jobLocation.longitude - userLocation.longitude) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
  }, [userLocation, jobLocation]);

  // Get API key from environment variables
  const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Add error handling for missing API key
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configuration Error</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <p className="text-red-600">
              Google Maps API key is not configured. Please add
              NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to your .env.local file.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const handleGetDirections = () => {
    if (!jobLocation) return;

    const destination = `${jobLocation.latitude},${jobLocation.longitude}`;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
    window.open(url, "_blank");
  };

  if (mapError) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Map Loading Error</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <p className="text-red-600">{mapError}</p>
            <Button
              onClick={() => setMapError(null)}
              className="mt-4"
              variant="outline"
            >
              Retry
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-blue-600" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Map Container */}

          <div className="w-full h-96 rounded-lg overflow-hidden shadow-md">
            <Map
              {...mapConfig}
              mapId="job-location-map"
              gestureHandling="greedy"
              disableDefaultUI={false}
              zoomControl={true}
              streetViewControl={false}
              fullscreenControl={false}
              styles={[
                {
                  featureType: "poi",
                  elementType: "labels",
                  stylers: [{ visibility: "off" }],
                },
              ]}
            >
              {/* Add circles component */}
              <MapCircles
                jobLocation={jobLocation}
                userLocation={userLocation}
                geoFenceRadius={geoFenceRadius}
              />

              {/* Job Location Marker */}
              {jobLocation && (
                <>
                  <Marker
                    position={{
                      lat: jobLocation.latitude,
                      lng: jobLocation.longitude,
                    }}
                    onClick={() =>
                      setSelectedMarker(selectedMarker === "job" ? null : "job")
                    }
                    icon={
                      isLoaded
                        ? {
                            url: JOB_MARKER_ICON,
                            scaledSize: new window.google.maps.Size(40, 40),
                          }
                        : undefined
                    }
                  />
                  {selectedMarker === "job" && (
                    <InfoWindow
                      position={{
                        lat: jobLocation.latitude,
                        lng: jobLocation.longitude,
                      }}
                      onCloseClick={() => setSelectedMarker(null)}
                    >
                      <div className="p-2 max-w-xs">
                        <h3 className="font-bold text-sm mb-1">Job Location</h3>
                        <p className="text-xs text-gray-600">
                          {jobLocation.name || "Work Site"}
                        </p>
                        {jobLocation.address && (
                          <p className="text-xs text-gray-500 mt-1">
                            {jobLocation.address}
                          </p>
                        )}
                      </div>
                    </InfoWindow>
                  )}
                </>
              )}

              {/* User Location Marker */}
              {userLocation && (
                <>
                  <Marker
                    position={{
                      lat: userLocation.latitude,
                      lng: userLocation.longitude,
                    }}
                    onClick={() =>
                      setSelectedMarker(
                        selectedMarker === "user" ? null : "user"
                      )
                    }
                    icon={
                      isLoaded
                        ? {
                            url: USER_MARKER_ICON,
                            scaledSize: new window.google.maps.Size(40, 40),
                          }
                        : undefined
                    }
                  />
                  {selectedMarker === "user" && (
                    <InfoWindow
                      position={{
                        lat: userLocation.latitude,
                        lng: userLocation.longitude,
                      }}
                      onCloseClick={() => setSelectedMarker(null)}
                    >
                      <div className="p-2">
                        <h3 className="font-bold text-sm mb-1">
                          Your Location
                        </h3>
                        <p className="text-xs text-gray-600">
                          Accuracy: ±{userLocation.accuracy || "Unknown"}m
                        </p>
                        {distance && (
                          <p className="text-xs mt-1">
                            <span
                              className={
                                distance <= geoFenceRadius
                                  ? "text-green-600"
                                  : "text-red-600"
                              }
                            >
                              {distance.toFixed(0)}m from job site
                            </span>
                          </p>
                        )}
                      </div>
                    </InfoWindow>
                  )}
                </>
              )}
            </Map>
          </div>

          {/* Distance and Status Info */}
          {distance && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">Distance Status</h3>
                  <p className="text-2xl font-bold mt-1">
                    <span
                      className={
                        distance <= geoFenceRadius
                          ? "text-green-600"
                          : "text-red-600"
                      }
                    >
                      {distance.toFixed(0)}m
                    </span>
                  </p>
                  <p className="text-xs text-gray-600">
                    {distance <= geoFenceRadius ? (
                      <span className="text-green-600">
                        ✓ Within geofence radius
                      </span>
                    ) : (
                      <span className="text-red-600">
                        ⚠ Outside geofence radius
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Geofence Radius</p>
                  <p className="text-lg font-semibold">{geoFenceRadius}m</p>
                </div>
              </div>
            </div>
          )}

          {/* Map Legend and Actions */}
          <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
            <div className="flex items-center gap-4 text-sm">
              {jobLocation && (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white"></div>
                  <span>Job Location</span>
                </div>
              )}
              {userLocation && (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                  <span>Your Location</span>
                </div>
              )}
              {geoFenceRadius > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-blue-500 rounded-full bg-blue-100"></div>
                  <span>Geofence</span>
                </div>
              )}
            </div>

            {jobLocation && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleGetDirections}
                className="text-blue-600 hover:text-blue-700"
              >
                <Navigation className="h-4 w-4 mr-1" />
                Get Directions
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
