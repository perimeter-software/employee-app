'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePunchViewerStore } from '../stores/punch-viewer-store';
import { useClockIn, useClockOut, ClockInData } from './index';
import { PunchWithJobInfo } from '../types';
import { GignologyJob, Shift } from '@/domains/job/types/job.types';
import { GigLocation, Location } from '@/domains/job/types/location.types';
import { handleLocationServices } from '@/lib/utils';
import { GignologyUser } from '@/domains/user/types';
import { Punch } from '../types';
import { toast } from 'sonner';
import { userQueryKeys } from '@/domains/user/services';

import { format, parseISO, startOfDay, isAfter } from 'date-fns';
// Import your shift validation utilities
import {
  getUserShiftForToday,
  getCalculatedTimeIn,
  combineCurrentDateWithTimeFromDateObject,
  handleShiftJobClockInTime,
} from '@/domains/punch/utils/shift-job-utils';

interface UseTimerCardProps {
  userData: GignologyUser;
  openPunches: PunchWithJobInfo[] | undefined;
}

interface ValidationMessage {
  type: 'warning' | 'error' | 'info';
  message: string;
}

export function useTimerCard({ userData, openPunches }: UseTimerCardProps) {
  // Local state for UI
  const [currentTime, setCurrentTime] = useState('00:00:00');
  const [isClocked, setIsClocked] = useState(false);
  const [currentDate, setCurrentDate] = useState('');
  const [totalHours, setTotalHours] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isLocationLoading, setIsLocationLoading] = useState(false);
  const [location, setLocation] = useState<GigLocation | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [pendingOverrideJob, setPendingOverrideJob] =
    useState<GignologyJob | null>(null);
  const [pendingOverrideShift, setPendingOverrideShift] =
    useState<Shift | null>(null);

  // New state for validation
  const [validationMessages, setValidationMessages] = useState<
    ValidationMessage[]
  >([]);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [pendingClockIn, setPendingClockIn] = useState(false);

  // Refs for intervals
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Query client for cache invalidation
  const queryClient = useQueryClient();

  // Store state
  const {
    selectedJob,
    selectedShift,
    setSelectedJob,
    setSelectedShift,
    removeSelectedJob,
    removeSelectedShift,
  } = usePunchViewerStore();

  // Validation effect: Clear stale job/shift selections when user data changes
  useEffect(() => {
    // If we have a selected job but it's not in the current user's jobs, clear it
    if (selectedJob && userData?.jobs) {
      const jobExists = userData.jobs.some(
        (job) => job._id === selectedJob._id
      );
      if (!jobExists) {
        removeSelectedJob();
        removeSelectedShift(); // Also clear shift since job is invalid
      }
    }

    // If we have a selected shift but it's not in the selected job's shifts, clear it
    if (selectedShift && selectedJob?.shifts) {
      const shiftExists = selectedJob.shifts.some(
        (shift) => shift.slug === selectedShift.slug
      );
      if (!shiftExists) {
        removeSelectedShift();
      }
    }
  }, [
    userData?.jobs,
    selectedJob,
    selectedShift,
    removeSelectedJob,
    removeSelectedShift,
  ]);

  // Get current open punch from the fetched data
  const currentOpenPunch = useMemo(() => {
    if (!openPunches || openPunches.length === 0) {
      return null;
    }
    const openPunch = openPunches.find((punch) => !punch.timeOut);
    return openPunch || null;
  }, [openPunches]);

  // Mutations - use actual user ID from fetched data
  const clockInMutation = useClockIn(userData?._id || ''); // Remove job ID
  const clockOutMutation = useClockOut(userData?._id || ''); // Remove job ID

  // Computed values
  const blockJobSelection = !!currentOpenPunch;

  const openPunchOtherJob = useMemo(() => {
    if (!currentOpenPunch) return false;
    if (!selectedJob) return false;
    return currentOpenPunch.jobId !== selectedJob._id;
  }, [currentOpenPunch, selectedJob]);

  const openPunchOtherJobTitle = openPunchOtherJob
    ? userData?.jobs?.find(
        (j: GignologyJob) => j._id === currentOpenPunch?.jobId
      )?.title || null
    : null;

  // Enhanced shift filtering: include shifts for today (with end time check) or upcoming (future roster date / shift start)
  const availableShifts = useMemo(() => {
    if (!selectedJob?.shifts) return [];
    const now = new Date();
    const currentTime = format(now, "yyyy-MM-dd'T'HH:mm:ss.SSS");
    const todayStart = startOfDay(now);
    const applicantId = userData?.applicantId ?? '';

    return selectedJob.shifts.filter((shift) => {
      const startStr = shift.shiftStartDate;
      const endStr = shift.shiftEndDate;
      if (!startStr || !endStr) return false;

      // 1) Today: employee has this shift today and it hasn't ended
      const { start, end } = getUserShiftForToday(
        selectedJob,
        applicantId,
        currentTime,
        shift
      );
      if (start && end) {
        const shiftEndTime = combineCurrentDateWithTimeFromDateObject(
          end as Date,
          currentTime,
          start as Date
        );
        if (shiftEndTime > now) return true;
      }

      // 2) Upcoming: employee is in roster, shift hasn't ended, and (shift starts after today OR has roster assignment on a future date)
      const isInRoster = shift.shiftRoster?.some(
        (rosterEntry) => rosterEntry._id === applicantId
      );
      if (!isInRoster) return false;
      try {
        const shiftStartDay = startOfDay(parseISO(startStr));
        const shiftEndDay = startOfDay(parseISO(endStr));
        if (shiftEndDay < todayStart) return false; // shift already ended
        if (isAfter(shiftStartDay, todayStart)) return true;
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
        for (const day of days) {
          const roster = shift.defaultSchedule?.[day]?.roster;
          if (!Array.isArray(roster)) continue;
          for (const entry of roster) {
            if (entry && typeof entry === 'object' && 'employeeId' in entry && 'date' in entry) {
              const e = entry as { employeeId: string; date: string };
              if (e.employeeId === applicantId && e.date) {
                const rosterDay = startOfDay(parseISO(e.date));
                if (isAfter(rosterDay, todayStart)) return true;
              }
            }
          }
        }
      } catch {
        // skip invalid dates
      }
      return false;
    });
  }, [selectedJob, userData?.applicantId]);

  const enoughLocationInfo =
    location &&
    typeof location.latitude === 'number' &&
    typeof location.longitude === 'number' &&
    selectedJob?.additionalConfig?.geofence;

  // Utility function to show notifications
  const showNotification = useCallback(
    (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
      switch (type) {
        case 'success':
          toast.success(message);
          break;
        case 'error':
          toast.error(message);
          break;
        case 'warning':
          toast.warning(message);
          break;
        case 'info':
          toast.info(message);
          break;
        default:
          toast(message);
      }
    },
    []
  );

  // Utility function to refresh user data (invalidate cache)
  const refreshUserData = useCallback(async () => {
    console.log('🔄 Refreshing user data to get latest schedule...');
    await queryClient.invalidateQueries({ queryKey: userQueryKeys.current() });
    toast.info('Schedule refreshed from server');
  }, [queryClient]);

  const validateClockIn = useCallback(
    async (
      jobToValidate?: GignologyJob,
      shiftToValidate?: Shift
    ): Promise<{
      isValid: boolean;
      messages: ValidationMessage[];
      canProceed: boolean;
    }> => {
      // Use provided params or fall back to selected ones
      const jobToUse = jobToValidate || selectedJob;
      const shiftToUse = shiftToValidate || selectedShift;

      if (!jobToUse || !shiftToUse) {
        return {
          isValid: false,
          messages: [
            { type: 'error', message: 'Please select a job and shift' },
          ],
          canProceed: false,
        };
      }

      const messages: ValidationMessage[] = [];
      const currentTime = new Date().toISOString();

      console.log('🚨 VALIDATION MISMATCH DEBUG');
      console.log('Using job:', jobToUse.title);
      console.log(
        'Using shift:',
        shiftToUse.shiftName,
        'slug:',
        shiftToUse.slug
      );

      // FIXED: Use the same logic as shift-job-utils.ts - check if we can clock in right now
      const canClockInNow = handleShiftJobClockInTime(
        jobToUse,
        userData.applicantId,
        currentTime,
        shiftToUse
      );

      console.log(
        '💥 VALIDATION handleShiftJobClockInTime returned:',
        canClockInNow
      );

      if (!canClockInNow) {
        return {
          isValid: false,
          messages: [
            {
              type: 'error',
              message: 'You are not scheduled for this shift right now.',
            },
          ],
          canProceed: false,
        };
      }

      // Get proper shift times using the working utility functions
      const { start, end } = getUserShiftForToday(
        jobToUse,
        userData.applicantId,
        currentTime,
        shiftToUse
      );

      console.log('💥 VALIDATION getUserShiftForToday returned:', {
        start,
        end,
      });

      if (!start) {
        return {
          isValid: false,
          messages: [
            {
              type: 'error',
              message: 'You are not scheduled for this shift right now.',
            },
          ],
          canProceed: false,
        };
      }

      console.log('=== VALIDATION PASSED - ALLOWING CLOCK IN ===');

      // Check for auto clock-out warning
      if (jobToUse.additionalConfig?.autoClockoutShiftEnd) {
        messages.push({
          type: 'info',
          message:
            '🔄 This job will automatically clock you out at the end of your shift.',
        });
      }

      return {
        isValid: true,
        messages,
        canProceed: true, // Always true since we passed validation
      };
    },
    [selectedJob, selectedShift, userData.applicantId]
  );

  // Update date and time
  const updateDateTime = useCallback(() => {
    const now = new Date();
    setCurrentDate(
      now.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    );

    if (isClocked && currentOpenPunch) {
      const elapsed = Math.floor(
        (now.getTime() - new Date(currentOpenPunch.timeIn).getTime()) / 1000
      );
      const hours = Math.floor(elapsed / 3600);
      const minutes = Math.floor((elapsed % 3600) / 60);
      const seconds = elapsed % 60;
      setCurrentTime(
        `${hours.toString().padStart(2, '0')}:${minutes
          .toString()
          .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    } else {
      const timeStr = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      const [time] = timeStr.split(' ');
      setCurrentTime(time);
    }
  }, [isClocked, currentOpenPunch]);

  // Filter today's punches from user's job punches
  const todaysPunches: PunchWithJobInfo[] = useMemo(() => {
    if (!userData?.jobs || !selectedJob) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const job = userData.jobs.find(
      (j: GignologyJob) => j._id === selectedJob._id
    );
    if (!job?.punches) return [];

    return job.punches
      .filter((punch: Punch) => new Date(punch.timeIn) >= today)
      .map((punch: Punch) => ({
        ...punch,
        shiftSlug: punch.shiftSlug || '',
        jobInfo: {
          _id: job._id,
          title: job.title,
          jobSlug: job.jobSlug,
          address: job.address || '',
          companyCity: job.companyCity || '',
          companyState: job.companyState || '',
          zip: job.zip || 0,
          additionalConfig: job.additionalConfig,
        },
      }));
  }, [userData?.jobs, selectedJob]);

  // Calculate total hours
  const calculateTotalHours = useCallback(() => {
    if (openPunchOtherJob) return 0;

    // Calculate completed punches for today
    let total = todaysPunches.reduce((sum, punch) => {
      if (punch.timeOut) {
        const hours =
          (new Date(punch.timeOut).getTime() -
            new Date(punch.timeIn).getTime()) /
          (1000 * 60 * 60);
        return sum + hours;
      }
      return sum;
    }, 0);

    // Add current active session if there's an open punch
    if (currentOpenPunch && currentOpenPunch.jobId === selectedJob?._id) {
      const now = new Date();
      const punchStart = new Date(currentOpenPunch.timeIn);
      const currentHours =
        (now.getTime() - punchStart.getTime()) / (1000 * 60 * 60);
      total += currentHours;
    }

    return total;
  }, [openPunchOtherJob, todaysPunches, currentOpenPunch, selectedJob?._id]);

  // Event handlers
  const handleJobSelection = useCallback(
    (job: GignologyJob) => {
      // if (blockJobSelection) {
      //   showNotification(
      //     'Please clock out of your current punch first',
      //     'warning'
      //   );
      //   return;
      // }

      setSelectedJob(job);
      removeSelectedShift();
    },
    [setSelectedJob, removeSelectedShift]
  );

  const handleShiftSelection = useCallback(
    (shift: Shift) => {
      setSelectedShift(shift);
    },
    [setSelectedShift]
  );

  const performClockIn = useCallback(
    async (jobToUse?: GignologyJob | null, shiftToUse?: Shift | null) => {
      // Priority order: direct params → pending override → selected
      const targetJob = jobToUse || pendingOverrideJob || selectedJob;
      const targetShift = shiftToUse || pendingOverrideShift || selectedShift;

      if (!targetJob || !targetShift) {
        showNotification('Please select a job and shift', 'error');
        return;
      }

      setLoading(true);
      setIsLocationLoading(true);
      setPendingClockIn(false);
      setShowValidationModal(false);

      try {
        let clockInCoordinates: Location | null = null;

        if (targetJob?.additionalConfig?.geofence) {
          const locationResult = await handleLocationServices();
          clockInCoordinates = locationResult.locationInfo;

          if (!clockInCoordinates) {
            showNotification(
              'Location services failed. Please try again.',
              'error'
            );
            setIsLocationLoading(false);
            setLoading(false);
            return;
          }
        }

        setIsLocationLoading(false);

        // Use your shift validation utilities to get proper times
        const currentTime = new Date().toISOString();
        const { start, end } = getUserShiftForToday(
          targetJob,
          userData.applicantId,
          currentTime,
          targetShift
        );

        // Use the proper function to combine current date with shift times
        const newStartDate = combineCurrentDateWithTimeFromDateObject(
          start as Date,
          currentTime
        );
        const newEndDate = combineCurrentDateWithTimeFromDateObject(
          end as Date,
          currentTime,
          start as Date
        );

        const timeIn = getCalculatedTimeIn(
          targetJob,
          userData.applicantId,
          currentTime,
          targetShift
        );

        // Convert dates to ISO strings
        const startDateISO = newStartDate.toISOString();
        const endDateISO = newEndDate.toISOString();

        const clockInData: ClockInData = {
          jobId: targetJob._id,
          clockInCoordinates:
            clockInCoordinates &&
            clockInCoordinates.latitude !== null &&
            clockInCoordinates.longitude !== null &&
            clockInCoordinates.latitude !== 0 &&
            clockInCoordinates.longitude !== 0 &&
            typeof clockInCoordinates.latitude === 'number' &&
            typeof clockInCoordinates.longitude === 'number' &&
            !isNaN(clockInCoordinates.latitude) &&
            !isNaN(clockInCoordinates.longitude)
              ? {
                  latitude: clockInCoordinates.latitude,
                  longitude: clockInCoordinates.longitude,
                  accuracy: clockInCoordinates.accuracy || 0,
                  altitude: clockInCoordinates.altitude || null,
                  altitudeAccuracy: clockInCoordinates.altitudeAccuracy || null,
                  heading: clockInCoordinates.heading || null,
                  speed: clockInCoordinates.speed || null,
                }
              : undefined, // Don't include coordinates property if invalid
          timeIn,
          newStartDate: startDateISO,
          newEndDate: endDateISO,
          selectedShift: targetShift,
          applicantId: userData.applicantId,
        };

        await clockInMutation.mutateAsync(clockInData);

        setIsClocked(true);
        setLocation(clockInCoordinates);

        // Update store state to the target job/shift
        if (targetJob._id !== selectedJob?._id) {
          setSelectedJob(targetJob);
        }
        if (targetShift.slug !== selectedShift?.slug) {
          setSelectedShift(targetShift);
        }

        // Clear pending override values after successful clock-in
        setPendingOverrideJob(null);
        setPendingOverrideShift(null);

        // showNotification('Successfully clocked in', 'success');
      } catch (error) {
        console.error('Error clocking in:', error);
        showNotification('Failed to clock in', 'error');
      } finally {
        setLoading(false);
        setIsLocationLoading(false);
      }
    },
    [
      selectedJob,
      selectedShift,
      pendingOverrideJob,
      pendingOverrideShift,
      userData.applicantId,
      clockInMutation,
      showNotification,
      setSelectedJob,
      setSelectedShift,
    ]
  );

  // 3. UPDATE the existing handleClockInOut function to accept optional parameters:
  const handleClockInOut = useCallback(
    async (overrideJob?: GignologyJob, overrideShift?: Shift) => {
      // Use provided job/shift or fall back to selected ones
      const jobToUse = overrideJob || selectedJob;
      const shiftToUse = overrideShift || selectedShift;

      if (currentOpenPunch) {
        setLoading(true);

        try {
          await clockOutMutation.mutateAsync(currentOpenPunch);
          setIsClocked(false);
          setLocation(null);

          // Clear selections after successful clock out
          removeSelectedJob();
          removeSelectedShift();

          // showNotification('Successfully clocked out', 'success');
        } catch (error) {
          console.error('Error clocking out:', error);
          showNotification('Failed to clock out', 'error');
        } finally {
          setLoading(false);
        }
        return;
      }

      // For clock-in, validate using the provided or selected job/shift
      const validation = await validateClockIn(
        jobToUse || undefined,
        shiftToUse || undefined
      );

      if (!validation.isValid) {
        validation.messages.forEach((msg) => {
          showNotification(msg.message, msg.type);
        });
        return;
      }

      // If there are warnings, show modal for confirmation
      if (validation.messages.length > 0 && !pendingClockIn) {
        setValidationMessages(validation.messages);
        setShowValidationModal(true);
        setPendingClockIn(true);

        // Store the override job/shift for when user confirms
        setPendingOverrideJob(overrideJob || null);
        setPendingOverrideShift(overrideShift || null);
        return;
      }

      // Proceed with clock-in using the provided job/shift
      await performClockIn(jobToUse || undefined, shiftToUse || undefined);
    },
    [
      currentOpenPunch,
      selectedJob,
      selectedShift,
      validateClockIn,
      pendingClockIn,
      performClockIn,
      clockOutMutation,
      removeSelectedJob,
      removeSelectedShift,
      showNotification,
    ]
  );

  // NEW: Cancel validation modal
  const cancelClockIn = useCallback(() => {
    setShowValidationModal(false);
    setPendingClockIn(false);
    setValidationMessages([]);
    setPendingOverrideJob(null);
    setPendingOverrideShift(null);
  }, []);

  // Effects
  useEffect(() => {
    updateDateTime();
    timerIntervalRef.current = setInterval(() => {
      updateDateTime();
    }, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [updateDateTime]);

  useEffect(() => {
    if (isClocked && currentOpenPunch) {
      const interval = setInterval(() => {
        setTotalHours(calculateTotalHours());
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setTotalHours(calculateTotalHours());
    }
  }, [calculateTotalHours, isClocked, currentOpenPunch]);

  useEffect(() => {
    const newIsClocked = !!currentOpenPunch;
    if (newIsClocked !== isClocked) {
      setIsClocked(newIsClocked);
    }
  }, [currentOpenPunch, isClocked]);

  // Initialize store from server data
  useEffect(() => {
    if (!isInitialized && openPunches && userData?.jobs) {
      if (currentOpenPunch) {
        const punchJob = userData.jobs.find(
          (job: GignologyJob) => job._id === currentOpenPunch.jobId
        );

        if (punchJob) {
          setSelectedJob(punchJob);

          if (currentOpenPunch.shiftSlug && punchJob.shifts) {
            const punchShift = punchJob.shifts.find(
              (shift: Shift) => shift.slug === currentOpenPunch.shiftSlug
            );
            if (punchShift) {
              setSelectedShift(punchShift);
            }
          }

          if (currentOpenPunch.clockInCoordinates) {
            setLocation({
              latitude: currentOpenPunch.clockInCoordinates.latitude,
              longitude: currentOpenPunch.clockInCoordinates.longitude,
              accuracy: currentOpenPunch.clockInCoordinates.accuracy,
              altitude: currentOpenPunch.clockInCoordinates.altitude,
              altitudeAccuracy:
                currentOpenPunch.clockInCoordinates.altitudeAccuracy,
              heading: currentOpenPunch.clockInCoordinates.heading,
              speed: currentOpenPunch.clockInCoordinates.speed,
            });
          }
        }
      }

      setIsInitialized(true);
    }
  }, [
    openPunches,
    userData?.jobs,
    currentOpenPunch,
    isInitialized,
    setSelectedJob,
    setSelectedShift,
  ]);

  const shiftInfo = useMemo(() => {
    if (!selectedJob || !selectedShift) {
      return {
        timeUntilShift: undefined,
        shiftStartTime: undefined,
        shiftEndTime: undefined,
        shiftDurationMinutes: undefined,
      };
    }

    const now = new Date();
    const currentTime = now.toISOString();

    const { start, end } = getUserShiftForToday(
      selectedJob,
      userData.applicantId,
      currentTime,
      selectedShift
    );

    if (!start || !end) {
      return {
        timeUntilShift: undefined,
        shiftStartTime: undefined,
        shiftEndTime: undefined,
        shiftDurationMinutes: undefined,
      };
    }

    // Use the proper function to combine current date with shift times
    const shiftStartTime = combineCurrentDateWithTimeFromDateObject(
      start as Date,
      currentTime
    );
    const shiftEndTime = combineCurrentDateWithTimeFromDateObject(
      end as Date,
      currentTime,
      start as Date
    );

    const shiftStart = new Date(shiftStartTime);
    const shiftEnd = new Date(shiftEndTime);

    // Calculate shift duration in minutes
    const shiftDurationMinutes = Math.floor(
      (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60)
    );

    // Calculate minutes until shift starts (only if not started yet)
    let timeUntilShift: number | undefined;
    if (now < shiftStart) {
      timeUntilShift = Math.floor(
        (shiftStart.getTime() - now.getTime()) / (1000 * 60)
      );
    }

    return {
      timeUntilShift,
      shiftStartTime: shiftStartTime.toISOString(),
      shiftEndTime: shiftEndTime.toISOString(),
      shiftDurationMinutes,
    };
  }, [selectedJob, selectedShift, userData.applicantId]);

  // Memoize location object to prevent unnecessary rerenders
  const memoizedLocation = useMemo(() => {
    if (!location) return null;
    return {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      altitude: location.altitude,
      altitudeAccuracy: location.altitudeAccuracy,
      heading: location.heading,
      speed: location.speed,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    location?.latitude,
    location?.longitude,
    location?.accuracy,
    location?.altitude,
    location?.altitudeAccuracy,
    location?.heading,
    location?.speed,
  ]);

  // Memoize selectedJob and selectedShift
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedSelectedJob = useMemo(() => selectedJob, [selectedJob?._id]);
  const memoizedSelectedShift = useMemo(
    () => selectedShift,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedShift?.slug]
  );

  return {
    // Existing state
    currentTime,
    isClocked,
    currentDate,
    totalHours,
    loading,
    isLocationLoading,
    location: memoizedLocation,
    isInitialized,
    selectedJob: memoizedSelectedJob,
    selectedShift: memoizedSelectedShift,
    currentOpenPunch,
    todaysPunches,
    blockJobSelection,
    openPunchOtherJob,
    openPunchOtherJobTitle,
    availableShifts,
    enoughLocationInfo,
    shiftInfo,
    pendingOverrideJob,
    pendingOverrideShift,

    // NEW: Validation state and handlers
    validationMessages,
    showValidationModal,
    cancelClockIn,
    performClockIn,

    // Existing handlers
    handleJobSelection,
    handleShiftSelection,
    handleClockInOut,
    showNotification,
    refreshUserData,
  };
}
