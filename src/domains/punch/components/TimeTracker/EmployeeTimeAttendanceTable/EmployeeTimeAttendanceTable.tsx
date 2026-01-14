'use client';

import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table } from '@/components/ui/Table';
import { TableColumn } from '@/components/ui/Table/types';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/ToggleGroup';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  format,
} from 'date-fns';
import { useCompanyWorkWeek } from '@/domains/shared/hooks/use-company-work-week';
import type { GignologyJob, Shift } from '@/domains/job/types/job.types';
import CalendarProvider from '@/components/ui/Calendar/CalendarProvider';
import Calendar from '@/components/ui/Calendar/Calendar';
import type { CalendarEvent, Mode } from '@/components/ui/Calendar';

interface EmployeePunch extends Record<string, unknown> {
  _id: string;
  userId: string;
  applicantId: string;
  jobId: string;
  timeIn: string;
  timeOut: string | null;
  status: string;
  shiftSlug?: string;
  shiftName?: string;
  employeeName: string;
  employeeEmail: string;
  jobTitle: string;
  jobSite: string;
  location: string;
  isSelected?: boolean;
  checkbox?: unknown;
  date?: unknown;
  employee?: unknown;
  timeRange?: unknown;
  totalHours?: unknown;
}

interface EmployeeTimeAttendanceTableProps {
  startDate?: string;
  endDate?: string;
}

// Format time as 24-hour format (HH:mm)
const formatTime24 = (dateString: string) => {
  const date = new Date(dateString);
  return format(date, 'HH:mm');
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return format(date, 'yyyy-MM-dd');
};

const calculateTotalHours = (timeIn: string, timeOut: string | null) => {
  if (!timeOut) {
    // Active punch - calculate from timeIn to now
    const start = new Date(timeIn).getTime();
    const now = new Date().getTime();
    const hours = (now - start) / (1000 * 60 * 60);
    return Math.round(hours * 10) / 10; // One decimal place
  }
  const start = new Date(timeIn).getTime();
  const end = new Date(timeOut).getTime();
  const hours = (end - start) / (1000 * 60 * 60);
  return Math.round(hours * 10) / 10; // One decimal place
};

async function fetchEmployeePunches(
  startDate: string,
  endDate: string,
  jobIds?: string[],
  shiftSlug?: string
) {
  const response = await fetch('/api/punches/employees', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate,
      endDate,
      jobIds: jobIds && jobIds.length > 0 ? jobIds : undefined,
      shiftSlug: shiftSlug && shiftSlug !== 'all' ? shiftSlug : undefined,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch employee punches');
  }

  const data = await response.json();
  return data.data as EmployeePunch[];
}

async function fetchActiveEmployeeCount(jobIds?: string[], shiftSlug?: string) {
  const response = await fetch('/api/punches/employees/active-count', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jobIds: jobIds && jobIds.length > 0 ? jobIds : undefined,
      shiftSlug: shiftSlug && shiftSlug !== 'all' ? shiftSlug : undefined,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch active employee count');
  }

  const data = await response.json();
  return data.data.count as number;
}

async function fetchJobsWithShifts() {
  const response = await fetch('/api/jobs/with-shifts', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch jobs with shifts');
  }

  const data = await response.json();
  return data.data as GignologyJob[];
}

async function fetchJobShifts(jobId: string): Promise<Shift[]> {
  const response = await fetch(`/api/jobs/${jobId}/shifts`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch job shifts');
  }

  const data = await response.json();
  return (data.data.shifts || []) as Shift[];
}

export function EmployeeTimeAttendanceTable({
  startDate: propStartDate,
  endDate: propEndDate,
}: EmployeeTimeAttendanceTableProps) {
  const { weekStartsOn, isLoading: companyLoading } = useCompanyWorkWeek();

  // View type state
  const [viewType, setViewType] = useState<'table' | 'month' | 'week' | 'day'>(
    'table'
  );

  // Calendar mode state (for calendar views)
  const [calendarMode, setCalendarMode] = useState<Mode>('month');
  const [calendarDate, setCalendarDate] = useState<Date>(() => {
    const now = new Date();
    if (viewType === 'day') {
      return startOfDay(now); // Use startOfDay to normalize
    } else if (viewType === 'week' || viewType === 'table') {
      return startOfWeek(now, { weekStartsOn: weekStartsOn || 0 });
    } else {
      return startOfMonth(now);
    }
  });

  // Selected job state
  const [selectedJobId, setSelectedJobId] = useState<string>('all');

  // Selected shift state
  const [selectedShiftSlug, setSelectedShiftSlug] = useState<string>('all');

  // Base date for navigation
  const [baseDate, setBaseDate] = useState(() => {
    const now = new Date();
    if (viewType === 'day') {
      return now;
    } else if (viewType === 'week' || viewType === 'table') {
      return startOfWeek(now, { weekStartsOn: weekStartsOn || 0 });
    } else {
      return startOfMonth(now);
    }
  });

  // Fetch all jobs with shifts
  const { data: availableJobs = [], isLoading: jobsLoading } = useQuery<
    GignologyJob[]
  >({
    queryKey: ['jobsWithShifts'],
    queryFn: fetchJobsWithShifts,
    enabled: !companyLoading,
    staleTime: 300000, // Consider data fresh for 5 minutes (jobs don't change often)
  });

  // Get selected job
  const selectedJob = useMemo(() => {
    if (selectedJobId === 'all') {
      return null;
    }
    return availableJobs.find((job) => job._id === selectedJobId);
  }, [selectedJobId, availableJobs]);

  // Check if selected job already has shifts
  const selectedJobHasShifts = useMemo(() => {
    return selectedJob?.shifts && selectedJob.shifts.length > 0;
  }, [selectedJob]);

  // Fetch shifts for selected job (only if not already in job data)
  const { data: jobShifts = [], isLoading: shiftsLoading } = useQuery({
    queryKey: ['jobShifts', selectedJobId],
    queryFn: () => fetchJobShifts(selectedJobId),
    enabled:
      !companyLoading && selectedJobId !== 'all' && !selectedJobHasShifts, // Only fetch if shifts not in job data
  });

  // Get available shifts for selected job (from fetched shifts or job data)
  const availableShifts = useMemo(() => {
    if (selectedJobId === 'all') {
      return [];
    }
    // Use fetched shifts if available, otherwise fall back to job.shifts
    if (jobShifts.length > 0) {
      return jobShifts;
    }
    if (selectedJob?.shifts) {
      return selectedJob.shifts;
    }
    return [];
  }, [selectedJobId, selectedJob, jobShifts]);

  // Reset shift when job changes
  useEffect(() => {
    if (selectedJobId === 'all') {
      setSelectedShiftSlug('all');
    } else if (selectedJob && availableShifts.length > 0) {
      // Keep current shift if it exists in the new job, otherwise reset
      setSelectedShiftSlug((currentShift) => {
        const shiftExists = availableShifts.some(
          (shift) => shift.slug === currentShift
        );
        return shiftExists ? currentShift : 'all';
      });
    } else {
      setSelectedShiftSlug('all');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId, selectedJob, availableShifts]);

  // Get selected job IDs for filtering - use stable string key for query
  const selectedJobIds = useMemo(() => {
    if (selectedJobId === 'all') {
      return availableJobs.map((job) => job._id);
    }
    return [selectedJobId];
  }, [selectedJobId, availableJobs]);

  // Create stable string key for query (prevents unnecessary refetches)
  const selectedJobIdsKey = useMemo(() => {
    return selectedJobIds.sort().join(',');
  }, [selectedJobIds]);

  // Calculate date range based on view type
  const dateRange = useMemo(() => {
    if (propStartDate && propEndDate) {
      return {
        startDate: propStartDate,
        endDate: propEndDate,
        displayRange: `${format(new Date(propStartDate), 'MMM d')} - ${format(new Date(propEndDate), 'MMM d, yyyy')}`,
      };
    }

    let start: Date;
    let end: Date;
    let displayRange: string;

    if (viewType === 'day') {
      // For day view, use calendarDate (what the calendar is showing) to ensure consistency
      const dateToUse = calendarDate || baseDate;
      
      // Use startOfDay to normalize the date to midnight in local time
      const normalizedDate = startOfDay(dateToUse);
      
      // Create start and end boundaries for the local day
      const localStart = new Date(normalizedDate);
      const localEnd = new Date(normalizedDate);
      localEnd.setHours(23, 59, 59, 999);
      
      // Convert local day boundaries to UTC for API
      // The API expects UTC, but we want to query for events that occur during the LOCAL day
      // So we convert: local midnight -> UTC, local 23:59:59 -> UTC
      start = new Date(localStart.toISOString());
      end = new Date(localEnd.toISOString());
      
      displayRange = format(normalizedDate, 'MMM d, yyyy');
    } else if (viewType === 'week' || viewType === 'table') {
      start = startOfWeek(baseDate, { weekStartsOn: weekStartsOn || 0 });
      start.setHours(0, 0, 0, 0);
      end = endOfWeek(baseDate, { weekStartsOn: weekStartsOn || 0 });
      end.setHours(23, 59, 59, 999);
      displayRange = `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
    } else {
      // Month view
      start = startOfMonth(baseDate);
      start.setHours(0, 0, 0, 0);
      end = endOfMonth(baseDate);
      end.setHours(23, 59, 59, 999);
      displayRange = format(start, 'MMMM yyyy');
    }

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      displayRange,
    };
  }, [propStartDate, propEndDate, baseDate, calendarDate, viewType, weekStartsOn]);

  // Fetch employee punches
  const {
    data: employeePunches,
    isLoading,
    error,
  } = useQuery({
    queryKey: [
      'employeePunches',
      dateRange.startDate,
      dateRange.endDate,
      selectedJobIdsKey,
      selectedShiftSlug,
    ],
    queryFn: () =>
      fetchEmployeePunches(
        dateRange.startDate,
        dateRange.endDate,
        selectedJobIds,
        selectedShiftSlug
      ),
    enabled:
      !companyLoading &&
      !jobsLoading &&
      availableJobs.length > 0 &&
      selectedJobIds.length > 0,
    staleTime: 60000, // Consider data fresh for 1 minute
  });

  // Debug employee punches fetch
  useEffect(() => {
    console.log('📥 Employee Punches Query State:', {
      isLoading,
      error: error?.message,
      employeePunchesCount: employeePunches?.length || 0,
      dateRange: {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        displayRange: dateRange.displayRange,
      },
      selectedJobIds,
      selectedShiftSlug,
      enabled:
        !companyLoading &&
        !jobsLoading &&
        availableJobs.length > 0 &&
        selectedJobIds.length > 0,
    });
  }, [
    isLoading,
    error,
    employeePunches,
    dateRange,
    selectedJobIds,
    selectedShiftSlug,
    companyLoading,
    jobsLoading,
    availableJobs.length,
  ]);

  // Fetch active employee count
  const { data: activeCount, isLoading: activeCountLoading } = useQuery({
    queryKey: ['activeEmployeeCount', selectedJobIdsKey, selectedShiftSlug],
    queryFn: () => fetchActiveEmployeeCount(selectedJobIds, selectedShiftSlug),
    enabled:
      !companyLoading &&
      !jobsLoading &&
      availableJobs.length > 0 &&
      selectedJobIds.length > 0,
    refetchInterval: 60000, // Refetch every 60 seconds (reduced from 30)
    staleTime: 30000, // Consider data fresh for 30 seconds
  });

  // Update baseDate and calendar mode when view type changes
  useEffect(() => {
    if (viewType === 'day') {
      setCalendarMode('day');
      // Normalize to start of day - use the same date for both
      const dayStart = startOfDay(baseDate);
      setCalendarDate(dayStart);
      // Also update baseDate to ensure they're in sync
      setBaseDate(dayStart);
    } else if (viewType === 'week') {
      setCalendarMode('week');
      // Normalize to start of week
      const weekStart = startOfWeek(baseDate, {
        weekStartsOn: weekStartsOn || 0,
      });
      setCalendarDate(weekStart);
    } else if (viewType === 'month') {
      setCalendarMode('month');
      // Normalize to start of month
      const monthStart = startOfMonth(baseDate);
      setCalendarDate(monthStart);
    }
  }, [viewType, baseDate, weekStartsOn]);

  // Update baseDate when company work week settings change
  useEffect(() => {
    if (!companyLoading && weekStartsOn !== undefined) {
      const now = new Date();
      if (viewType === 'day') {
        setBaseDate(now);
        setCalendarDate(now);
      } else if (viewType === 'week' || viewType === 'table') {
        const weekStart = startOfWeek(now, { weekStartsOn });
        setBaseDate(weekStart);
        if (viewType === 'week') {
          setCalendarDate(weekStart);
        }
      } else if (viewType === 'month') {
        const monthStart = startOfMonth(now);
        setBaseDate(monthStart);
        setCalendarDate(monthStart);
      }
    }
  }, [weekStartsOn, companyLoading, viewType]);

  // Keep calendarDate and baseDate in sync for day view
  useEffect(() => {
    if (viewType === 'day') {
      // Normalize to start of day - ensure both are the same
      const dayStart = startOfDay(baseDate);
      setCalendarDate(dayStart);
      // If baseDate changed, update it to normalized version
      if (baseDate.getTime() !== dayStart.getTime()) {
        setBaseDate(dayStart);
      }
    }
  }, [baseDate, viewType]);

  const handleDateNavigation = (direction: number) => {
    const newDate = new Date(baseDate);
    if (viewType === 'day') {
      newDate.setDate(baseDate.getDate() + direction);
      // Normalize to start of day for day view
      const dayStart = startOfDay(newDate);
      setCalendarDate(dayStart);
      setBaseDate(dayStart);
    } else if (viewType === 'week' || viewType === 'table') {
      newDate.setDate(baseDate.getDate() + direction * 7);
      if (viewType === 'week') {
        // Normalize to start of week
        const weekStart = startOfWeek(newDate, {
          weekStartsOn: weekStartsOn || 0,
        });
        setCalendarDate(weekStart);
      }
      setBaseDate(newDate);
    } else if (viewType === 'month') {
      newDate.setMonth(baseDate.getMonth() + direction);
      // Normalize to start of month
      const monthStart = startOfMonth(newDate);
      setCalendarDate(monthStart);
      setBaseDate(monthStart);
    }
  };

  // Convert employee punches to calendar events
  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    console.log('🔄 Creating calendar events from employeePunches:', {
      employeePunchesCount: employeePunches?.length || 0,
      employeePunches: employeePunches?.map((p) => ({
        _id: p._id,
        timeIn: p.timeIn,
        timeOut: p.timeOut,
        employeeName: p.employeeName,
        jobTitle: p.jobTitle,
      })),
    });

    if (!employeePunches || employeePunches.length === 0) {
      console.log('⚠️ No employeePunches, returning empty array');
      return [];
    }

    const events = employeePunches.map((punch) => {
      const punchStart = new Date(punch.timeIn);
      const punchEnd = punch.timeOut ? new Date(punch.timeOut) : new Date();

      // Determine color based on status
      let color = 'blue';
      if (!punch.timeOut) {
        color = 'green'; // Active punch
      } else if (punch.status?.toLowerCase() === 'completed') {
        color = 'blue';
      }

      return {
        id: punch._id,
        title: `${punch.employeeName} - ${punch.jobTitle}${punch.shiftName ? ` (${punch.shiftName})` : ''}`,
        color,
        start: punchStart,
        end: punchEnd,
      };
    });

    console.log('✅ Created calendar events:', {
      count: events.length,
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.start.toISOString(),
        end: e.end.toISOString(),
        color: e.color,
      })),
    });

    return events;
  }, [employeePunches]);

  const [events, setEvents] = useState<CalendarEvent[]>([]);

  // Update calendar events when they change
  useEffect(() => {
    console.log('📊 Setting calendar events:', {
      count: calendarEvents.length,
      events: calendarEvents.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.start.toISOString(),
        end: e.end.toISOString(),
        color: e.color,
      })),
    });
    setEvents(calendarEvents);
  }, [calendarEvents]);

  const columns: TableColumn<EmployeePunch>[] = useMemo(
    () => [
      {
        key: 'checkbox',
        header: '',
        render: (_, row) => (
          <input
            type="checkbox"
            checked={row.isSelected || false}
            onChange={() => {
              // Checkbox functionality can be added later if needed
            }}
            className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
        ),
      },
      {
        key: 'date',
        header: 'DATE',
        render: (_, row) => formatDate(row.timeIn),
      },
      {
        key: 'employee',
        header: 'EMPLOYEE',
        render: (_, row) => (
          <div>
            <div className="font-medium">
              {row.employeeName.trim() || 'Unknown'}
            </div>
            {row.employeeEmail && (
              <div className="text-xs text-gray-500">{row.employeeEmail}</div>
            )}
          </div>
        ),
      },
      {
        key: 'jobSite',
        header: 'JOB/SITE',
        render: (_, row) => (
          <div>
            <div className="font-medium">
              {row.jobTitle || row.jobSite || 'N/A'}
            </div>
            {row.shiftName && (
              <div className="text-xs text-gray-500">{row.shiftName}</div>
            )}
          </div>
        ),
      },
      {
        key: 'timeRange',
        header: 'START - END TIME',
        render: (_, row) => (
          <div>
            {formatTime24(row.timeIn)} -{' '}
            {row.timeOut ? formatTime24(row.timeOut) : '----'}
          </div>
        ),
      },
      {
        key: 'totalHours',
        header: 'TOTAL HOURS',
        render: (_, row) => {
          const hours = calculateTotalHours(row.timeIn, row.timeOut);
          return <div className="font-medium">{hours} hrs</div>;
        },
      },
      {
        key: 'location',
        header: 'LOCATION',
        render: (_, row) => row.location || 'N/A',
      },
      {
        key: 'status',
        header: 'STATUS',
        render: (_, row) => {
          const isActive = !row.timeOut;
          const status =
            row.status?.toLowerCase() || (isActive ? 'active' : 'pending');

          return (
            <Badge
              variant="outline"
              className={
                status === 'completed'
                  ? 'bg-green-100 text-green-800 border-green-200'
                  : status === 'active'
                    ? 'bg-blue-100 text-blue-800 border-blue-200'
                    : 'bg-gray-100 text-gray-800 border-gray-200'
              }
            >
              {status === 'completed'
                ? 'Completed'
                : status === 'active'
                  ? 'Active'
                  : status === 'pending'
                    ? 'Pending'
                    : status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          );
        },
      },
    ],
    []
  );

  if (
    isLoading ||
    companyLoading ||
    jobsLoading ||
    availableJobs.length === 0
  ) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-24 w-48" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">
          Failed to load employee time and attendance:{' '}
          {(error as Error).message}
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h1 className="text-2xl font-semibold text-gray-900 mb-4">
          Time & Attendance
        </h1>

        {/* Job Selector and Clocked In Summary Row */}
        <div className="flex items-start gap-4 mb-4">
          {/* Job Selector */}
          <div className="flex-1 max-w-md">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Job
            </label>
            <Select value={selectedJobId} onValueChange={setSelectedJobId}>
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder="Select a job"
                  displayText={
                    selectedJobId === 'all'
                      ? 'All Jobs'
                      : availableJobs.find((job) => job._id === selectedJobId)
                            ?.title
                        ? (() => {
                            const title =
                              availableJobs.find(
                                (job) => job._id === selectedJobId
                              )?.title || '';
                            return (
                              title.charAt(0).toUpperCase() + title.slice(1)
                            );
                          })()
                        : 'Select a job'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                {availableJobs.map((job) => {
                  const displayTitle = job.title
                    ? job.title.charAt(0).toUpperCase() + job.title.slice(1)
                    : job._id;
                  return (
                    <SelectItem key={job._id} value={job._id}>
                      {displayTitle}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Shift Selector - Only show when a job is selected */}
          {selectedJobId !== 'all' && (
            <div className="flex-1 max-w-md">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Shift
              </label>
              {shiftsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select
                  value={selectedShiftSlug}
                  onValueChange={setSelectedShiftSlug}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        availableShifts.length === 0
                          ? 'No shifts available'
                          : 'Select a shift'
                      }
                      displayText={
                        selectedShiftSlug === 'all'
                          ? 'All Shifts'
                          : availableShifts.find(
                                (shift) => shift.slug === selectedShiftSlug
                              )?.shiftName
                            ? (() => {
                                const shiftName =
                                  availableShifts.find(
                                    (shift) => shift.slug === selectedShiftSlug
                                  )?.shiftName || '';
                                return (
                                  shiftName.charAt(0).toUpperCase() +
                                  shiftName.slice(1)
                                );
                              })()
                            : selectedShiftSlug !== 'all'
                              ? selectedShiftSlug.charAt(0).toUpperCase() +
                                selectedShiftSlug.slice(1)
                              : 'Select a shift'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Shifts</SelectItem>
                    {availableShifts.map((shift) => {
                      const displayName = shift.shiftName || shift.slug;
                      const capitalizedName =
                        displayName.charAt(0).toUpperCase() +
                        displayName.slice(1);
                      return (
                        <SelectItem key={shift.slug} value={shift.slug}>
                          {capitalizedName}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Currently Clocked In Summary Card */}
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 min-w-[240px]">
            <div className="flex items-center gap-4">
              {/* Large teal circle with count */}
              <div className="relative flex-shrink-0">
                <div className="w-16 h-16 bg-appPrimary rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-sm">
                  {activeCountLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    activeCount || 0
                  )}
                </div>
                {/* Green status dot on top-right */}
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white shadow-sm"></div>
              </div>
              {/* Text content */}
              <div className="flex-1">
                <div className="text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">
                  Currently Clocked In
                </div>
                <div className="text-lg font-bold text-gray-900">
                  {activeCountLoading ? (
                    <span className="text-gray-400">Loading...</span>
                  ) : (
                    <>
                      {activeCount || 0}{' '}
                      {activeCount === 1 ? 'Employee' : 'Employees'}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* View Toggle Buttons and Date Navigation */}
        <div className="flex items-center justify-between">
          <ToggleGroup
            type="single"
            value={viewType}
            onValueChange={(value) => {
              if (value) {
                setViewType(value as 'table' | 'month' | 'week' | 'day');
              }
            }}
            className="inline-flex rounded-lg border border-gray-300 p-1"
          >
            <ToggleGroupItem
              value="table"
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                viewType === 'table'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Table
            </ToggleGroupItem>
            <ToggleGroupItem
              value="month"
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                viewType === 'month'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Month
            </ToggleGroupItem>
            <ToggleGroupItem
              value="week"
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                viewType === 'week'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Week
            </ToggleGroupItem>
            <ToggleGroupItem
              value="day"
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                viewType === 'day'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Day
            </ToggleGroupItem>
          </ToggleGroup>

          {/* Date Navigation */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-8 w-8 p-1"
              onClick={() => handleDateNavigation(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-center font-medium text-sm min-w-[180px] px-2">
              {dateRange.displayRange}
            </span>
            <Button
              variant="outline"
              className="h-8 w-8 p-1"
              onClick={() => handleDateNavigation(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Weekly Shift Details Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {viewType === 'table'
            ? 'Weekly Shift Details'
            : viewType === 'month'
              ? 'Monthly Shift Details'
              : viewType === 'week'
                ? 'Weekly Shift Details'
                : 'Daily Shift Details'}
        </h2>

        {/* Conditional rendering: Calendar or Table */}
        {viewType === 'table' ? (
          /* Table view */
          <Table
            title=""
            description=""
            columns={columns}
            data={employeePunches || []}
            showPagination={false}
            selectable={false}
            className="w-full"
            emptyMessage="No employee time and attendance records found for the selected date range."
          />
        ) : /* Calendar view (Month, Week, Day) */
        companyLoading ? (
          <div className="flex items-center justify-center min-h-[500px]">
            <div className="text-gray-500">Loading calendar...</div>
          </div>
        ) : (
          <CalendarProvider
            events={events}
            setEvents={setEvents}
            mode={calendarMode}
            setMode={setCalendarMode}
            date={calendarDate}
            setDate={setCalendarDate}
            calendarIconIsToday={false}
            weekStartsOn={weekStartsOn || 0}
          >
            {(() => {
              console.log('🎯 CalendarProvider Debug:', {
                viewType,
                calendarMode,
                calendarDate: calendarDate.toISOString(),
                calendarDateFormatted: calendarDate.toLocaleDateString(),
                eventsCount: events.length,
                weekStartsOn,
              });
              return null;
            })()}
            <div className="space-y-4">
              <div className="border rounded-lg bg-white shadow-sm min-h-[500px]">
                <Calendar hideHeaderActions={true} hideHeaderDate={true} />
              </div>
            </div>
          </CalendarProvider>
        )}
      </div>
    </div>
  );
}
