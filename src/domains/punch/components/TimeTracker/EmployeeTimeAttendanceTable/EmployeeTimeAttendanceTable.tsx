'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table } from '@/components/ui/Table';
import { TableColumn } from '@/components/ui/Table/types';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { ChevronLeft, ChevronRight, Pencil, MapPin } from 'lucide-react';
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
  format,
} from 'date-fns';
import { useCompanyWorkWeek } from '@/domains/shared/hooks/use-company-work-week';
import type { GignologyJob, Shift } from '@/domains/job/types/job.types';
import CalendarProvider from '@/components/ui/Calendar/CalendarProvider';
import Calendar from '@/components/ui/Calendar/Calendar';
import type { CalendarEvent, Mode } from '@/components/ui/Calendar';
import { useCalendarContext } from '@/components/ui/Calendar/CalendarContext';
import { EmployeePunchDetailsModal } from '../EmployeePunchDetailsModal/EmployeePunchDetailsModal';
import { MapModal } from '../MapModal/MapModal';

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
  firstName?: string;
  lastName?: string;
  employeeEmail: string;
  phoneNumber?: string;
  jobTitle: string;
  jobSite: string;
  location: string;
  userNote?: string; // ERROR-PROOF: Include userNote field
  managerNote?: string; // ERROR-PROOF: Include managerNote field
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
  return format(date, 'MM-dd-yyyy');
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
  // ERROR-PROOF: Normalize shiftSlug before sending
  const normalizedShiftSlug =
    shiftSlug && shiftSlug !== 'all' && shiftSlug.trim() !== ''
      ? shiftSlug.trim()
      : undefined;

  // Log for debugging (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log('[Employee Punches Fetch] Request params:', {
      startDate,
      endDate,
      jobIds,
      shiftSlug: normalizedShiftSlug || 'all',
      originalShiftSlug: shiftSlug,
    });
  }

  const response = await fetch('/api/punches/employees', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate,
      endDate,
      jobIds: jobIds && jobIds.length > 0 ? jobIds : undefined,
      shiftSlug: normalizedShiftSlug,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('[Employee Punches Fetch] API Error:', error);
    throw new Error(error.message || 'Failed to fetch employee punches');
  }

  const data = await response.json();

  // Log for debugging (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log('[Employee Punches Fetch] Response:', {
      count: data.count,
      shiftSlug: normalizedShiftSlug || 'all',
      samplePunches: (data.data || []).slice(0, 3).map((p: EmployeePunch) => ({
        id: p._id,
        shiftSlug: p.shiftSlug,
        timeIn: p.timeIn,
      })),
    });
  }

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

  // Table-only controls (do not affect calendar view toggles)
  const [tableRange, setTableRange] = useState<'day' | 'week' | 'month'>('week');
  const [includeUpcoming, setIncludeUpcoming] = useState(false);

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

  // Geofence modal state
  const [showGeofenceModal, setShowGeofenceModal] = useState(false);

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
  const { data: availableJobs = [], isLoading: jobsLoading, error: jobsError } = useQuery<
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

  // Fetch venue location data if job doesn't have location
  const { data: venueLocationData } = useQuery<{
    latitude: number;
    longitude: number;
    name: string;
    address: string;
    geoFenceRadius: number;
    graceDistance?: number;
  }>({
    queryKey: ['venueLocation', selectedJob?.venueSlug],
    queryFn: async () => {
      if (!selectedJob?.venueSlug) return null;
      const response = await fetch(
        `/api/venues/${selectedJob.venueSlug}/location`
      );
      if (!response.ok) return null;
      const result = await response.json();
      return result.data;
    },
    enabled: !!selectedJob?.venueSlug && !selectedJob?.location,
    staleTime: 300000, // Cache for 5 minutes
  });

  // Extract geofence location data from job or venue (following stadium-people pattern)
  const geofenceLocationData = useMemo(() => {
    if (!selectedJob) return null;

    const job = selectedJob as GignologyJob & {
      venueSlug?: string;
      venueName?: string;
      location?: {
        latitude?: number;
        longitude?: number;
        locationName?: string;
        address?: string;
        city?: string;
        state?: string;
        geocoordinates?: {
          coordinates?: [number, number]; // [longitude, latitude]
          geoFenceRadius?: number;
          type?: string;
        };
        graceDistanceFeet?: number;
      };
    };

    // Priority 1: Check job.location with geocoordinates.coordinates array
    if (
      job.location?.geocoordinates?.coordinates &&
      Array.isArray(job.location.geocoordinates.coordinates)
    ) {
      const [longitude, latitude] = job.location.geocoordinates.coordinates;
      if (
        typeof latitude === 'number' &&
        typeof longitude === 'number' &&
        latitude !== 0 &&
        longitude !== 0
      ) {
        const geoFenceRadius =
          job.location.geocoordinates.geoFenceRadius ||
          (job.location.graceDistanceFeet
            ? job.location.graceDistanceFeet * 0.3048
            : 100);

        const graceDistance = job.location.graceDistanceFeet
          ? job.location.graceDistanceFeet * 0.3048
          : undefined;

        return {
          latitude,
          longitude,
          name: job.location.locationName || job.title,
          address:
            job.location.address ||
            `${job.location.city || ''}, ${job.location.state || ''}`.trim() ||
            `${job.venueName || ''}`.trim(),
          geoFenceRadius,
          graceDistance,
        };
      }
    }

    // Priority 2: Check job.location with direct latitude/longitude
    if (
      job.location?.latitude &&
      job.location?.longitude &&
      typeof job.location.latitude === 'number' &&
      typeof job.location.longitude === 'number' &&
      job.location.latitude !== 0 &&
      job.location.longitude !== 0
    ) {
      const geoFenceRadius =
        job.location.geocoordinates?.geoFenceRadius ||
        (job.location.graceDistanceFeet
          ? job.location.graceDistanceFeet * 0.3048
          : 100);

      const graceDistance = job.location.graceDistanceFeet
        ? job.location.graceDistanceFeet * 0.3048
        : undefined;

      return {
        latitude: job.location.latitude,
        longitude: job.location.longitude,
        name: job.location.locationName || job.title,
        address:
          job.location.address ||
          `${job.location.city || ''}, ${job.location.state || ''}`.trim() ||
          `${job.venueName || ''}`.trim(),
        geoFenceRadius,
        graceDistance,
      };
    }

    // Priority 3: Use venue location data (from venues.locations array with primaryLocation)
    if (venueLocationData) {
      return venueLocationData;
    }

    return null;
  }, [selectedJob, venueLocationData]);

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

  // Get all available shifts for selected job (from fetched shifts or job data)
  const allAvailableShifts = useMemo(() => {
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
  // ERROR-PROOF: Ensures consistent date normalization matching backend expectations
  const dateRange = useMemo(() => {
    // If props are provided, validate and use them
    if (propStartDate && propEndDate) {
      try {
        const start = new Date(propStartDate);
        const end = new Date(propEndDate);

        // Validate dates
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          console.error(
            'Invalid date props provided, falling back to calculated range'
          );
        } else {
          return {
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            displayRange: `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`,
          };
        }
      } catch (error) {
        console.error('Error parsing prop dates:', error);
        // Fall through to calculated range
      }
    }

    let start: Date;
    let end: Date;
    let displayRange: string;

    try {
      // ERROR-PROOF: Always use calendarDate for consistency across all views
      // calendarDate is the source of truth for what the calendar is displaying
      const dateToUse = calendarDate || baseDate;

      // Validate date
      if (!dateToUse || isNaN(dateToUse.getTime())) {
        throw new Error('Invalid date for view');
      }

      if (viewType === 'day') {
        // Normalize to start of day in local timezone
        start = new Date(dateToUse);
        start = startOfDay(start);
        start.setHours(0, 0, 0, 0);

        // Normalize to end of day in local timezone
        end = new Date(dateToUse);
        end = startOfDay(end);
        end.setHours(23, 59, 59, 999);

        displayRange = format(start, 'MMM d, yyyy');
      } else if (viewType === 'table') {
        // Table view range is controlled by tableRange (day/week/month)
        if (tableRange === 'day') {
          start = new Date(dateToUse);
          start = startOfDay(start);
          start.setHours(0, 0, 0, 0);

          end = new Date(dateToUse);
          end = startOfDay(end);
          end.setHours(23, 59, 59, 999);

          displayRange = format(start, 'MMM d, yyyy');
        } else if (tableRange === 'month') {
          start = startOfMonth(dateToUse);
          start.setHours(0, 0, 0, 0);

          end = endOfMonth(dateToUse);
          end.setHours(23, 59, 59, 999);

          displayRange = `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
        } else {
          // week (default)
          start = startOfWeek(dateToUse, { weekStartsOn: weekStartsOn || 0 });
          start.setHours(0, 0, 0, 0);

          end = endOfWeek(dateToUse, { weekStartsOn: weekStartsOn || 0 });
          end.setHours(23, 59, 59, 999);

          displayRange = `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
        }
      } else if (viewType === 'week') {
        // Use calendarDate (which should already be normalized to week start)
        start = startOfWeek(dateToUse, { weekStartsOn: weekStartsOn || 0 });
        start.setHours(0, 0, 0, 0);

        end = endOfWeek(dateToUse, { weekStartsOn: weekStartsOn || 0 });
        end.setHours(23, 59, 59, 999);

        displayRange = `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
      } else {
        // Month view - use calendarDate (which should already be normalized to month start)
        start = startOfMonth(dateToUse);
        start.setHours(0, 0, 0, 0);

        end = endOfMonth(dateToUse);
        end.setHours(23, 59, 59, 999);

        displayRange = format(start, 'MMMM yyyy');
      }

      // Final validation: ensure start <= end
      if (start.getTime() > end.getTime()) {
        console.error('Date range validation failed: start > end', {
          start,
          end,
        });
        // Swap if needed (shouldn't happen, but safety check)
        [start, end] = [end, start];
      }

      // Validate dates are valid
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error('Calculated dates are invalid');
      }

      return {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        displayRange,
      };
    } catch (error) {
      console.error('Error calculating date range:', error);
      // Fallback to today's date range
      const today = new Date();
      const fallbackStart = startOfDay(today);
      fallbackStart.setHours(0, 0, 0, 0);
      const fallbackEnd = startOfDay(today);
      fallbackEnd.setHours(23, 59, 59, 999);

      return {
        startDate: fallbackStart.toISOString(),
        endDate: fallbackEnd.toISOString(),
        displayRange: format(fallbackStart, 'MMM d, yyyy'),
      };
    }
  }, [
    propStartDate,
    propEndDate,
    baseDate,
    calendarDate,
    viewType,
    tableRange,
    weekStartsOn,
  ]);

  // Fetch employee punches (with shift filter applied)
  // ERROR-PROOF: Increased staleTime and added refetchOnWindowFocus: false to reduce API calls
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
      selectedJobIds.length > 0 &&
      !!dateRange.startDate &&
      !!dateRange.endDate,
    staleTime: 120000, // Consider data fresh for 2 minutes (reduced API calls)
    gcTime: 300000, // Keep in cache for 5 minutes
    refetchOnWindowFocus: false, // Don't refetch on window focus (reduces API calls)
    refetchOnReconnect: false, // Don't refetch on reconnect (reduces API calls)
    refetchOnMount: false, // Don't refetch when component remounts (reduces API calls)
  });

  // Upcoming detection + Table-only filtering (does not affect calendar views)
  const tableData = useMemo(() => {
    const punches = employeePunches || [];
    if (viewType !== 'table') return punches;
    if (includeUpcoming) return punches;
    const now = Date.now();
    return punches.filter((p) => {
      const timeInMs = new Date(p.timeIn).getTime();
      if (Number.isNaN(timeInMs)) return true; // keep malformed rows rather than hiding unexpectedly
      return timeInMs <= now;
    });
  }, [employeePunches, includeUpcoming, viewType]);

  // Get unique shift slugs from actual punches in the date range
  // ERROR-PROOF: Only show shifts that have data in the current date range
  // NOTE: We extract this from the main employeePunches query to avoid duplicate API calls
  // This must be AFTER employeePunches is defined
  const availableShiftSlugs = useMemo(() => {
    // When "all" shifts is selected, we can extract shift slugs from the current data
    // This avoids making a separate API call just to get shift slugs
    if (!employeePunches || employeePunches.length === 0) {
      return new Set<string>();
    }
    // Extract unique shift slugs from punches
    const shiftSlugs = employeePunches
      .map((punch) => punch.shiftSlug)
      .filter((slug): slug is string => !!slug && slug !== 'all');
    return new Set(shiftSlugs);
  }, [employeePunches]);

  // Get all available shifts for the dropdown
  // Always show all shifts from the job, regardless of current filter
  // This ensures users can always see and select all shifts, even when a specific shift is selected
  // NOTE: This must be AFTER availableShiftSlugs is defined
  const availableShifts = useMemo(() => {
    if (selectedJobId === 'all') {
      return [];
    }

    // Always start with all shifts from the job
    // This ensures all shifts are always visible in the dropdown
    const baseShifts = [...allAvailableShifts];

    // If we have punches, check for virtual shifts (deleted/missing shifts that appear in punches)
    if (availableShiftSlugs.size > 0 && employeePunches) {
      // Find shift slugs from punches that don't exist in the job's shifts
      const missingShiftSlugs = Array.from(availableShiftSlugs).filter(
        (slug) => !allAvailableShifts.some((shift) => shift.slug === slug)
      );

      // Create virtual shifts for deleted/missing shifts using data from punches
      const virtualShifts: Shift[] = missingShiftSlugs.map((slug) => {
        // Find a punch with this slug to get the shiftName
        const punchWithShift = employeePunches.find(
          (p) => p.shiftSlug === slug
        );

        // Use shiftName from punch if available, otherwise format the slug
        let shiftName = punchWithShift?.shiftName;
        if (!shiftName && slug) {
          // Format slug: remove timestamp and random suffix, then format nicely
          shiftName = slug
            .replace(/-\d{13}-[a-z0-9]+$/i, '') // Remove timestamp and random suffix
            .split('-')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        }

        // Create empty default schedule with all days
        const emptySchedule = {
          monday: { start: '', end: '', roster: [] },
          tuesday: { start: '', end: '', roster: [] },
          wednesday: { start: '', end: '', roster: [] },
          thursday: { start: '', end: '', roster: [] },
          friday: { start: '', end: '', roster: [] },
          saturday: { start: '', end: '', roster: [] },
          sunday: { start: '', end: '', roster: [] },
        };

        return {
          slug,
          shiftName: shiftName || slug,
          shiftStartDate: '',
          shiftEndDate: '',
          defaultSchedule: emptySchedule,
          billRate: 0,
          payRate: 0,
          shiftRoster: [],
          exceptions: [],
        } as Shift;
      });

      // Combine base shifts with virtual shifts
      const allShifts = [...baseShifts, ...virtualShifts];

      // Log for debugging (only in development)
      if (process.env.NODE_ENV === 'development') {
        console.log('[Employee Time Attendance] Available shifts:', {
          allShifts: allAvailableShifts.map((s) => s.slug),
          shiftsWithData: Array.from(availableShiftSlugs),
          missingShiftSlugs,
          virtualShifts: virtualShifts.map((s) => ({
            slug: s.slug,
            shiftName: s.shiftName,
          })),
          finalShifts: allShifts.map((s) => s.slug),
        });
      }

      return allShifts;
    }

    // If no punches yet, show all shifts (they might have data we haven't loaded)
    return baseShifts;
  }, [selectedJobId, allAvailableShifts, availableShiftSlugs, employeePunches]);

  // Reset shift when job changes
  // NOTE: This must be AFTER availableShifts is defined
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

  // Debug employee punches fetch - ERROR-PROOF: Only log when values actually change
  // NOTE: Removed to prevent infinite loops - uncomment only for debugging
  // useEffect(() => {
  //   if (process.env.NODE_ENV === 'development') {
  //     console.log('📥 Employee Punches Query State:', {
  //       isLoading,
  //       employeePunchesCount: employeePunches?.length || 0,
  //       dateRange: dateRange.displayRange,
  //     });
  //   }
  // }, [isLoading, employeePunches?.length, dateRange.displayRange]);

  // Fetch active employee count
  const { data: activeCount, isLoading: activeCountLoading } = useQuery({
    queryKey: ['activeEmployeeCount', selectedJobIdsKey, selectedShiftSlug],
    queryFn: () => fetchActiveEmployeeCount(selectedJobIds, selectedShiftSlug),
    enabled:
      !companyLoading &&
      !jobsLoading &&
      availableJobs.length > 0 &&
      selectedJobIds.length > 0,
    refetchInterval: 120000, // ERROR-PROOF: Refetch every 2 minutes (reduced from 60 seconds to prevent rate limiting)
    staleTime: 60000, // ERROR-PROOF: Consider data fresh for 1 minute (increased from 30 seconds)
    refetchOnWindowFocus: false, // ERROR-PROOF: Don't refetch on window focus
    refetchOnMount: false, // ERROR-PROOF: Don't refetch on remount
  });

  // Update baseDate and calendar mode when view type changes
  // ERROR-PROOF: Only update when viewType or weekStartsOn changes, not baseDate (to prevent infinite loops)
  useEffect(() => {
    if (viewType === 'day') {
      setCalendarMode('day');
      // Normalize to start of day - use the same date for both
      const dayStart = startOfDay(baseDate);
      setCalendarDate(dayStart);
      // Only update baseDate if it's different to prevent infinite loops
      if (baseDate.getTime() !== dayStart.getTime()) {
        setBaseDate(dayStart);
      }
    } else if (viewType === 'week') {
      setCalendarMode('week');
      // Normalize to start of week
      const weekStart = startOfWeek(baseDate, {
        weekStartsOn: weekStartsOn || 0,
      });
      setCalendarDate(weekStart);
      // Only update baseDate if it's different to prevent infinite loops
      if (baseDate.getTime() !== weekStart.getTime()) {
        setBaseDate(weekStart);
      }
    } else if (viewType === 'month') {
      setCalendarMode('month');
      // Normalize to start of month
      const monthStart = startOfMonth(baseDate);
      setCalendarDate(monthStart);
      // Only update baseDate if it's different to prevent infinite loops
      if (baseDate.getTime() !== monthStart.getTime()) {
        setBaseDate(monthStart);
      }
    }
    // ERROR-PROOF: Removed baseDate from dependencies to prevent infinite loops
    // baseDate is only used as input, not as a trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewType, weekStartsOn]);

  // Keep baseDate/calendarDate normalized for Table view when tableRange changes
  useEffect(() => {
    if (viewType !== 'table') return;
    const dateToUse = baseDate || new Date();
    if (tableRange === 'day') {
      const dayStart = startOfDay(dateToUse);
      setBaseDate(dayStart);
      setCalendarDate(dayStart);
    } else if (tableRange === 'month') {
      const monthStart = startOfMonth(dateToUse);
      setBaseDate(monthStart);
      setCalendarDate(monthStart);
    } else {
      const weekStart = startOfWeek(dateToUse, { weekStartsOn: weekStartsOn || 0 });
      setBaseDate(weekStart);
      setCalendarDate(weekStart);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewType, tableRange, weekStartsOn]);

  // Update baseDate when company work week settings change
  // ERROR-PROOF: Always sync calendarDate and baseDate
  useEffect(() => {
    if (!companyLoading && weekStartsOn !== undefined) {
      const now = new Date();
      if (viewType === 'day') {
        const dayStart = startOfDay(now);
        setBaseDate(dayStart);
        setCalendarDate(dayStart);
      } else if (viewType === 'week' || viewType === 'table') {
        const weekStart = startOfWeek(now, { weekStartsOn });
        setBaseDate(weekStart);
        setCalendarDate(weekStart);
      } else if (viewType === 'month') {
        const monthStart = startOfMonth(now);
        setBaseDate(monthStart);
        setCalendarDate(monthStart);
      }
    }
  }, [weekStartsOn, companyLoading, viewType]);

  // Keep calendarDate in sync with baseDate for day view
  // ERROR-PROOF: Only sync calendarDate when baseDate changes, don't modify baseDate here
  useEffect(() => {
    if (viewType === 'day') {
      // Normalize to start of day
      const dayStart = startOfDay(baseDate);
      // Only update calendarDate if it's different to prevent infinite loops
      if (calendarDate.getTime() !== dayStart.getTime()) {
        setCalendarDate(dayStart);
      }
    }
    // ERROR-PROOF: Only depend on baseDate and viewType, not calendarDate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseDate, viewType]);

  const handleDateNavigation = (direction: number) => {
    const newDate = new Date(baseDate);
    if (viewType === 'day') {
      newDate.setDate(baseDate.getDate() + direction);
      // Normalize to start of day for day view
      const dayStart = startOfDay(newDate);
      setCalendarDate(dayStart);
      setBaseDate(dayStart);
    } else if (viewType === 'table') {
      // Table view navigation depends on tableRange (day/week/month)
      if (tableRange === 'day') {
        newDate.setDate(baseDate.getDate() + direction);
        const dayStart = startOfDay(newDate);
        setCalendarDate(dayStart);
        setBaseDate(dayStart);
      } else if (tableRange === 'month') {
        newDate.setMonth(baseDate.getMonth() + direction);
        const monthStart = startOfMonth(newDate);
        setCalendarDate(monthStart);
        setBaseDate(monthStart);
      } else {
        // week (default)
        newDate.setDate(baseDate.getDate() + direction * 7);
        const weekStart = startOfWeek(newDate, {
          weekStartsOn: weekStartsOn || 0,
        });
        setCalendarDate(weekStart);
        setBaseDate(weekStart);
      }
    } else if (viewType === 'week') {
      newDate.setDate(baseDate.getDate() + direction * 7);
      const weekStart = startOfWeek(newDate, {
        weekStartsOn: weekStartsOn || 0,
      });
      setCalendarDate(weekStart);
      setBaseDate(weekStart);
    } else if (viewType === 'month') {
      newDate.setMonth(baseDate.getMonth() + direction);
      // Normalize to start of month
      const monthStart = startOfMonth(newDate);
      setCalendarDate(monthStart);
      setBaseDate(monthStart);
    }
  };

  // Convert employee punches to calendar events
  // ERROR-PROOF: Removed console.logs to prevent re-renders
  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    if (!employeePunches || employeePunches.length === 0) {
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

    return events;
  }, [employeePunches]);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedPunch, setSelectedPunch] = useState<EmployeePunch | null>(
    null
  );
  const [showPunchModal, setShowPunchModal] = useState(false);

  // ERROR-PROOF: Update selectedPunch when employeePunches data changes (after save/refetch)
  // This ensures the modal shows the latest data when reopened
  useEffect(() => {
    if (selectedPunch && employeePunches && employeePunches.length > 0) {
      // Find the updated punch from the fresh data
      const updatedPunch = employeePunches.find(
        (p) => p._id === selectedPunch._id
      );
      if (updatedPunch) {
        // Only update if the data actually changed to prevent unnecessary re-renders
        const punchChanged =
          updatedPunch.timeIn !== selectedPunch.timeIn ||
          updatedPunch.timeOut !== selectedPunch.timeOut ||
          (updatedPunch as unknown as { userNote?: string }).userNote !==
            (selectedPunch as unknown as { userNote?: string }).userNote ||
          (updatedPunch as unknown as { managerNote?: string }).managerNote !==
            (selectedPunch as unknown as { managerNote?: string }).managerNote;

        if (punchChanged) {
          console.log('🔄 Updating selectedPunch with fresh data');
          setSelectedPunch(updatedPunch);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeePunches, selectedPunch?._id]);

  // Update calendar events when they change
  // ERROR-PROOF: Only update when events actually change (by length and IDs)
  useEffect(() => {
    // Only log in development
    if (process.env.NODE_ENV === 'development') {
      console.log('📊 Setting calendar events:', {
        count: calendarEvents.length,
      });
    }
    setEvents(calendarEvents);
  }, [calendarEvents]);

  // Component that listens to calendar event clicks
  // ERROR-PROOF: Prevent multiple rapid calls that could cause rate limiting
  const CalendarEventHandler = () => {
    const { selectedEvent, manageEventDialogOpen, setManageEventDialogOpen } =
      useCalendarContext();
    const lastProcessedRef = useRef<{
      eventId: string | null;
      timestamp: number;
    }>({
      eventId: null,
      timestamp: 0,
    });
    const isProcessingRef = useRef(false);

    // Debug: Log when component renders
    console.log('🎯 CalendarEventHandler rendered');

    useEffect(() => {
      console.log('🔍 CalendarEventHandler effect running:', {
        hasSelectedEvent: !!selectedEvent,
        selectedEventId: selectedEvent?.id,
        manageEventDialogOpen,
        showPunchModal,
        employeePunchesCount: employeePunches?.length || 0,
        isLoading,
      });

      // Early return guards
      // ERROR-PROOF: Don't block if employeePunches is loading - allow the click to work
      if (!selectedEvent || showPunchModal) {
        console.log(
          '⏭️ Early return: no selectedEvent or showPunchModal is true'
        );
        return;
      }

      // ERROR-PROOF: If we're processing and modal is already open, we're done
      if (isProcessingRef.current && showPunchModal) {
        console.log('⏭️ Early return: Already processing and modal is open');
        return;
      }

      // ERROR-PROOF: Only process when dialog opens OR when we're in the process of opening
      // If dialog is closed and we're not processing, return early
      if (!manageEventDialogOpen && !isProcessingRef.current) {
        // Reset processing flag when dialog closes and modal is not open
        if (!showPunchModal) {
          isProcessingRef.current = false;
        }
        console.log(
          '⏭️ Early return: manageEventDialogOpen is false and not processing'
        );
        return;
      }

      // If we're already processing (but modal not open yet), continue to open it
      if (isProcessingRef.current) {
        console.log('⏭️ Already processing, skipping duplicate call');
        return;
      }

      // ERROR-PROOF: Wait for employeePunches to be loaded before processing
      if (!employeePunches || employeePunches.length === 0) {
        // If still loading, wait a bit and try again
        if (isLoading) {
          return;
        }
        // If not loading but no punches, close dialog and show error
        console.warn('No employee punches found for event:', selectedEvent.id);
        setManageEventDialogOpen(false);
        return;
      }

      const now = Date.now();
      const timeSinceLastProcess = now - lastProcessedRef.current.timestamp;
      const isSameEvent = selectedEvent.id === lastProcessedRef.current.eventId;

      // Prevent processing if same event was processed recently (within 2 seconds)
      if (isSameEvent && timeSinceLastProcess < 2000) {
        setManageEventDialogOpen(false);
        return;
      }

      // Find the corresponding punch
      console.log('🔍 Looking for punch with eventId:', selectedEvent.id);
      const punch = employeePunches.find((p) => p._id === selectedEvent.id);

      if (punch) {
        console.log('✅ Punch found! Opening modal:', {
          punchId: punch._id,
          employeeName: punch.employeeName,
        });
        // Mark as processing immediately to prevent duplicate calls
        isProcessingRef.current = true;
        lastProcessedRef.current = {
          eventId: selectedEvent.id,
          timestamp: now,
        };

        // ERROR-PROOF: Set the punch and modal state FIRST, then close the calendar dialog
        // This ensures showPunchModal is true before manageEventDialogOpen becomes false
        setSelectedPunch(punch);
        setShowPunchModal(true);

        // Close the calendar's default dialog after a small delay to ensure modal state is set
        setTimeout(() => {
          setManageEventDialogOpen(false);
          // Reset processing flag after modal opens
          setTimeout(() => {
            isProcessingRef.current = false;
          }, 100);
        }, 100);

        // No cleanup needed since we're not using setTimeout for critical state updates
        return;
      } else {
        // If punch not found, log and close dialog
        console.warn('❌ Punch not found for event:', {
          eventId: selectedEvent.id,
          eventTitle: selectedEvent.title,
          availablePunchIds: employeePunches.map((p) => p._id),
        });
        setManageEventDialogOpen(false);
      }
      // ERROR-PROOF: Only depend on primitive values to prevent infinite loops
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      selectedEvent?.id,
      manageEventDialogOpen,
      showPunchModal,
      employeePunches?.length,
      isLoading,
    ]);

    return null; // This component doesn't render anything
  };

  // Component to handle modal close and reset calendar state
  // ERROR-PROOF: This must be inside CalendarProvider to use useCalendarContext
  // Only render this inside CalendarProvider (for calendar views)
  const ModalCloseHandler = () => {
    const { setSelectedEvent, setManageEventDialogOpen } = useCalendarContext();

    useEffect(() => {
      // When modal closes, reset calendar event selection
      if (!showPunchModal) {
        setSelectedEvent(null);
        setManageEventDialogOpen(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showPunchModal]);

    return null;
  };

  // Handler to open modal for a punch
  const handleOpenPunchModal = useCallback((punch: EmployeePunch) => {
    setSelectedPunch(punch);
    setShowPunchModal(true);
  }, []);

  const columns: TableColumn<EmployeePunch>[] = useMemo(
    () => [
      {
        key: 'date',
        header: 'DATE',
        render: (_, row) => formatDate(row.timeIn),
        sortFn: (a, b) => {
          const dateA = new Date(a.timeIn).getTime();
          const dateB = new Date(b.timeIn).getTime();
          return dateA - dateB;
        },
      },
      {
        key: 'lastName',
        header: 'LAST NAME',
        render: (_, row) => (
          <div>
            <div className="font-medium">
              {row.lastName?.trim() || 'N/A'}
            </div>
            {row.phoneNumber && (
              <div className="text-xs text-gray-500">{row.phoneNumber}</div>
            )}
          </div>
        ),
      },
      {
        key: 'firstName',
        header: 'FIRST NAME',
        render: (_, row) => (
          <div>
            <div className="font-medium">
              {row.firstName?.trim() || 'N/A'}
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
        sortFn: (a, b) => {
          const timeA = new Date(a.timeIn).getTime();
          const timeB = new Date(b.timeIn).getTime();
          return timeA - timeB;
        },
      },
      {
        key: 'totalHours',
        header: 'TOTAL HOURS',
        render: (_, row) => {
          const hours = calculateTotalHours(row.timeIn, row.timeOut);
          return <div className="font-medium">{hours} hrs</div>;
        },
        sortFn: (a, b) => {
          const hoursA = calculateTotalHours(a.timeIn, a.timeOut);
          const hoursB = calculateTotalHours(b.timeIn, b.timeOut);
          return hoursA - hoursB;
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
      {
        key: 'actions',
        header: 'ACTIONS',
        render: (_, row) => (
          <button
            onClick={(e) => {
              e.stopPropagation(); // Prevent row click from firing
              handleOpenPunchModal(row);
            }}
            className="flex items-center justify-center p-2 text-gray-600 hover:text-teal-600 hover:bg-teal-50 rounded-md transition-colors"
            title="Edit punch details"
          >
            <Pencil className="h-4 w-4" />
          </button>
        ),
        className: 'w-16 text-center',
      },
    ],
    [handleOpenPunchModal]
  );

  // Show loading state only when actually loading
  if (isLoading || companyLoading || jobsLoading) {
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

  // Show error state
  if (error || jobsError) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">
          Failed to load employee time and attendance:{' '}
          {(error as Error)?.message || (jobsError as Error)?.message || 'Unknown error'}
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

  // Show empty state when no jobs are available (e.g., no client organizations)
  if (availableJobs.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-4">
            Time & Attendance
          </h1>
          <div className="text-center py-12">
            <div className="max-w-md mx-auto">
              <div className="mb-4">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No Jobs Available
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                There are no jobs with shifts available for your account. This may be because:
              </p>
              <ul className="text-sm text-gray-500 text-left list-disc list-inside space-y-1 mb-4">
                <li>No organizations have been assigned to your account</li>
                <li>No jobs with shifts exist for your assigned organizations</li>
              </ul>
              <p className="text-sm text-gray-500">
                Please contact your administrator if you believe this is an error.
              </p>
            </div>
          </div>
        </div>
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
        <div className="flex gap-4 mb-3">
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

          {/* Geofence Map Button - Only show when a job is selected and has location data */}
          {selectedJobId !== 'all' && selectedJob && geofenceLocationData && (
            <div className="flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-2 opacity-0 pointer-events-none">
                Map
              </label>
              <Button
                variant="outline"
                onClick={() => setShowGeofenceModal(true)}
                className="h-10 w-10 p-0 flex items-center justify-center bg-white hover:bg-gray-50 border-gray-300 text-gray-700 shadow-sm"
                title="View Geofence Map"
              >
                <MapPin className="h-5 w-5" />
              </Button>
            </div>
          )}

          {/* Currently Clocked In Summary Card */}
          <div className="flex item-center bg-teal-50 border border-teal-200 rounded-lg p-2 min-w-[240px]">
            <div className="flex items-center gap-4">
              {/* Large teal circle with count */}
              <div className="relative flex-shrink-0">
                <div className="w-8 h-8 bg-appPrimary rounded-full flex items-center justify-center text-white text-xl font-bold shadow-sm">
                  {activeCountLoading ? (
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    activeCount || 0
                  )}
                </div>
                {/* Green status dot on top-right */}
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white shadow-sm"></div>
              </div>
              {/* Text content */}
              <div className="flex-1">
                <div className="text-[10px] font-medium text-gray-600 mb-1 uppercase tracking-wide">
                  Currently Clocked In
                </div>
                <div className="text-xs font-semibold text-gray-900">
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
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <ToggleGroup
            type="single"
            value={viewType}
            onValueChange={(value) => {
              if (value) {
                setViewType(value as 'table' | 'month' | 'week' | 'day');
              }
            }}
            className="inline-flex w-full flex-wrap rounded-lg border border-gray-300 p-1 md:w-auto"
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

          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-nowrap md:items-center md:justify-end md:gap-4">
            {/* Table-only filters (do not affect calendar view toggles) */}
            {viewType === 'table' && (
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-start md:w-auto md:flex-row md:flex-nowrap md:items-center md:gap-3">
                {/* Table Range */}
                <div className="w-full sm:w-36 md:w-36">
                  <Select
                    value={tableRange}
                    onValueChange={(value) =>
                      setTableRange(value as 'day' | 'week' | 'month')
                    }
                  >
                    <SelectTrigger className="w-full h-8">
                      <SelectValue
                        placeholder="Range"
                        displayText={
                          tableRange === 'day'
                            ? 'Day'
                            : tableRange === 'month'
                              ? 'Month'
                              : 'Week'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">Day</SelectItem>
                      <SelectItem value="week">Week</SelectItem>
                      <SelectItem value="month">Month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Upcoming Shifts */}
                <label className="flex items-center gap-2 h-8 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 select-none w-full sm:w-auto md:w-auto sm:min-w-max whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={includeUpcoming}
                    onChange={(e) => setIncludeUpcoming(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                    aria-label="Include upcoming shifts"
                    title="Include upcoming shifts"
                  />
                  <span className="whitespace-nowrap">Upcoming Shifts</span>
                </label>
              </div>
            )}

            {/* Date Navigation */}
            <div className="flex w-full items-center justify-between gap-2 md:w-auto md:justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-8 w-8 p-1"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDateNavigation(-1);
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-center font-medium text-sm px-2 flex-1 md:flex-none md:min-w-[180px]">
                {dateRange.displayRange}
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-8 w-8 p-1"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDateNavigation(1);
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
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
            data={tableData}
            showPagination={false}
            selectable={false}
            className="w-full"
            emptyMessage="No employee time and attendance records found for the selected date range."
            getRowClassName={(row) => {
              const timeInMs = new Date(row.timeIn).getTime();
              if (Number.isNaN(timeInMs)) return '';
              if (timeInMs > Date.now()) {
                // Slightly different background to indicate upcoming shifts
                return 'bg-blue-50 hover:bg-blue-100';
              }
              return '';
            }}
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
            <CalendarEventHandler />
            <div className="space-y-4">
              <div className="border rounded-lg bg-white shadow-sm min-h-[500px]">
                <Calendar hideHeaderActions={true} hideHeaderDate={true} />
              </div>
            </div>
            {/* ModalCloseHandler must be inside CalendarProvider */}
            <ModalCloseHandler />
          </CalendarProvider>
        )}
      </div>

      {/* Employee Punch Details Modal */}
      <EmployeePunchDetailsModal
        isOpen={showPunchModal}
        onClose={() => {
          setShowPunchModal(false);
          setSelectedPunch(null);
        }}
        punch={selectedPunch}
        onSuccess={() => {
          // Refetch data after successful update will be handled by queryClient
          // The modal component will handle the refetch
        }}
      />

      {/* Geofence Map Modal */}
      {selectedJob && geofenceLocationData && (
        <MapModal
          isOpen={showGeofenceModal}
          onClose={() => setShowGeofenceModal(false)}
          jobLocation={{
            latitude: geofenceLocationData.latitude,
            longitude: geofenceLocationData.longitude,
            name: geofenceLocationData.name,
            address: geofenceLocationData.address,
          }}
          geoFenceRadius={geofenceLocationData.geoFenceRadius}
          graceDistance={geofenceLocationData.graceDistance}
          title={`Geofence: ${geofenceLocationData.name}`}
        />
      )}
    </div>
  );
}
