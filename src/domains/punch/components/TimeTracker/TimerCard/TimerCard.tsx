'use client';

import React, { useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { CircularTimer } from './CircularTimer';
import { ElapsedTime } from './ElapsedTime';
import { JobShiftSelector } from './JobShiftSelector';
import { ClockControls } from './ClockControls';
import { ClockInValidationModal } from '../ClockInValidationModal';
import { useTimerCard } from '@/domains/punch/hooks';
import {
  usePunchViewerStore,
  isPersistedDataValid,
} from '@/domains/punch/stores/punch-viewer-store';
import { PunchWithJobInfo } from '@/domains/punch/types';
import { GignologyUser } from '@/domains/user/types';
import { noop } from '@tanstack/react-query';

interface TimerCardProps {
  userData: GignologyUser;
  openPunches: PunchWithJobInfo[] | undefined;
}

export function TimerCard({ userData, openPunches }: TimerCardProps) {
  const { initializeFromServerData, lastUpdated } = usePunchViewerStore();

  // Initialize store from server data when component mounts or data changes
  useEffect(() => {
    if (openPunches && userData) {
      // Only initialize if we don't have valid persisted data or if server data is newer
      const hasValidPersistedData = isPersistedDataValid(lastUpdated);

      if (!hasValidPersistedData) {
        initializeFromServerData(openPunches, userData);
      }
    }
  }, [openPunches, userData, initializeFromServerData, lastUpdated]);

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
  } = useTimerCard({ userData, openPunches });

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
                false
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
        </CardContent>
      </Card>
    </>
  );
}
