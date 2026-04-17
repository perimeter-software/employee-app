'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/ToggleGroup';
import { CircularTimer } from './CircularTimer';
import { ElapsedTime } from './ElapsedTime';
import { JobShiftSelector } from './JobShiftSelector';
import { ClockControls } from './ClockControls';
import { ClockInValidationModal } from '../ClockInValidationModal';
import { EventTimerCardContent } from '../EventTimerCard/EventTimerCard';
import { useTimerCard } from '@/domains/punch/hooks';
import { usePunchViewerStore } from '@/domains/punch/stores/punch-viewer-store';
import { PunchWithJobInfo } from '@/domains/punch/types';
import { GignologyUser } from '@/domains/user/types';
import { clsxm } from '@/lib/utils';
import { noop } from '@tanstack/react-query';

interface TimerCardProps {
  userData: GignologyUser;
  openPunches: PunchWithJobInfo[] | undefined;
  hasRosterEvents?: boolean;
  hasShiftJobs?: boolean;
  isBlockedByJobPunch?: boolean;
  hasActiveEventClockIn?: boolean;
}

export function TimerCard({
  userData,
  openPunches,
  hasRosterEvents,
  hasShiftJobs = true,
  isBlockedByJobPunch = false,
  hasActiveEventClockIn = false,
}: TimerCardProps) {
  const { initializeFromServerData } = usePunchViewerStore();
  const [activeTab, setActiveTab] = useState<'jobs' | 'events'>('jobs');

  // Resolve which tab's content to display.
  // - Both present → respect activeTab toggle
  // - Only jobs     → always 'jobs'
  // - Only events   → always 'events'
  const effectiveTab =
    hasShiftJobs && hasRosterEvents
      ? activeTab
      : hasShiftJobs
        ? 'jobs'
        : 'events';

  // Initialize store from server data when component mounts or data changes
  useEffect(() => {
    if (openPunches && userData) {
      initializeFromServerData(openPunches, userData);
    }
  }, [openPunches, userData, initializeFromServerData]);

  const {
    // State
    currentTime,
    isClocked,
    currentDate,
    totalHours,
    loading,
    location,
    isInitialized,
    shiftInfo,
    pendingOverrideJob,
    pendingOverrideShift,

    // Store state
    selectedJob,
    selectedShift,

    // Computed values
    currentOpenPunch,
    blockJobSelection,
    openPunchOtherJob,
    openPunchOtherJobTitle,
    availableShifts,

    // Handlers
    handleJobSelection,
    handleShiftSelection,
    handleClockInOut,

    // Validation
    validationMessages,
    showValidationModal,
    cancelClockIn,
    performClockIn,
  } = useTimerCard({ userData, openPunches, hasActiveEventClockIn });

  // Show loading state until initialized
  if (!isInitialized) {
    return (
      <Card className="w-full max-w-lg mx-auto shadow-lg border-0 rounded-2xl">
        <CardContent className="py-8 px-8">
          <div className="space-y-4">
            <Skeleton className="w-full h-12 bg-gray-200" />
            <Skeleton className="w-full h-12 bg-gray-200" />
            <Skeleton className="w-64 h-64 bg-gray-200 mx-auto rounded-full" />
            <Skeleton className="w-full h-12 bg-gray-200" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <ClockInValidationModal
        isOpen={showValidationModal}
        messages={validationMessages}
        onConfirm={() => {
          // Use override values if available, otherwise use selected values
          performClockIn(
            pendingOverrideJob || selectedJob,
            pendingOverrideShift || selectedShift
          );
        }}
        onCancel={cancelClockIn}
        loading={loading}
      />

      <Card className="w-full max-w-lg mx-auto shadow-lg border-0 rounded-2xl">
        {/* REMOVED: Location Display - no more showing coordinates at the top */}

        <CardContent className="py-8 px-8">
          {/* Tab selector — only shown when the user has both shift jobs and rostered events */}
          {hasShiftJobs && hasRosterEvents && (
            <div className="flex justify-center mb-6">
              <ToggleGroup
                type="single"
                value={activeTab}
                onValueChange={(value) => {
                  if (value) setActiveTab(value as 'jobs' | 'events');
                }}
                className="inline-flex rounded-lg border border-gray-300 p-1 shadow-sm"
              >
                <ToggleGroupItem
                  value="jobs"
                  className={clsxm(
                    'rounded-md px-4 py-1.5 text-sm font-medium transition-all',
                    activeTab === 'jobs' &&
                      'bg-appPrimary text-white shadow-md',
                    activeTab === 'events' &&
                      'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                  )}
                >
                  Jobs
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="events"
                  className={clsxm(
                    'rounded-md px-4 py-1.5 text-sm font-medium transition-all',
                    activeTab === 'events' &&
                      'bg-appPrimary text-white shadow-md',
                    activeTab === 'jobs' &&
                      'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                  )}
                >
                  Events
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
          {effectiveTab === 'jobs' ? (
            <>
              {/* Warning: blocked by an active event clock-in */}
              {hasActiveEventClockIn && !isClocked && (
                <p className="text-sm text-center text-orange-600 mb-4">
                  You are clocked into an event. Please clock out of the event first.
                </p>
              )}

              {/* Job and Shift Selection */}
              <JobShiftSelector
                userData={userData}
                selectedJob={selectedJob}
                selectedShift={selectedShift}
                availableShifts={availableShifts}
                blockJobSelection={blockJobSelection}
                onJobSelect={handleJobSelection}
                onShiftSelect={handleShiftSelection}
                currentOpenPunch={currentOpenPunch || undefined}
                isClocked={isClocked}
              />

              {/* Timer Display - Show elapsed time when clocked in, circular timer when not */}
              {isClocked && currentOpenPunch ? (
                <ElapsedTime
                  startTime={currentOpenPunch.timeIn}
                  onClick={() =>
                    selectedJob && selectedShift
                      ? handleClockInOut(selectedJob, selectedShift)
                      : noop
                  }
                  // Pass shift timing information for accurate progress calculation
                  shiftStartTime={shiftInfo.shiftStartTime}
                  shiftEndTime={shiftInfo.shiftEndTime}
                  shiftDurationMinutes={shiftInfo.shiftDurationMinutes}
                />
              ) : (
                <CircularTimer
                  time={currentTime}
                  isActive={isClocked}
                  onClick={() =>
                    selectedJob && selectedShift
                      ? handleClockInOut(selectedJob, selectedShift)
                      : noop
                  }
                  disabled={
                    loading ||
                    !selectedJob ||
                    !selectedShift ||
                    (!!currentOpenPunch && openPunchOtherJob) ||
                    !shiftInfo.canClockInNow ||
                    hasActiveEventClockIn
                  }
                  // Only pass countdown info - simplified
                  timeUntilShift={shiftInfo.timeUntilShift}
                />
              )}

              {/* Clock Controls - This includes the View Map button */}
              <ClockControls
                currentDate={currentDate}
                totalHours={totalHours}
                openPunchOtherJob={openPunchOtherJob || false}
                openPunchOtherJobTitle={openPunchOtherJobTitle}
                selectedJob={selectedJob}
                isClocked={isClocked}
                userLocation={location}
              />
            </>
          ) : (
            <EventTimerCardContent
              userData={userData}
              isBlockedByJobPunch={isBlockedByJobPunch}
              hasActiveEventClockIn={hasActiveEventClockIn}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
