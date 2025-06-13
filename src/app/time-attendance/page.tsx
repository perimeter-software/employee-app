"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  FileText,
  ChevronUp,
} from "lucide-react";
import { useUser } from "@auth0/nextjs-auth0";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/Accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/Dialog";
import Layout from "@/components/layout/Layout";
import { CalendarEvent, Mode } from "@/components/ui/Calendar";
import { generateMockEvents } from "@/lib/utils/mock-calendar-events";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/ToggleGroup";
import CalendarProvider from "@/components/ui/Calendar/CalendarProvider";
import CalendarBody from "@/components/ui/Calendar/Body/CalendarBody";
import CalendarHeaderDate from "@/components/ui/Calendar/Header/Date/CalendarHeaderDate";
import CalendarHeaderActionsMode from "@/components/ui/Calendar/Header/Actions/CalendarHeaderActionsMode";

// Import your stores and hooks
import { usePunchViewerStore } from "@/domains/punch/stores/punch-viewer-store";
import {
  useClockIn,
  useClockOut,
  useAllOpenPunches,
  ClockInData,
} from "@/domains/punch/hooks";
import { useUserApplicantJob } from "@/domains/job/hooks";
import { PunchWithJobInfo } from "@/domains/punch/types";
import { GignologyJob, Shift } from "@/domains/job/types/job.types";
import { GigLocation, Location } from "@/domains/job/types/location.types";
import { handleLocationServices } from "@/lib/utils";

// Mock data for shifts
const shiftsData = [
  {
    id: 1,
    date: "06/05/2025",
    jobTitle: "Redesign Website",
    shiftName: "First Shift",
    startTime: "08:00 AM",
    endTime: "11:00 AM",
    totalHours: 4,
    status: "completed",
  },
  {
    id: 2,
    date: "06/06/2025",
    jobTitle: "Redesign Website",
    shiftName: "First Shift",
    startTime: "----",
    endTime: "----",
    totalHours: 0,
    status: "pending",
  },
  {
    id: 3,
    date: "06/07/2025",
    jobTitle: "Redesign Website",
    shiftName: "First Shift",
    startTime: "----",
    endTime: "----",
    totalHours: 0,
    status: "pending",
  },
  {
    id: 4,
    date: "06/05/2025",
    jobTitle: "Sample Job 2",
    shiftName: "Second Shift",
    startTime: "----",
    endTime: "----",
    totalHours: 0,
    status: "pending",
  },
  {
    id: 5,
    date: "06/06/2025",
    jobTitle: "Sample Job 2",
    shiftName: "Second Shift",
    startTime: "----",
    endTime: "----",
    totalHours: 0,
    status: "pending",
  },
  {
    id: 6,
    date: "06/7/2025",
    jobTitle: "Sample Job 3",
    shiftName: "Third Shift",
    startTime: "----",
    endTime: "----",
    totalHours: 0,
    status: "pending",
  },
];

// Enhanced Circular Timer Component
const CircularTimer = ({
  time,
  isActive,
  onClick,
  disabled,
}: {
  time: string;
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
}) => {
  const circumference = 2 * Math.PI * 45;
  const strokeDasharray = circumference;
  const strokeDashoffset = isActive ? circumference * 0.25 : circumference;

  return (
    <div
      className={`relative w-64 h-64 mx-auto cursor-pointer ${
        disabled ? "opacity-50" : ""
      }`}
      onClick={disabled ? undefined : onClick}
    >
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="45"
          stroke="#40C8FD"
          strokeWidth="8"
          fill="none"
          opacity={0.45}
        />
        <circle
          cx="50"
          cy="50"
          r="45"
          stroke="#40C8FD"
          strokeWidth="8"
          fill="none"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-in-out"
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-base font-bold text-blue-600">{time}</div>
        <div className="text-xl font-semibold text-blue-600 mt-1">
          {isActive ? "CLOCK OUT" : "CLOCK IN"}
        </div>
      </div>
    </div>
  );
};

// Elapsed Time Component
const ElapsedTime = ({
  startTime,
  endTime,
}: {
  startTime: string;
  endTime?: string;
}) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const start = new Date(startTime);
      const end = endTime ? new Date(endTime) : new Date();
      setElapsed(Math.floor((end.getTime() - start.getTime()) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, endTime]);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;

  return (
    <div className="text-center mb-4">
      <div className="text-6xl font-bold text-blue-600">
        {hours.toString().padStart(2, "0")}:
        {minutes.toString().padStart(2, "0")}:
        {seconds.toString().padStart(2, "0")}
      </div>
      <div className="text-sm text-gray-500 mt-2">Elapsed Time</div>
    </div>
  );
};

// Punch Item Component
const PunchItem = ({ punch }: { punch: PunchWithJobInfo }) => {
  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const calculateHours = (start: string, end: string | null) => {
    if (!end) return 0;
    const startTime = new Date(start);
    const endTime = new Date(end);
    return (
      Math.round(
        ((endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)) * 100
      ) / 100
    );
  };

  return (
    <div className="border-b py-3 last:border-b-0">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium">
              {formatTime(punch.timeIn)} -{" "}
              {punch.timeOut ? formatTime(punch.timeOut) : "Active"}
            </span>
            {punch.shiftSlug && (
              <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                {punch.shiftName || punch.shiftSlug}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500">
            Hours:{" "}
            {punch.timeOut
              ? calculateHours(punch.timeIn, punch.timeOut)
              : "In Progress"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">{punch.status}</div>
          {punch.clockInCoordinates && (
            <MapPin className="h-3 w-3 text-gray-400 mt-1" />
          )}
        </div>
      </div>
    </div>
  );
};

// Modal Component using shadcn Dialog
const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) => (
  <Dialog open={isOpen} onOpenChange={onClose}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <div className="py-4">{children}</div>
      {footer && <DialogFooter>{footer}</DialogFooter>}
    </DialogContent>
  </Dialog>
);

// Location Component (placeholder)
const LocationComponent = ({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) => (
  <div className="w-full h-full bg-blue-100 rounded-lg flex items-center justify-center">
    <div className="text-center">
      <MapPin className="h-6 w-6 text-blue-600 mx-auto mb-2" />
      <span className="text-blue-600 text-sm">
        Location: {latitude.toFixed(4)}, {longitude.toFixed(4)}
      </span>
    </div>
  </div>
);

// Main Component
export default function EmployeeTimeTracker() {
  const { user: auth0User, isLoading: auth0Loading } = useUser();

  // Fetch user data with jobs using your existing hook
  const {
    data: userData,
    isLoading: userLoading,
    error: userError,
  } = useUserApplicantJob(auth0User?.email || "");

  console.log("userData: ", userData);

  // Fetch open punches using your existing hook
  const { data: openPunches } = useAllOpenPunches(userData?._id || "");

  // Store state
  const {
    selectedJob,
    selectedShift,
    setSelectedJob,
    setSelectedShift,
    removeSelectedJob,
    removeSelectedShift,
  } = usePunchViewerStore();

  // Local state for UI
  const [currentTime, setCurrentTime] = useState("00:00:00");
  const [isClocked, setIsClocked] = useState(false);
  const [viewType, setViewType] = useState<"table" | "calendar">("table");
  const [currentDate, setCurrentDate] = useState("");
  const [totalHours, setTotalHours] = useState(0);
  const [dateRange, setDateRange] = useState("June 01 - June 07, 2025");
  const [loading, setLoading] = useState(false);
  const [isLocationLoading, setIsLocationLoading] = useState(false);
  const [location, setLocation] = useState<GigLocation | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Modal states
  const [isEarlyClockInModalOpen, setIsEarlyClockInModalOpen] = useState(false);
  const [isNoShiftModalOpen, setIsNoShiftModalOpen] = useState(false);
  const [modalMessages] = useState<string[]>([]);

  // Calendar state
  const [events, setEvents] = useState<CalendarEvent[]>(generateMockEvents());
  const [mode, setMode] = useState<Mode>("month");
  const [date, setDate] = useState<Date>(new Date(2025, 5, 11));

  // Refs for intervals
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get current open punch from the fetched data
  const currentOpenPunch = React.useMemo(() => {
    if (!openPunches || openPunches.length === 0) return null;
    return openPunches.find((punch) => !punch.timeOut) || null;
  }, [openPunches]);

  // Update store with current open punch
  React.useEffect(() => {
    if (currentOpenPunch) {
      // Set the current punch in the store if it exists
      // This would need to be implemented in your store
      // punchStore.setCurrent(currentOpenPunch);
    }
  }, [currentOpenPunch]);

  // Mutations - use actual user ID from fetched data
  const clockInMutation = useClockIn(
    userData?._id || "",
    selectedJob?._id || ""
  );
  const clockOutMutation = useClockOut(
    userData?._id || "",
    selectedJob?._id || ""
  );

  // Computed values
  const blockJobSelection = !!currentOpenPunch;
  const openPunchOtherJob =
    currentOpenPunch && currentOpenPunch.jobId !== selectedJob?._id;
  const openPunchOtherJobTitle = openPunchOtherJob
    ? userData?.jobs?.find((j) => j._id === currentOpenPunch?.jobId)?.title ||
      null
    : null;

  const availableShifts =
    selectedJob?.shifts?.filter(() => {
      // Filter active shifts based on current day/time
      return true; // Simplified for now
    }) || [];

  const enoughLocationInfo =
    location &&
    typeof location.latitude === "number" &&
    typeof location.longitude === "number" &&
    selectedJob?.additionalConfig?.geofence;

  // Filter today's punches from user's job punches
  const todaysPunches: PunchWithJobInfo[] = React.useMemo(() => {
    if (!userData?.jobs || !selectedJob) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const job = userData.jobs.find((j) => j._id === selectedJob._id);
    if (!job?.punches) return [];

    return job.punches
      .filter((punch) => new Date(punch.timeIn) >= today)
      .map((punch) => ({
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

  // Utility functions
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
      // Update elapsed time
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

  const calculateTotalHours = useCallback(() => {
    if (openPunchOtherJob) return 0;

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

    if (currentOpenPunch && currentOpenPunch.jobId === selectedJob?._id) {
      const currentHours =
        (new Date().getTime() - new Date(currentOpenPunch.timeIn).getTime()) /
        (1000 * 60 * 60);
      total += currentHours;
    }

    return Math.round(total * 100) / 100;
  }, [openPunchOtherJob, todaysPunches, currentOpenPunch, selectedJob?._id]);

  const showNotification = (
    message: string,
    type: "success" | "error" | "warning" | "info"
  ) => {
    // Implement your notification system here
    console.log(`${type.toUpperCase()}: ${message}`);
  };

  // Event handlers
  const handleJobSelection = (job: GignologyJob) => {
    if (blockJobSelection) {
      showNotification(
        "Please clock out of your current punch first",
        "warning"
      );
      return;
    }

    setSelectedJob(job);
    removeSelectedShift(); // Clear shift when job changes
  };

  const handleShiftSelection = (shift: Shift) => {
    setSelectedShift(shift);
  };

  const handleClockInOut = async () => {
    if (!selectedJob) {
      showNotification("Please select a job", "error");
      return;
    }

    if (!selectedShift) {
      showNotification("Please select a shift", "error");
      return;
    }

    if (isClocked && currentOpenPunch) {
      // Clock out
      setLoading(true);
      try {
        await clockOutMutation.mutateAsync(currentOpenPunch);
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
    } else {
      // Clock in
      setLoading(true);
      setIsLocationLoading(true);

      try {
        let clockInCoordinates: Location | null = null;

        // Get location if geofencing is enabled
        if (selectedJob.additionalConfig?.geofence) {
          const location = await handleLocationServices();
          clockInCoordinates = location.locationInfo;

          if (!clockInCoordinates) {
            showNotification(
              "Location services failed. Please try again.",
              "error"
            );
            return;
          }
        }

        setIsLocationLoading(false);

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
          timeIn: new Date().toISOString(),
          newStartDate: new Date().toISOString(),
          newEndDate: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), // 8 hours later
          selectedShift,
        };

        await clockInMutation.mutateAsync(clockInData);

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
    }
  };

  const navigateDateRange = (direction: number) => {
    const currentStart = new Date(2025, 5, 1);
    const newStart = new Date(currentStart);
    newStart.setDate(currentStart.getDate() + direction * 7);
    const newEnd = new Date(newStart);
    newEnd.setDate(newStart.getDate() + 6);

    setDateRange(
      `${newStart.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
      })} - ${newEnd.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })}`
    );
  };

  const handleTableClockIn = (shiftId: number) => {
    console.log("Clock in for shift:", shiftId);
  };

  const handleTableClockOut = (shiftId: number) => {
    console.log("Clock out for shift:", shiftId);
  };

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
  }, [isClocked, currentOpenPunch, updateDateTime]);

  useEffect(() => {
    setTotalHours(calculateTotalHours());
  }, [todaysPunches, currentOpenPunch, selectedJob, calculateTotalHours]);

  useEffect(() => {
    // Update clocked status based on open punch
    setIsClocked(
      !!currentOpenPunch && currentOpenPunch.jobId === selectedJob?._id
    );
  }, [currentOpenPunch, selectedJob]);

  // Loading state
  if (auth0Loading || userLoading) {
    return (
      <Layout>
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-96 w-full max-w-md mx-auto" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Layout>
    );
  }

  // Error state
  if (userError) {
    return (
      <Layout>
        <div className="max-w-6xl mx-auto">
          <Card className="p-6">
            <div className="text-center text-red-600">
              Error loading user data. Please refresh the page.
            </div>
          </Card>
        </div>
      </Layout>
    );
  }

  // No user data
  if (!userData) {
    return (
      <Layout>
        <div className="max-w-6xl mx-auto">
          <Card className="p-6">
            <div className="text-center text-gray-600">
              No user data found. Please contact support.
            </div>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Timer Card */}
        <Card className="w-full max-w-md mx-auto shadow-md border-0 rounded-lg">
          {/* Location Display */}
          {isLocationLoading && (
            <Skeleton className="w-full h-12 bg-gray-200" />
          )}

          {location && enoughLocationInfo && (
            <div className="w-full h-[200px] rounded-t-lg shadow-lg">
              <LocationComponent
                latitude={location.latitude || 0}
                longitude={location.longitude || 0}
              />
            </div>
          )}

          <Accordion
            type="single"
            collapsible
            className={`${
              location?.latitude ? "relative -top-5" : ""
            } rounded-lg border-0 bg-white shadow-lg`}
          >
            <AccordionItem value="item-1" className="border-0 rounded-t-xl">
              <div className="p-4">
                {/* Job and Shift Selection */}
                <div className="flex items-center mb-2 p-2 rounded-t-xl">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="bg-slate-100 flex-grow rounded-none text-black text-xl font-medium p-2 border-0 focus-visible:outline-1 focus-visible:outline-blue-600 w-full text-left justify-between"
                        disabled={blockJobSelection}
                        title={
                          blockJobSelection
                            ? "Please clock out open punches first."
                            : "Please select a job."
                        }
                      >
                        {selectedJob?.title || "Select Job"}
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-full">
                      {userData.jobs?.map((job) => (
                        <DropdownMenuItem
                          key={job._id}
                          onClick={() => handleJobSelection(job)}
                        >
                          {job.title}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    onClick={() => console.log("Navigate to documents")}
                    className="ml-2 border-0 focus-visible:outline-1 focus-visible:outline-blue-600"
                    variant="outline"
                    size="sm"
                  >
                    <FileText className="h-7 w-7 text-blue-600" />
                  </Button>
                </div>

                {selectedJob && availableShifts.length > 0 && (
                  <div className="flex items-center mb-2 p-2 rounded-t-xl">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          className="bg-slate-100 flex-grow rounded-none text-black text-xl font-medium p-2 border-0 w-full text-left justify-between"
                          disabled={blockJobSelection}
                          title={
                            blockJobSelection
                              ? "Please clock out open punches first."
                              : "Please select a shift."
                          }
                        >
                          {selectedShift?.shiftName ||
                            selectedShift?.slug ||
                            "Select Shift"}
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-full">
                        {availableShifts.map((shift) => (
                          <DropdownMenuItem
                            key={shift.slug}
                            onClick={() => handleShiftSelection(shift)}
                          >
                            {shift.shiftName || shift.slug}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}

                <CardContent className="p-0">
                  {/* Date and Total Hours */}
                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <span className="text-blue-600">{currentDate}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-blue-600 mr-1">Total Hrs:</span>
                      <Clock className="h-6 w-6 text-blue-600 mr-1" />
                      <span className="text-blue-600">
                        {totalHours.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Timer Display */}
                  {isClocked && currentOpenPunch ? (
                    <div className="mb-4">
                      <ElapsedTime startTime={currentOpenPunch.timeIn} />
                    </div>
                  ) : (
                    <div className="text-center mb-6">
                      <CircularTimer
                        time={currentTime}
                        isActive={isClocked}
                        onClick={handleClockInOut}
                        disabled={
                          loading ||
                          !selectedJob ||
                          !selectedShift ||
                          (!!currentOpenPunch && openPunchOtherJob) ||
                          false
                        }
                      />
                    </div>
                  )}

                  {/* Other Job Punch Warning */}
                  {openPunchOtherJob && openPunchOtherJobTitle && (
                    <div className="flex items-center mb-2">
                      <p className="text-sm w-full">
                        You are clocked in for {openPunchOtherJobTitle}. Select
                        that job from the list to clock out or view punch
                        information.
                      </p>
                    </div>
                  )}

                  {/* Clock In/Out Button */}
                  {loading ? (
                    <Skeleton className="w-full h-12 bg-gray-200" />
                  ) : currentOpenPunch && !openPunchOtherJob ? (
                    <Button
                      onClick={handleClockInOut}
                      disabled={!selectedJob}
                      className="w-full bg-red-600 text-white font-semibold p-2 hover:bg-red-700 shadow-sm focus-visible:outline-1 focus-visible:outline-blue-600 mb-2"
                    >
                      CLOCK OUT
                    </Button>
                  ) : (
                    <Button
                      onClick={handleClockInOut}
                      disabled={
                        !selectedJob ||
                        !selectedShift ||
                        blockJobSelection ||
                        openPunchOtherJob ||
                        false
                      }
                      title={
                        openPunchOtherJob
                          ? "Please clock out open punches first."
                          : !selectedJob || !selectedShift
                          ? "Please select a job and shift."
                          : "Clock In"
                      }
                      className="w-full bg-blue-600 text-white font-semibold p-2 hover:bg-blue-700 shadow-sm focus-visible:outline-1 focus-visible:outline-blue-600 mb-2"
                    >
                      CLOCK IN
                    </Button>
                  )}

                  {/* Accordion Trigger */}
                  <AccordionTrigger
                    className="flex items-center justify-center w-full text-sm font-normal bg-gray-50 text-blue-600 p-2 hover:bg-gray-100 focus-visible:outline-1 focus-visible:outline-blue-600"
                    onClick={() => setExpanded(!expanded)}
                  >
                    {!expanded ? (
                      <>
                        Expand Info <ChevronDown className="h-7 w-7 ml-2" />
                      </>
                    ) : (
                      <>
                        Collapse Info <ChevronUp className="h-7 w-7 ml-2" />
                      </>
                    )}
                  </AccordionTrigger>

                  <AccordionContent>
                    {!openPunchOtherJob && (
                      <div className="space-y-2">
                        {todaysPunches.length > 0 ? (
                          todaysPunches
                            .sort(
                              (a, b) =>
                                new Date(a.timeIn).getTime() -
                                new Date(b.timeIn).getTime()
                            )
                            .map((punch) => (
                              <PunchItem key={punch._id} punch={punch} />
                            ))
                        ) : (
                          <div className="text-center py-4 text-gray-500">
                            No punches today
                          </div>
                        )}
                      </div>
                    )}
                  </AccordionContent>
                </CardContent>
              </div>
            </AccordionItem>
          </Accordion>
        </Card>

        {/* Modals */}
        <Modal
          isOpen={isNoShiftModalOpen}
          onClose={() => setIsNoShiftModalOpen(false)}
          title="No Active Shift"
          footer={
            <Button
              onClick={() => setIsNoShiftModalOpen(false)}
              className="bg-blue-500 text-white hover:bg-blue-600"
            >
              OK
            </Button>
          }
        >
          <div>
            <p>You are not scheduled for any shift currently.</p>
            {selectedJob &&
              selectedJob.shifts &&
              selectedJob.shifts.length > 0 && (
                <p className="mt-3">
                  You have {selectedJob.shifts.length} shift(s) configured for
                  this job, but none are currently active.
                </p>
              )}
          </div>
        </Modal>

        <Modal
          isOpen={isEarlyClockInModalOpen}
          onClose={() => setIsEarlyClockInModalOpen(false)}
          title="Clock-In Confirmation"
          footer={
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setIsEarlyClockInModalOpen(false);
                  handleClockInOut();
                }}
                className="bg-blue-500 text-white hover:bg-blue-600"
              >
                Proceed with Clock-In
              </Button>
              <Button
                onClick={() => setIsEarlyClockInModalOpen(false)}
                variant="outline"
              >
                Cancel Clock-In
              </Button>
            </div>
          }
        >
          <div>
            <ul className="space-y-2">
              {modalMessages.map((message, index) => (
                <li
                  key={index}
                  className="py-1"
                  dangerouslySetInnerHTML={{ __html: message }}
                />
              ))}
            </ul>
          </div>
        </Modal>

        {/* Employee Shifts Section */}
        <Card>
          <CardContent className="p-6">
            {/* Header with integrated calendar controls */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-6 gap-4">
              <div className="flex items-center space-x-4">
                <h2 className="text-xl font-semibold">Employee Shifts</h2>
                {/* Use date range navigation for table view */}
                {viewType === "table" && (
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigateDateRange(-1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-medium min-w-[160px] text-center">
                      {dateRange}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigateDateRange(1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Right side controls */}
              <div className="flex items-center space-x-4">
                {/* Calendar controls when in calendar view */}
                {viewType === "calendar" && (
                  <div className="flex items-center gap-4">
                    <CalendarProvider
                      events={events}
                      setEvents={setEvents}
                      mode={mode}
                      setMode={setMode}
                      date={date}
                      setDate={setDate}
                      calendarIconIsToday={false}
                    >
                      <CalendarHeaderDate />
                    </CalendarProvider>
                    <CalendarProvider
                      events={events}
                      setEvents={setEvents}
                      mode={mode}
                      setMode={setMode}
                      date={date}
                      setDate={setDate}
                      calendarIconIsToday={false}
                    >
                      <div className="flex items-center gap-2">
                        <CalendarHeaderActionsMode />
                      </div>
                    </CalendarProvider>
                  </div>
                )}

                {/* View Toggle */}
                <ToggleGroup
                  type="single"
                  value={viewType}
                  onValueChange={(value) =>
                    value && setViewType(value as "table" | "calendar")
                  }
                  className="flex gap-0 -space-x-px rounded-sm border overflow-hidden shadow-sm shadow-black/5"
                >
                  <ToggleGroupItem
                    value="table"
                    className="rounded-none shadow-none focus-visible:z-10 px-4 py-2"
                  >
                    Table View
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="calendar"
                    className="rounded-none shadow-none focus-visible:z-10 px-4 py-2"
                  >
                    Calendar View
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>

            {/* Content */}
            {viewType === "calendar" ? (
              <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
                <CalendarProvider
                  events={events}
                  setEvents={setEvents}
                  mode={mode}
                  setMode={setMode}
                  date={date}
                  setDate={setDate}
                  calendarIconIsToday={false}
                >
                  <CalendarBody />
                </CalendarProvider>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-medium text-gray-600">
                        Date
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">
                        Job Title
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">
                        Job Shift Name
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">
                        Start - End Time
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">
                        Total Working Hours
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shiftsData.map((shift) => (
                      <tr
                        key={shift.id}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="py-3 px-4 text-sm">{shift.date}</td>
                        <td className="py-3 px-4 text-sm">{shift.jobTitle}</td>
                        <td className="py-3 px-4 text-sm">{shift.shiftName}</td>
                        <td className="py-3 px-4 text-sm">
                          {shift.startTime} to {shift.endTime}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {shift.totalHours > 0
                            ? `${shift.totalHours} Hours`
                            : "0 Hours"}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleTableClockIn(shift.id)}
                              className="border-blue-500 text-blue-500 hover:bg-blue-50"
                            >
                              Clock In
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleTableClockOut(shift.id)}
                              className="border-red-500 text-red-500 hover:bg-red-50"
                            >
                              Clock out
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-4 gap-2">
              <span className="text-sm text-gray-500">
                0 of {shiftsData.length} row(s) selected.
              </span>
              <div className="flex space-x-2">
                <Button variant="ghost" size="sm">
                  Previous
                </Button>
                <Button variant="ghost" size="sm">
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
