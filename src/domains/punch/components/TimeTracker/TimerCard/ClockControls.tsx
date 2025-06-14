"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MapPin } from "lucide-react";
import { GoogleMapsModal } from "./MapModal"; // Import your new modal
import { GignologyJob } from "@/domains/job/types/job.types";
import { GigLocation } from "@/domains/job/types/location.types";

interface ClockControlsProps {
  currentDate: string;
  totalHours: number;
  openPunchOtherJob?: boolean;
  openPunchOtherJobTitle?: string | null;
  // Map-related props
  selectedJob?: GignologyJob | null;
  isClocked?: boolean;
  userLocation?: GigLocation | null;
}

export function ClockControls({
  currentDate,
  totalHours,
  openPunchOtherJob = false,
  openPunchOtherJobTitle,
  selectedJob,
  isClocked = false,
  userLocation,
}: ClockControlsProps) {
  const [showMapModal, setShowMapModal] = useState(false);

  // Determine if we should show the View Map button
  const shouldShowMapButton = useMemo(() => {
    if (!selectedJob) return false;

    // If geofencing is enabled and user is clocked in, hide the button
    // (they already saw the map when they clocked in)
    if (selectedJob.additionalConfig?.geofence && isClocked) {
      return true;
    }

    // Show button if:
    // 1. Geofencing is off (always show map option), OR
    // 2. Geofencing is on but user is not clocked in (so they can see the location before clocking in)
    return false;
  }, [selectedJob, isClocked]);

  const handleViewMap = () => {
    setShowMapModal(true);
  };

  // Prepare job location data
  const jobLocation = selectedJob?.location
    ? {
        latitude: selectedJob.location.latitude || 0,
        longitude: selectedJob.location.longitude || 0,
        name: selectedJob.title,
        address:
          selectedJob.address ||
          `${selectedJob.companyCity}, ${selectedJob.companyState}`,
      }
    : null;

  // Get geofence radius (convert feet to meters if needed)
  const geoFenceRadius =
    selectedJob?.location?.geocoordinates?.geoFenceRadius ||
    (selectedJob?.location?.graceDistanceFeet
      ? selectedJob.location.graceDistanceFeet * 0.3048
      : 100);

  return (
    <>
      <div>
        {/* Date and Total Hours - Clean Design matching mockup */}
        <div className="text-center space-y-4 mb-6">
          <div className="text-base font-semibold rounded-xl py-3 px-4 bg-white shadow-sm">
            Total Hours: {totalHours.toFixed(0)} HOURS
          </div>
          <div className="text-base font-medium rounded-xl py-3 px-4 bg-white shadow-sm">
            {currentDate}
          </div>
        </div>

        {/* Other Job Punch Warning */}
        {openPunchOtherJob && openPunchOtherJobTitle && (
          <div className="flex items-center mb-4">
            <p className="text-sm w-full text-center text-orange-600">
              You are clocked in for {openPunchOtherJobTitle}. Select that job
              from the list to clock out.
            </p>
          </div>
        )}

        {/* View Map Button - Show based on conditions */}
        {shouldShowMapButton && (
          <Button
            variant="ghost-primary"
            fullWidth
            onClick={handleViewMap}
            disabled={!jobLocation && !userLocation}
          >
            <MapPin className="h-4 w-4 mr-2" />
            View Map
          </Button>
        )}

        {/* Status message when map button is hidden */}
        {selectedJob?.additionalConfig?.geofence && isClocked && (
          <div className="text-center py-3">
            <p className="text-sm text-gray-500">
              🟢 You are clocked in and within the geofenced area
            </p>
          </div>
        )}
      </div>

      {/* Map Modal */}
      <GoogleMapsModal
        isOpen={showMapModal}
        onClose={() => setShowMapModal(false)}
        userLocation={
          userLocation
            ? {
                latitude: userLocation.latitude || 0,
                longitude: userLocation.longitude || 0,
                accuracy: userLocation.accuracy || 0,
              }
            : null
        }
        jobLocation={jobLocation}
        geoFenceRadius={geoFenceRadius}
        title={
          selectedJob ? `${selectedJob.title} - Location Map` : "Location Map"
        }
      />
    </>
  );
}
