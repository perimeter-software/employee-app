"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePunchViewerStore } from "../stores/punch-viewer-store";
import { useClockIn, useClockOut, ClockInData } from "./index";
import { PunchWithJobInfo } from "../types";
import { GignologyJob, Shift } from "@/domains/job/types/job.types";
import { GigLocation, Location } from "@/domains/job/types/location.types";
import { handleLocationServices } from "@/lib/utils";
import { GignologyUser } from "@/domains/user/types";
import { Punch } from "../types";

// Import your shift validation utilities
import {
  getUserShiftForToday,
  handleShiftJobClockInTime,
  getMinutesUntilClockIn,
  getCalculatedTimeIn,
  combineCurrentDateWithTimeFromDateObject,
  getTotalSecondsFromDate,
} from "@/domains/punch/utils/shift-job-utils";

interface UseTimerCardProps {
  userData: GignologyUser;
  openPunches: PunchWithJobInfo[] | undefined;
}

interface ValidationMessage {
  type: "warning" | "error" | "info";
  message: string;
}

export function useTimerCard({ userData, openPunches }: UseTimerCardProps) {
  // Local state for UI
  const [currentTime, setCurrentTime] = useState("00:00:00");
  const [isClocked, setIsClocked] = useState(false);
  const [currentDate, setCurrentDate] = useState("");
  const [totalHours, setTotalHours] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isLocationLoading, setIsLocationLoading] = useState(false);
  const [location, setLocation] = useState<GigLocation | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // New state for validation
  const [validationMessages, setValidationMessages] = useState<
    ValidationMessage[]
  >([]);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [pendingClockIn, setPendingClockIn] = useState(false);

  // Refs for intervals
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Store state
  const {
    selectedJob,
    selectedShift,
    setSelectedJob,
    setSelectedShift,
    removeSelectedJob,
    removeSelectedShift,
  } = usePunchViewerStore();

  // Mutations - use actual user ID from fetched data
  const clockInMutation = useClockIn(
    userData?._id || "",
    selectedJob?._id || ""
  );
  const clockOutMutation = useClockOut(
    userData?._id || "",
    selectedJob?._id || ""
  );

  // Get current open punch from the fetched data
  const currentOpenPunch = useMemo(() => {
    if (!openPunches || openPunches.length === 0) {
      console.log("No open punches data");
      return null;
    }
    const openPunch = openPunches.find((punch) => !punch.timeOut);
    console.log("Current open punch:", openPunch);
    return openPunch || null;
  }, [openPunches]);

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

  // Enhanced shift filtering with validation
  const availableShifts = useMemo(() => {
    if (!selectedJob?.shifts) return [];
    const now = new Date();
    const nowIso = now.toISOString();

    return selectedJob.shifts.filter((shift) => {
      // pull both start+end from your util
      const { start, end } = getUserShiftForToday(
        selectedJob,
        userData.applicantId,
        nowIso,
        shift
      );
      if (!start || !end) return false;

      // rebase BOTH, using start to detect overnight
      // const startToday = new Date(
      //   combineCurrentDateWithTimeFromDateObject(start, nowIso)
      // );

      const endToday = new Date(
        combineCurrentDateWithTimeFromDateObject(end, nowIso, start)
      );

      // keep any shift that hasn’t (yet) passed its end
      return endToday > now;
    });
  }, [selectedJob, userData.applicantId]);

  console.log("availableShifts: ", availableShifts);

  const enoughLocationInfo =
    location &&
    typeof location.latitude === "number" &&
    typeof location.longitude === "number" &&
    selectedJob?.additionalConfig?.geofence;

  // Utility function to show notifications
  const showNotification = useCallback(
    (message: string, type: "success" | "error" | "warning" | "info") => {
      console.log(`${type.toUpperCase()}: ${message}`);
    },
    []
  );

  // NEW: Comprehensive shift validation
  const validateClockIn = useCallback(async (): Promise<{
    isValid: boolean;
    messages: ValidationMessage[];
    canProceed: boolean;
  }> => {
    if (!selectedJob || !selectedShift) {
      return {
        isValid: false,
        messages: [{ type: "error", message: "Please select a job and shift" }],
        canProceed: false,
      };
    }

    const messages: ValidationMessage[] = [];
    const currentTime = new Date().toISOString();
    const now = new Date();

    // Check if user has a shift for today
    const { start, end } = getUserShiftForToday(
      selectedJob,
      userData.applicantId,
      currentTime,
      selectedShift
    );

    if (!start) {
      return {
        isValid: false,
        messages: [
          {
            type: "error",
            message: "You are not scheduled for this shift today.",
          },
        ],
        canProceed: false,
      };
    }

    const newStartDate = combineCurrentDateWithTimeFromDateObject(
      start as Date,
      currentTime
    );

    const newEndDate = combineCurrentDateWithTimeFromDateObject(
      end as Date,
      currentTime,
      start as Date
    );

    const shiftStart = new Date(newStartDate);
    const shiftEnd = new Date(newEndDate);

    // Check if shift has already ended
    if (now > shiftEnd) {
      return {
        isValid: false,
        messages: [
          {
            type: "error",
            message: "This shift has already ended.",
          },
        ],
        canProceed: false,
      };
    }

    // Check if it's too early to clock in
    if (
      !handleShiftJobClockInTime(
        selectedJob,
        userData.applicantId,
        currentTime,
        selectedShift
      )
    ) {
      const minutesUntilClockIn = getMinutesUntilClockIn(
        selectedJob,
        userData.applicantId,
        currentTime,
        selectedShift
      );

      return {
        isValid: false,
        messages: [
          {
            type: "error",
            message: `Too early to clock in. Please wait ${
              minutesUntilClockIn || 0
            } minutes.`,
          },
        ],
        canProceed: false,
      };
    }

    // Check for early clock-in warning
    const earlyClockInMinutes =
      selectedJob.additionalConfig?.earlyClockInMinutes || 0;
    if (earlyClockInMinutes > 0) {
      const earliestAllowedTime = new Date(
        shiftStart.getTime() - earlyClockInMinutes * 60000
      );

      if (now >= earliestAllowedTime && now < shiftStart) {
        messages.push({
          type: "warning",
          message: `⏳ You are clocking in ${Math.ceil(
            (shiftStart.getTime() - now.getTime()) / 60000
          )} minutes before your shift starts. Please confirm this is intended.`,
        });
      }
    }

    // Check for auto clock-out warning
    if (selectedJob.additionalConfig?.autoClockoutShiftEnd) {
      messages.push({
        type: "info",
        message:
          "🔄 This job will automatically clock you out at the end of your shift.",
      });
    }

    // Check if time is past shift end (shouldn't happen due to earlier check, but good to have)
    const timeIn = getCalculatedTimeIn(
      selectedJob,
      userData.applicantId,
      currentTime,
      selectedShift
    );

    const timeInDate = new Date(timeIn);
    const timeInTotalSeconds = getTotalSecondsFromDate(timeInDate);
    let shiftEndTotalSeconds = getTotalSecondsFromDate(shiftEnd);

    if (shiftEndTotalSeconds < timeInTotalSeconds) {
      shiftEndTotalSeconds += 24 * 3600; // Add 24 hours for next day
    }

    if (timeInTotalSeconds > shiftEndTotalSeconds) {
      return {
        isValid: false,
        messages: [
          {
            type: "error",
            message: "The shift has already ended.",
          },
        ],
        canProceed: false,
      };
    }

    return {
      isValid: true,
      messages,
      canProceed:
        messages.length === 0 || messages.every((m) => m.type !== "error"),
    };
  }, [selectedJob, selectedShift, userData.applicantId]);

  // Update date and time
  const updateDateTime = useCallback(() => {
    const now = new Date();
    setCurrentDate(
      now.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
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
        `${hours.toString().padStart(2, "0")}:${minutes
          .toString()
          .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      );
    } else {
      const timeStr = now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      const [time] = timeStr.split(" ");
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
        shiftSlug: punch.shiftSlug || "",
        jobInfo: {
          _id: job._id,
          title: job.title,
          jobSlug: job.jobSlug,
          address: job.address || "",
          companyCity: job.companyCity || "",
          companyState: job.companyState || "",
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
      if (blockJobSelection) {
        showNotification(
          "Please clock out of your current punch first",
          "warning"
        );
        return;
      }

      setSelectedJob(job);
      removeSelectedShift();
    },
    [blockJobSelection, setSelectedJob, removeSelectedShift, showNotification]
  );

  const handleShiftSelection = useCallback(
    (shift: Shift) => {
      setSelectedShift(shift);
    },
    [setSelectedShift]
  );

  // NEW: Separated clock-in logic
  const performClockIn = useCallback(async () => {
    console.log("Performing clock in...");
    setLoading(true);
    setIsLocationLoading(true);
    setPendingClockIn(false);
    setShowValidationModal(false);

    try {
      let clockInCoordinates: Location | null = null;

      if (selectedJob?.additionalConfig?.geofence) {
        const locationResult = await handleLocationServices();
        clockInCoordinates = locationResult.locationInfo;

        if (!clockInCoordinates) {
          showNotification(
            "Location services failed. Please try again.",
            "error"
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
        selectedJob!,
        userData.applicantId,
        currentTime,
        selectedShift!
      );

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
        selectedJob!,
        userData.applicantId,
        currentTime,
        selectedShift!
      );

      const clockInData: ClockInData = {
        clockInCoordinates: clockInCoordinates
          ? {
              latitude: clockInCoordinates.latitude || 0,
              longitude: clockInCoordinates.longitude || 0,
              accuracy: clockInCoordinates.accuracy || 0,
              altitude: clockInCoordinates.altitude || 0,
              altitudeAccuracy: clockInCoordinates.altitudeAccuracy || 0,
              heading: clockInCoordinates.heading || 0,
              speed: clockInCoordinates.speed || 0,
            }
          : {
              latitude: 0,
              longitude: 0,
              accuracy: 0,
              altitude: 0,
              altitudeAccuracy: 0,
              heading: 0,
              speed: 0,
            },
        timeIn,
        newStartDate,
        newEndDate,
        selectedShift: selectedShift!,
        applicantId: userData.applicantId,
      };

      console.log("Clock in data:", clockInData);
      const result = await clockInMutation.mutateAsync(clockInData);
      console.log("Clock in result:", result);

      setIsClocked(true);
      setLocation(clockInCoordinates);
      showNotification("Successfully clocked in", "success");
    } catch (error) {
      console.error("Error clocking in:", error);
      showNotification("Failed to clock in", "error");
    } finally {
      setLoading(false);
      setIsLocationLoading(false);
    }
  }, [
    selectedJob,
    selectedShift,
    userData.applicantId,
    clockInMutation,
    showNotification,
  ]);

  // NEW: Enhanced clock in/out handler with validation
  const handleClockInOut = useCallback(async () => {
    console.log("=== Clock In/Out Attempt ===");
    console.log("currentOpenPunch:", currentOpenPunch);
    console.log("selectedJob:", selectedJob?.title);
    console.log("selectedShift:", selectedShift?.shiftName);

    if (currentOpenPunch) {
      console.log("Attempting to clock out...");
      setLoading(true);

      try {
        const result = await clockOutMutation.mutateAsync(currentOpenPunch);
        console.log("Clock out result:", result);
        setIsClocked(false);
        setLocation(null);
        removeSelectedJob();
        removeSelectedShift();
        showNotification("Successfully clocked out", "success");
      } catch (error) {
        console.error("Error clocking out:", error);
        showNotification("Failed to clock out", "error");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Validate clock-in attempt
    const validation = await validateClockIn();

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
      return;
    }

    // Proceed with clock-in
    await performClockIn();
  }, [
    currentOpenPunch,
    selectedJob?.title,
    selectedShift?.shiftName,
    validateClockIn,
    pendingClockIn,
    performClockIn,
    clockOutMutation,
    removeSelectedJob,
    removeSelectedShift,
    showNotification,
  ]);

  // NEW: Cancel validation modal
  const cancelClockIn = useCallback(() => {
    setShowValidationModal(false);
    setPendingClockIn(false);
    setValidationMessages([]);
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
      console.log("Updating clocked status:", newIsClocked);
      setIsClocked(newIsClocked);
    }
  }, [currentOpenPunch, isClocked]);

  // Initialize store from server data
  useEffect(() => {
    if (!isInitialized && openPunches && userData?.jobs) {
      console.log("Initializing timer card state from server data...");

      if (currentOpenPunch) {
        console.log("Found open punch, setting up state:", currentOpenPunch);

        const punchJob = userData.jobs.find(
          (job: GignologyJob) => job._id === currentOpenPunch.jobId
        );

        if (punchJob) {
          console.log("Setting selected job:", punchJob.title);
          setSelectedJob(punchJob);

          if (currentOpenPunch.shiftSlug && punchJob.shifts) {
            const punchShift = punchJob.shifts.find(
              (shift: Shift) => shift.slug === currentOpenPunch.shiftSlug
            );
            if (punchShift) {
              console.log("Setting selected shift:", punchShift.shiftName);
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
      } else {
        console.log("No open punch found");
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

    // Get actual shift times for today using your utility functions
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

    console.log("shiftStart: ", shiftStart);
    console.log("shiftEnd: ", shiftEnd);

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
      shiftStartTime,
      shiftEndTime,
      shiftDurationMinutes,
    };
  }, [selectedJob, selectedShift, userData.applicantId]);

  return {
    // Existing state
    currentTime,
    isClocked,
    currentDate,
    totalHours,
    loading,
    isLocationLoading,
    location,
    isInitialized,
    selectedJob,
    selectedShift,
    currentOpenPunch,
    todaysPunches,
    blockJobSelection,
    openPunchOtherJob,
    openPunchOtherJobTitle,
    availableShifts,
    enoughLocationInfo,
    shiftInfo,

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
  };
}
