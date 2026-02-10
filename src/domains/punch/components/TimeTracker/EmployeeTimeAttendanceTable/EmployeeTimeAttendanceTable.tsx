'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import { Table } from '@/components/ui/Table';
import { TableColumn } from '@/components/ui/Table/types';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { ChevronLeft, ChevronRight, Pencil, MapPin, Search } from 'lucide-react';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/ToggleGroup';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  format,
  parseISO,
  isWithinInterval,
  isAfter,
  isBefore,
} from 'date-fns';
import { useCompanyWorkWeek } from '@/domains/shared/hooks/use-company-work-week';
import { useJobShifts, useJobsWithShifts } from '@/domains/job/hooks';
import type { GignologyJob, Shift } from '@/domains/job/types/job.types';
import type { Applicant } from '@/domains/user/types/applicant.types';
import { clsxm } from '@/lib/utils/class-utils';
import CalendarProvider from '@/components/ui/Calendar/CalendarProvider';
import Calendar from '@/components/ui/Calendar/Calendar';
import type { CalendarEvent, Mode } from '@/components/ui/Calendar';
import { useCalendarContext } from '@/components/ui/Calendar/CalendarContext';
import { EmployeePunchDetailsModal } from '../EmployeePunchDetailsModal/EmployeePunchDetailsModal';
import { MapModal } from '../MapModal/MapModal';
import { formatPhoneNumber } from '@/lib/utils';

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
  profileImg?: string | null;
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

  // Removed debug logging to prevent infinite loops

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
    throw new Error(error.message || 'Failed to fetch employee punches');
  }

  const data = await response.json();

  // Removed debug logging to prevent infinite loops

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

export function EmployeeTimeAttendanceTable({
  startDate: propStartDate,
  endDate: propEndDate,
}: EmployeeTimeAttendanceTableProps) {
  const { weekStartsOn, isLoading: companyLoading } = useCompanyWorkWeek();
  const { data: primaryCompany } = usePrimaryCompany();

  // View type state
  const [viewType, setViewType] = useState<'table' | 'month' | 'week' | 'day'>(
    'table'
  );

  // Table-only controls (do not affect calendar view toggles)
  const [tableRange, setTableRange] = useState<'day' | 'week' | 'month'>('week');

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

  // Job list filter: All | Today | Upcoming | Past (for narrowing the dropdown)
  const [jobFilter, setJobFilter] = useState<'all' | 'today' | 'upcoming' | 'past'>('all');

  // Shift list filter: All | Today | Upcoming | Past (for narrowing the dropdown)
  const [shiftFilter, setShiftFilter] = useState<'all' | 'today' | 'upcoming' | 'past'>('all');

  // Include jobs where hideThisJob is 'Yes' in the job selector (default: false = don't show them)
  const [includeHiddenJobs, setIncludeHiddenJobs] = useState<boolean>(false);

  // Employee search state
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState<string>('');

  // Future timecards visibility state
  const [showFutureTimecards, setShowFutureTimecards] = useState<boolean>(true);

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

  // Fetch jobs with shifts via job domain hook (API filters by hideThisJob when includeHiddenJobs is false)
  const {
    data: availableJobs = [],
    isLoading: jobsLoading,
    error: jobsError,
  } = useJobsWithShifts(
    { includeHiddenJobs },
    {
      enabled: !companyLoading,
      staleTime: 300000, // 5 minutes
    }
  );

  // Get selected job
  const selectedJob = useMemo(() => {
    if (selectedJobId === 'all') {
      return null;
    }
    return availableJobs.find((job) => job._id === selectedJobId) ?? null;
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

  // Fetch shifts for selected job - always fetch to get full shift data with rosters
  // This is needed for generating future punches even if job already has minimal shift data
  const { data: jobShifts = [], isLoading: shiftsLoading } = useJobShifts(
    selectedJobId,
    { enabled: !companyLoading }
  );

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

  // Helper function to generate future punch records from scheduled shifts
  const generateFuturePunches = useCallback(
    (
      jobs: GignologyJob[],
      startDate: Date,
      endDate: Date,
      selectedShiftSlug?: string
    ): EmployeePunch[] => {
      const futurePunches: EmployeePunch[] = [];
      const now = Date.now();
      const daysOfWeek = [
        'sunday',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
      ] as const;

      // Iterate through each day in the date range
      const currentDate = new Date(startDate);
      // Reset to start of day for accurate comparison
      currentDate.setHours(0, 0, 0, 0);
      const endDateCopy = new Date(endDate);
      endDateCopy.setHours(23, 59, 59, 999);

      while (currentDate <= endDateCopy) {
        const dayOfWeek = daysOfWeek[currentDate.getDay()];
        const dateKey = format(currentDate, 'yyyy-MM-dd');
        const dateTime = currentDate.getTime();

        // Only generate for future dates (dates that haven't started yet)
        if (dateTime > now) {
          // Iterate through each job
          jobs.forEach((job) => {
            if (!job.shifts || job.shifts.length === 0) return;

            job.shifts.forEach((shift) => {
              // Filter by selected shift if specified
              if (selectedShiftSlug && selectedShiftSlug !== 'all' && shift.slug !== selectedShiftSlug) {
                return;
              }

              // Check if shift is active for this date
              const shiftStartDate = new Date(shift.shiftStartDate);
              shiftStartDate.setHours(0, 0, 0, 0);
              const shiftEndDate = new Date(shift.shiftEndDate);
              shiftEndDate.setHours(23, 59, 59, 999);
              
              if (currentDate < shiftStartDate || currentDate > shiftEndDate) {
                return;
              }

              // Get the schedule for this day
              const daySchedule = shift.defaultSchedule?.[dayOfWeek];
              if (!daySchedule || !daySchedule.start || !daySchedule.end) {
                return;
              }

              // Get roster for this day (can be array of IDs or array of objects with employeeId and date)
              // First try daySchedule.roster, then fall back to shift.shiftRoster if available
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              let roster: any[] = (daySchedule.roster || []) as any[];
              
              // If no roster in daySchedule, try to use shiftRoster as fallback
              // This handles cases where roster is stored at the shift level rather than per day
              if (roster.length === 0 && shift.shiftRoster && Array.isArray(shift.shiftRoster) && shift.shiftRoster.length > 0) {
                // Use shiftRoster as fallback - create roster entries from shiftRoster
                roster = shift.shiftRoster.map((emp: unknown) => {
                  // If it's already an object with _id, use it directly
                  if (emp && typeof emp === 'object' && '_id' in emp) {
                    return emp;
                  }
                  // If it's a string ID, return it as string
                  if (typeof emp === 'string') {
                    return emp;
                  }
                  // If it's an object with employeeId, return it
                  if (emp && typeof emp === 'object' && 'employeeId' in emp) {
                    return emp;
                  }
                  return null;
                }).filter(Boolean);
              }
              
              if (roster.length === 0) {
                return;
              }

              // Removed debug logging to prevent infinite loops

              // Process roster entries
              roster.forEach((rosterEntry) => {
                let employeeId: string | null = null;
                let applicantData: Applicant | null = null;

                // Handle different roster formats
                if (typeof rosterEntry === 'string') {
                  // Old format: array of employee IDs
                  employeeId = rosterEntry;
                  // Try to find employee data in shiftRoster
                  if (shift.shiftRoster && Array.isArray(shift.shiftRoster)) {
                    const rosterApplicant = shift.shiftRoster.find(
                      (emp) => (emp as Applicant)._id === employeeId || (emp as { _id?: string })?._id === employeeId
                    );
                    if (rosterApplicant) {
                      applicantData = rosterApplicant as Applicant;
                    }
                  }
                } else if (rosterEntry && typeof rosterEntry === 'object') {
                  // New format: object with employeeId and date
                  if ('employeeId' in rosterEntry) {
                    const entry = rosterEntry as { employeeId: string; date?: string };
                    // Check if date matches (if specified)
                    if (entry.date && entry.date !== dateKey) {
                      return; // Skip if date doesn't match
                    }
                    employeeId = entry.employeeId;
                    // Try to find employee data in shiftRoster
                    if (shift.shiftRoster && Array.isArray(shift.shiftRoster)) {
                      const rosterApplicant = shift.shiftRoster.find(
                        (emp) => (emp as Applicant)._id === employeeId || (emp as { _id?: string })?._id === employeeId
                      );
                      if (rosterApplicant) {
                        applicantData = rosterApplicant as Applicant;
                      }
                    }
                  } else if ('_id' in rosterEntry) {
                    // RosterApplicant format
                    applicantData = rosterEntry as Applicant;
                    employeeId = applicantData._id;
                  }
                }

                if (!employeeId) return;

                // Always create future punch - deduplication happens in allEmployeePunches
                {
                  // Create timeIn by combining date with shift start time
                  const shiftStartTime = new Date(daySchedule.start);
                  const timeIn = new Date(currentDate);
                  timeIn.setHours(
                    shiftStartTime.getHours(),
                    shiftStartTime.getMinutes(),
                    0,
                    0
                  );

                  // Create timeOut by combining date with shift end time
                  const shiftEndTime = new Date(daySchedule.end);
                  const timeOut = new Date(currentDate);
                  timeOut.setHours(
                    shiftEndTime.getHours(),
                    shiftEndTime.getMinutes(),
                    0,
                    0
                  );

                  // Get employee data from roster or use defaults
                  const firstName = applicantData?.firstName || '';
                  const lastName = applicantData?.lastName || '';
                  const employeeName = `${firstName} ${lastName}`.trim() || 'Unknown Employee';
                  const email = applicantData?.email || '';
                  // RosterApplicant may have additional properties, but Applicant type doesn't include them
                  // Use type assertion for properties that may exist on RosterApplicant
                  const profileImg = (applicantData as Applicant & { profileImg?: string })?.profileImg || null;

                  futurePunches.push({
                    _id: `future-${job._id}-${shift.slug}-${employeeId}-${dateKey}`,
                    userId: employeeId,
                    applicantId: employeeId,
                    jobId: job._id,
                    timeIn: timeIn.toISOString(),
                    timeOut: null, // Future punches have no clock out
                    status: 'scheduled',
                    shiftSlug: shift.slug,
                    shiftName: shift.shiftName,
                    employeeName,
                    firstName,
                    lastName,
                    employeeEmail: email,
                    phoneNumber: (applicantData as Applicant & { phone?: string })?.phone || '',
                    profileImg,
                    jobTitle: job.title || '',
                    jobSite: job.venueSlug || job.title || '',
                    location: job.location?.locationName || job.venueSlug || '',
                    isFuture: true, // Mark as future punch
                  } as EmployeePunch);
                }
              });
            });
          });
        }

        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Removed all debug logging to prevent infinite loops

      return futurePunches;
    },
    [] // Remove employeePunches dependency to prevent infinite loop
  );

  // Create stable key for jobShifts to prevent infinite loops
  const jobShiftsKey = useMemo(() => {
    if (!jobShifts || jobShifts.length === 0) return '';
    return jobShifts.map(s => s.slug).sort().join(',');
  }, [jobShifts]);

  // Create jobs with full shift data for generating future punches
  // Use full shift data from jobShifts API which includes defaultSchedule and shiftRoster
  // Use jobShiftsKey instead of jobShifts directly to prevent infinite loops
  const jobsWithFullShiftData = useMemo(() => {
    if (selectedJobId === 'all') {
      return [];
    }

    // Get the selected job from availableJobs
    const job = availableJobs.find((j) => j._id === selectedJobId);
    if (!job) {
      return [];
    }

    // Use full shift data from jobShifts if available, otherwise use job.shifts
    const fullShifts = jobShifts.length > 0 ? jobShifts : (job.shifts || []);

    // Return job with full shift data
    return [
      {
        ...job,
        shifts: fullShifts,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId, availableJobs, jobShiftsKey, jobShifts.length]);

  // Merge actual punches with future punches
  const allEmployeePunches = useMemo(() => {
    const actualPunches = employeePunches || [];
    const startDate = new Date(dateRange.startDate);
    const endDate = new Date(dateRange.endDate);

    // Generate future punches from scheduled shifts using jobs with full shift data
    const futurePunches = generateFuturePunches(
      jobsWithFullShiftData,
      startDate,
      endDate,
      selectedShiftSlug
    );

    // TEMPORARY DEBUG: Log to understand what's happening
    if (process.env.NODE_ENV === 'development' && futurePunches.length === 0 && jobsWithFullShiftData.length > 0) {
      console.log('[Future Punches Debug]', {
        jobsCount: jobsWithFullShiftData.length,
        jobs: jobsWithFullShiftData.map(j => ({
          id: j._id,
          title: j.title,
          shiftsCount: j.shifts?.length || 0,
          shifts: j.shifts?.map(s => ({
            slug: s.slug,
            shiftName: s.shiftName,
            hasDefaultSchedule: !!s.defaultSchedule,
            hasShiftRoster: !!s.shiftRoster,
            shiftRosterLength: s.shiftRoster?.length || 0,
            defaultScheduleKeys: s.defaultSchedule ? Object.keys(s.defaultSchedule) : [],
          })) || [],
        })),
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        selectedShiftSlug,
      });
    }

    // Merge and deduplicate (future punches should not duplicate actual punches)
    const merged = [...actualPunches, ...futurePunches];

    // Remove duplicates based on employee, job, shift, and date
    const unique = merged.reduce((acc, punch) => {
      const key = `${punch.userId || punch.applicantId}-${punch.jobId}-${punch.shiftSlug}-${format(new Date(punch.timeIn), 'yyyy-MM-dd')}`;
      if (!acc.has(key)) {
        acc.set(key, punch);
      } else {
        // Prefer actual punch over future punch
        const existing = acc.get(key);
        if (punch._id && !punch._id.startsWith('future-') && existing?._id?.startsWith('future-')) {
          acc.set(key, punch);
        }
      }
      return acc;
    }, new Map<string, EmployeePunch>());

    return Array.from(unique.values());
  }, [
    employeePunches,
    jobsWithFullShiftData,
    dateRange.startDate,
    dateRange.endDate,
    selectedShiftSlug,
    generateFuturePunches,
  ]);

  // Table data - filtered by search query and future timecards visibility
  const tableData = useMemo(() => {
    const punches = allEmployeePunches || [];
    if (viewType !== 'table') return punches;
    
    let filtered = punches;

    // Filter by employee search query (first name, last name, email)
    if (employeeSearchQuery.trim()) {
      const searchLower = employeeSearchQuery.toLowerCase().trim();
      filtered = filtered.filter((punch) => {
        const firstName = (punch.firstName || '').toLowerCase();
        const lastName = (punch.lastName || '').toLowerCase();
        const employeeName = (punch.employeeName || '').toLowerCase();
        const email = (punch.employeeEmail || '').toLowerCase();
        
        return (
          firstName.includes(searchLower) ||
          lastName.includes(searchLower) ||
          employeeName.includes(searchLower) ||
          email.includes(searchLower)
        );
      });
    }

    // Filter by future timecards visibility
    if (!showFutureTimecards) {
      filtered = filtered.filter((punch) => {
        const isFutureById = punch._id?.startsWith('future-');
        const timeInMs = new Date(punch.timeIn).getTime();
        const isFutureByTime = !Number.isNaN(timeInMs) && timeInMs > Date.now();
        return !isFutureById && !isFutureByTime;
      });
    }

    return filtered;
  }, [allEmployeePunches, viewType, employeeSearchQuery, showFutureTimecards]);

  // Get unique shift slugs from actual punches in the date range
  // ERROR-PROOF: Only show shifts that have data in the current date range
  // NOTE: We extract this from the main employeePunches query to avoid duplicate API calls
  // This must be AFTER employeePunches is defined
  const availableShiftSlugs = useMemo(() => {
    // When "all" shifts is selected, we can extract shift slugs from the current data
    // This avoids making a separate API call just to get shift slugs
    if (!allEmployeePunches || allEmployeePunches.length === 0) {
      return new Set<string>();
    }
    // Extract unique shift slugs from punches (including future punches)
    const shiftSlugs = allEmployeePunches
      .map((punch) => punch.shiftSlug)
      .filter((slug): slug is string => !!slug && slug !== 'all');
    return new Set(shiftSlugs);
  }, [allEmployeePunches]);

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
    // Use employeePunches instead of allEmployeePunches to avoid circular dependency
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

      // Removed debug logging to prevent infinite loops

      return allShifts;
    }

    // If no punches yet, show all shifts (they might have data we haven't loaded)
    return baseShifts;
  }, [selectedJobId, allAvailableShifts, availableShiftSlugs, employeePunches]);

  // Create stable key for availableShifts to prevent infinite loops
  const availableShiftsKey = useMemo(() => {
    if (!availableShifts || availableShifts.length === 0) return '';
    return availableShifts.map(s => s.slug).sort().join(',');
  }, [availableShifts]);

  // Group jobs/shifts by time context; todayStart updates when calendar date changes (avoids stale "Today" after midnight)
  const todayDateKey = format(new Date(), 'yyyy-MM-dd');
  const todayStart = useMemo(
    () => startOfDay(new Date()),
    // todayDateKey ensures recompute when the calendar day changes (e.g. after midnight)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayDateKey]
  );
  const groupedJobs = useMemo(() => {
    const today: GignologyJob[] = [];
    const upcomingOnly: GignologyJob[] = [];
    const upcomingForFilter: GignologyJob[] = [];
    const past: GignologyJob[] = [];

    for (const job of availableJobs) {
      const shifts = job.shifts || [];
      if (shifts.length === 0) {
        past.push(job);
        continue;
      }
      let hasToday = false;
      let hasStartsInFuture = false;
      let latestEnd: Date | null = null;

      for (const shift of shifts) {
        const startStr = shift.shiftStartDate;
        const endStr = shift.shiftEndDate;
        if (!startStr || !endStr) continue;
        try {
          const shiftStartDay = startOfDay(parseISO(startStr));
          const shiftEndDay = startOfDay(parseISO(endStr));
          if (isWithinInterval(todayStart, { start: shiftStartDay, end: shiftEndDay })) {
            hasToday = true;
          }
          if (isAfter(shiftStartDay, todayStart)) {
            hasStartsInFuture = true;
          }
          if (!latestEnd || isAfter(shiftEndDay, latestEnd)) {
            latestEnd = shiftEndDay;
          }
        } catch {
          // skip invalid shift dates
        }
      }

      const hasFuture = latestEnd !== null && !isBefore(latestEnd, todayStart);
      if (hasFuture) {
        upcomingForFilter.push(job);
        if (hasToday) {
          today.push(job);
        } else if (hasStartsInFuture) {
          upcomingOnly.push(job);
        }
      } else {
        past.push(job);
      }
    }

    // Sort upcoming by earliest shift start; past by latest shift end
    const getEarliestShiftStart = (job: GignologyJob): Date | null => {
      let earliest: Date | null = null;
      for (const s of job.shifts || []) {
        if (!s.shiftStartDate) continue;
        try {
          const d = parseISO(s.shiftStartDate);
          if (!earliest || isBefore(d, earliest)) earliest = d;
        } catch {
          // skip
        }
      }
      return earliest;
    };
    const getLatestShiftEnd = (job: GignologyJob): Date | null => {
      let latest: Date | null = null;
      for (const s of job.shifts || []) {
        if (!s.shiftEndDate) continue;
        try {
          const d = parseISO(s.shiftEndDate);
          if (!latest || isAfter(d, latest)) latest = d;
        } catch {
          // skip
        }
      }
      return latest;
    };
    upcomingOnly.sort((a: GignologyJob, b: GignologyJob) => {
      const aStart = getEarliestShiftStart(a);
      const bStart = getEarliestShiftStart(b);
      if (!aStart || !bStart) return 0;
      return isBefore(aStart, bStart) ? -1 : 1;
    });
    upcomingForFilter.sort((a: GignologyJob, b: GignologyJob) => {
      const aStart = getEarliestShiftStart(a);
      const bStart = getEarliestShiftStart(b);
      if (!aStart || !bStart) return 0;
      return isBefore(aStart, bStart) ? -1 : 1;
    });
    past.sort((a, b) => {
      const aEnd = getLatestShiftEnd(a);
      const bEnd = getLatestShiftEnd(b);
      if (!aEnd || !bEnd) return 0;
      return isAfter(aEnd, bEnd) ? -1 : 1;
    });
    return { today, upcomingOnly, upcomingForFilter, past };
  }, [availableJobs, todayStart]);

  // Group shifts by time context (Today / Upcoming / Past) for dropdown UX (date-fns for parsing and comparison)
  // - past: shift has ended (end < today)
  // - today: shift spans today
  // - upcomingOnly: shift starts in future (start > today) — for "All" view Upcoming section (no overlap with Today)
  // - upcomingForFilter: shift has future (end >= today) — for "Upcoming" filter; includes today's shifts so "Upcoming" shows anything with future
  const groupedShifts = useMemo(() => {
    const today: Shift[] = [];
    const upcomingOnly: Shift[] = [];
    const upcomingForFilter: Shift[] = [];
    const past: Shift[] = [];

    for (const shift of availableShifts) {
      const startStr = shift.shiftStartDate;
      const endStr = shift.shiftEndDate;
      if (!startStr || !endStr) {
        past.push(shift);
        continue;
      }
      let shiftStartDay: Date;
      let shiftEndDay: Date;
      try {
        shiftStartDay = startOfDay(parseISO(startStr));
        shiftEndDay = startOfDay(parseISO(endStr));
      } catch {
        past.push(shift);
        continue;
      }

      const spansToday = isWithinInterval(todayStart, { start: shiftStartDay, end: shiftEndDay });
      const hasEnded = isBefore(shiftEndDay, todayStart);
      const startsInFuture = isAfter(shiftStartDay, todayStart);

      if (hasEnded) {
        past.push(shift);
      } else {
        upcomingForFilter.push(shift); // has future (end >= today)
        if (spansToday) {
          today.push(shift);
        } else if (startsInFuture) {
          upcomingOnly.push(shift);
        }
      }
    }
    const sortUpcoming = (a: Shift, b: Shift) => {
      try {
        return isBefore(parseISO(a.shiftStartDate), parseISO(b.shiftStartDate)) ? -1 : 1;
      } catch {
        return 0;
      }
    };
    upcomingOnly.sort(sortUpcoming);
    upcomingForFilter.sort(sortUpcoming);
    past.sort((a, b) => {
      try {
        return isAfter(parseISO(a.shiftEndDate), parseISO(b.shiftEndDate)) ? -1 : 1;
      } catch {
        return 0;
      }
    });
    return { today, upcomingOnly, upcomingForFilter, past };
  }, [availableShifts, todayStart]);

  // Date context label for a shift (for secondary line in dropdown)
  const getShiftDateContext = useCallback((shift: Shift): string => {
    const startStr = shift.shiftStartDate;
    const endStr = shift.shiftEndDate;
    if (!startStr || !endStr) return '—';
    let start: Date;
    let end: Date;
    try {
      start = parseISO(startStr);
      end = parseISO(endStr);
    } catch {
      return '—';
    }
    const shiftStartDay = startOfDay(start);
    const shiftEndDay = startOfDay(end);
    if (isWithinInterval(todayStart, { start: shiftStartDay, end: shiftEndDay })) return 'Today';
    if (isAfter(shiftStartDay, todayStart)) return `Starts ${format(start, 'MMM d')}`;
    return `Ended ${format(end, 'MMM d')}`;
  }, [todayStart]);

  // Reset shift filter when job changes
  useEffect(() => {
    setShiftFilter('all');
  }, [selectedJobId]);

  // Clear job selection when selected job is not in the list (e.g. after unchecking "Include hidden jobs" and API returns fewer jobs)
  useEffect(() => {
    if (selectedJobId === 'all') return;
    const inList = availableJobs.some((j) => j._id === selectedJobId);
    if (!inList) setSelectedJobId('all');
  }, [selectedJobId, availableJobs]);

  // Clear job selection when selected job is not in the current filter (e.g. filter "Past" but selection was "Today")
  useEffect(() => {
    if (selectedJobId === 'all') return;
    if (jobFilter === 'all') return;
    const list = jobFilter === 'today' ? groupedJobs.today : jobFilter === 'upcoming' ? groupedJobs.upcomingForFilter : groupedJobs.past;
    const inList = list.some((j: GignologyJob) => j._id === selectedJobId);
    if (!inList) setSelectedJobId('all');
  }, [jobFilter, selectedJobId, groupedJobs.today, groupedJobs.upcomingForFilter, groupedJobs.past]);

  // Clear shift selection when selected shift is not in the current filter
  useEffect(() => {
    if (selectedShiftSlug === 'all') return;
    if (shiftFilter === 'all') return;
    const list = shiftFilter === 'today' ? groupedShifts.today : shiftFilter === 'upcoming' ? groupedShifts.upcomingForFilter : groupedShifts.past;
    const inList = list.some((s) => s.slug === selectedShiftSlug);
    if (!inList) setSelectedShiftSlug('all');
  }, [shiftFilter, selectedShiftSlug, groupedShifts.today, groupedShifts.upcomingForFilter, groupedShifts.past]);

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
    // Use stable key instead of array reference to prevent infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId, selectedJob?._id, availableShiftsKey, availableShifts.length]);

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

  // Keep baseDate/calendarDate normalized for Table view when tableRange changes (so date nav + display range stay in sync)
  useEffect(() => {
    if (viewType !== 'table') return;
    const dateToUse = baseDate || new Date();
    let normalized: Date;
    if (tableRange === 'day') {
      normalized = startOfDay(dateToUse);
    } else if (tableRange === 'month') {
      normalized = startOfMonth(dateToUse);
    } else {
      normalized = startOfWeek(dateToUse, { weekStartsOn: weekStartsOn || 0 });
    }
    if (baseDate.getTime() !== normalized.getTime()) {
      setBaseDate(normalized);
      setCalendarDate(normalized);
    }
    // Only run when tableRange/viewType/weekStartsOn change; omit baseDate to avoid extra runs on nav
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
    if (!allEmployeePunches || allEmployeePunches.length === 0) {
      return [];
    }

    const events = allEmployeePunches.map((punch) => {
      const punchStart = new Date(punch.timeIn);
      const punchEnd = punch.timeOut ? new Date(punch.timeOut) : new Date();

      // Determine color based on status
      let color = 'blue';
      if (!punch.timeOut) {
        color = 'green'; // Active punch
      } else if (punch.status?.toLowerCase() === 'completed') {
        color = 'blue';
      }

      // Check if this is a future event
      const isFuture = punchStart.getTime() > Date.now();
      // Use light blue for future events
      const eventColor = isFuture ? 'blue' : color;

      // Generate avatar URL if available
      let avatarUrl: string | null = null;
      if (punch.profileImg && primaryCompany?.imageUrl) {
        const userId = punch.applicantId || punch.userId;
        if (userId) {
          if (punch.profileImg.startsWith('http')) {
            avatarUrl = punch.profileImg;
          } else {
            avatarUrl = `${primaryCompany.imageUrl}/users/${userId}/photo/${punch.profileImg}`;
          }
        }
      }

      return {
        id: punch._id,
        title: `${punch.employeeName} - ${punch.jobTitle}${punch.shiftName ? ` (${punch.shiftName})` : ''}`,
        color: eventColor,
        start: punchStart,
        end: punchEnd,
        profileImg: avatarUrl,
        firstName: punch.firstName,
        lastName: punch.lastName,
        applicantId: punch.applicantId,
        userId: punch.userId,
        isFuture: isFuture, // Mark future events
      };
    });

    return events;
  }, [
    allEmployeePunches,
    primaryCompany?.imageUrl, // Use primitive instead of object
  ]);

  // Filter out future events if showFutureTimecards is false
  const filteredCalendarEvents = useMemo(() => {
    if (showFutureTimecards) return calendarEvents;
    const now = Date.now();
    return calendarEvents.filter((event) => {
      const eventStart = new Date(event.start).getTime();
      return eventStart <= now;
    });
  }, [calendarEvents, showFutureTimecards]);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedPunch, setSelectedPunch] = useState<EmployeePunch | null>(
    null
  );
  const [showPunchModal, setShowPunchModal] = useState(false);
  const [overflowDropdownOpen, setOverflowDropdownOpen] = useState(false);
  const [overflowEvents, setOverflowEvents] = useState<CalendarEvent[]>([]);
  const [overflowDropdownPosition, setOverflowDropdownPosition] = useState<{ x: number; y: number; maxHeight: number } | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

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
          // Removed debug logging to prevent infinite loops
          setSelectedPunch(updatedPunch);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeePunches, selectedPunch?._id]);

  // Create stable key from underlying data to prevent infinite loops
  // This depends on allEmployeePunches directly, not calendarEvents
  const calendarEventsKey = useMemo(() => {
    if (!allEmployeePunches || allEmployeePunches.length === 0) return '';
    return allEmployeePunches
      .map(p => `${p._id}-${new Date(p.timeIn).getTime()}-${p.timeOut ? new Date(p.timeOut).getTime() : 0}`)
      .sort()
      .join(',');
  }, [allEmployeePunches]);

  // Update calendar events when they actually change (detected by stable key or filter change)
  const prevEventsKeyRef = useRef<string>('');
  const prevFilterRef = useRef<boolean>(showFutureTimecards);
  useEffect(() => {
    // Update events when key changes or filter changes (filteredCalendarEvents from closure is latest for this run)
    const keyChanged = calendarEventsKey !== prevEventsKeyRef.current;
    const filterChanged = showFutureTimecards !== prevFilterRef.current;
    
    if (keyChanged || filterChanged) {
      prevEventsKeyRef.current = calendarEventsKey;
      prevFilterRef.current = showFutureTimecards;
      setEvents(filteredCalendarEvents);
    }
    // Only depend on key and filter; filteredCalendarEvents is read from closure when we need it (when key/filter change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarEventsKey, showFutureTimecards]);

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

    useEffect(() => {
      // Removed debug logging to prevent infinite loops
      // Only process if we have a selected event and dialog is open
      if (!selectedEvent || !manageEventDialogOpen) {
        return;
      }

      // Early return guards
      // ERROR-PROOF: Don't block if employeePunches is loading - allow the click to work
      if (!selectedEvent || showPunchModal) {
        return;
      }

      // ERROR-PROOF: If we're processing and modal is already open, we're done
      if (isProcessingRef.current && showPunchModal) {
        return;
      }

      // ERROR-PROOF: Only process when dialog opens OR when we're in the process of opening
      // If dialog is closed and we're not processing, return early
      if (!manageEventDialogOpen && !isProcessingRef.current) {
        // Reset processing flag when dialog closes and modal is not open
        if (!showPunchModal) {
          isProcessingRef.current = false;
        }
        return;
      }

      // If we're already processing (but modal not open yet), continue to open it
      if (isProcessingRef.current) {
        return;
      }

      // ERROR-PROOF: Wait for employeePunches to be loaded before processing
      if (!employeePunches || employeePunches.length === 0) {
        // If still loading, wait a bit and try again
        if (isLoading) {
          return;
        }
        // If not loading but no punches, close dialog and show error
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
      const punch = employeePunches.find((p) => p._id === selectedEvent.id);

      if (punch) {
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
        // If punch not found, close dialog
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

  // Helper to check if a punch is in the future
  const isFutureEvent = useCallback((punch: EmployeePunch): boolean => {
    const timeInMs = new Date(punch.timeIn).getTime();
    if (Number.isNaN(timeInMs)) return false;
    return timeInMs > Date.now();
  }, []);

  // Handler to open modal for a punch
  const handleOpenPunchModal = useCallback((punch: EmployeePunch) => {
    // Don't allow editing future punches (scheduled shifts)
    const isFuture = isFutureEvent(punch) || punch._id?.startsWith('future-');
    if (isFuture) {
      // Future punches are read-only, don't open modal
      return;
    }
    setSelectedPunch(punch);
    setShowPunchModal(true);
  }, [isFutureEvent]);

  // Get the currently selected shift from the Shift selector dropdown
  const currentlySelectedShift = useMemo(() => {
    if (selectedShiftSlug === 'all' || !allAvailableShifts.length) return null;
    return allAvailableShifts.find((s) => s.slug === selectedShiftSlug) ?? null;
  }, [selectedShiftSlug, allAvailableShifts]);

  // Compute position badges for each day when a shift is selected
  // Creates generic badge data that the Calendar can render
  const dayBadges = useMemo(() => {
    if (!currentlySelectedShift || !currentlySelectedShift.positions || !currentlySelectedShift.defaultSchedule) {
      return {};
    }

    const badges: Record<string, Array<{ value: number; color: string; textColor?: string; label?: string }>> = {};
    
    // Calculate total requested positions (sum of numberPositions from all positions)
    const totalRequested = currentlySelectedShift.positions.reduce((sum: number, pos) => {
      const num = parseInt(pos.numberPositions?.toString() || '0', 10);
      return sum + (isNaN(num) ? 0 : num);
    }, 0);

    // For each day in defaultSchedule, compute filled count
    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
    
    daysOfWeek.forEach((dayOfWeek) => {
      const daySchedule = currentlySelectedShift.defaultSchedule[dayOfWeek];
      if (!daySchedule || !daySchedule.roster || daySchedule.roster.length === 0) {
        return; // Skip days with no roster
      }

      // Each roster entry represents someone scheduled for that day
      const filled = daySchedule.roster.length;
      const unfilled = Math.max(0, totalRequested - filled);

      // Get dates from roster entries (they should all have the same date for this day)
      daySchedule.roster.forEach((entry) => {
        if (entry.date) {
          const dateKey = entry.date; // Already in 'yyyy-MM-dd' format
          badges[dateKey] = [
            { value: totalRequested, color: 'bg-blue-500', textColor: 'text-white', label: 'Requested positions' },
            { value: filled, color: 'bg-successGreen', textColor: 'text-white', label: 'Filled positions' },
            { value: unfilled, color: 'bg-red-500', textColor: 'text-white', label: 'Unfilled positions' },
          ];
        }
      });
    });

    return badges;
  }, [currentlySelectedShift]);

  // Get shift data for the selected punch (for modal)
  const selectedShift = useMemo(() => {
    if (!selectedPunch || !selectedJob) return undefined;
    const shiftSlug = selectedPunch.shiftSlug;
    if (!shiftSlug || !selectedJob.shifts) return undefined;
    return selectedJob.shifts.find((s) => s.slug === shiftSlug);
  }, [selectedPunch, selectedJob]);

  // Helper to get avatar URL
  const getAvatarUrl = useCallback(
    (punch: EmployeePunch): string | null => {
      if (!punch.profileImg || !primaryCompany?.imageUrl) return null;
      // Use applicantId if available, otherwise userId
      const userId = punch.applicantId || punch.userId;
      if (!userId) return null;
      // Check if it's already a full URL
      if (punch.profileImg.startsWith('http')) {
        return punch.profileImg;
      }
      return `${primaryCompany.imageUrl}/users/${userId}/photo/${punch.profileImg}`;
    },
    [primaryCompany]
  );

  // Handler for overflow click - shows dropdown with all employees
  const handleOverflowClick = useCallback(
    (event: CalendarEvent, allEvents: CalendarEvent[], clickEvent?: MouseEvent) => {
      // Set overflow events and position
      setOverflowEvents(allEvents);
      if (clickEvent) {
        const dropdownWidth = 320; // w-80 = 320px
        const preferredMaxHeight = 400;
        const padding = 16; // Space from edges
        const offset = 10; // Offset from click point
        
        // Calculate horizontal position - ensure it doesn't go off screen
        let x = clickEvent.clientX;
        if (x + dropdownWidth > window.innerWidth - padding) {
          // Position to the left of click if it would go off right edge
          x = Math.max(padding, window.innerWidth - dropdownWidth - padding);
        } else if (x < padding) {
          x = padding;
        }
        
        // Calculate vertical position - prefer below, but position above if not enough space
        let y = clickEvent.clientY;
        const spaceBelow = window.innerHeight - y - padding - offset;
        const spaceAbove = y - padding - offset;
        
        let maxHeight: number;
        if (spaceBelow >= preferredMaxHeight) {
          // Enough space below - position below click
          y = y + offset;
          maxHeight = Math.min(preferredMaxHeight, spaceBelow);
        } else if (spaceAbove > spaceBelow) {
          // More space above - position above click
          y = y - Math.min(preferredMaxHeight, spaceAbove) - offset;
          maxHeight = Math.min(preferredMaxHeight, spaceAbove);
        } else {
          // Use available space below
          y = y + offset;
          maxHeight = Math.max(200, spaceBelow); // Minimum 200px height
        }
        
        setOverflowDropdownPosition({ x, y, maxHeight });
      } else {
        // Fallback to center of screen
        setOverflowDropdownPosition({ 
          x: (window.innerWidth - 320) / 2, 
          y: (window.innerHeight - 400) / 2,
          maxHeight: 400
        });
      }
      setOverflowDropdownOpen(true);
    },
    []
  );

  // Filter employee punches for the selected job that have location data
  const jobEmployeePunches = useMemo(() => {
    if (selectedJobId === 'all' || !allEmployeePunches) return [];
    return allEmployeePunches.filter(
      (punch) =>
        punch.jobId === selectedJobId &&
        (punch.clockInCoordinates || punch.clockOutCoordinates)
    );
  }, [selectedJobId, allEmployeePunches]);

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
              <div className="text-xs text-gray-500">
                {formatPhoneNumber(row.phoneNumber)}
              </div>
            )}
          </div>
        ),
      },
      {
        key: 'firstName',
        header: 'FIRST NAME',
        render: (_, row) => {
          const avatarUrl = getAvatarUrl(row);
          const initials = `${row.firstName?.[0] || ''}${row.lastName?.[0] || ''}`.toUpperCase();
          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8 flex-shrink-0">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt={`${row.firstName} ${row.lastName}`}
                    width={32}
                    height={32}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-medium">
                    {initials || 'N/A'}
                  </div>
                )}
              </Avatar>
              <div>
                <div className="font-medium">
                  {row.firstName?.trim() || 'N/A'}
                </div>
                {row.employeeEmail && (
                  <div className="text-xs text-gray-500">{row.employeeEmail}</div>
                )}
              </div>
            </div>
          );
        },
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
        render: (_, row) => {
          const isFuture = isFutureEvent(row);
          if (isFuture) {
            return <div className="text-gray-400">---- - ----</div>;
          }
          return (
            <div>
              {formatTime24(row.timeIn)} -{' '}
              {row.timeOut ? formatTime24(row.timeOut) : '----'}
            </div>
          );
        },
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
          const isFuture = isFutureEvent(row);
          if (isFuture) {
            return <div className="font-medium text-gray-400">0 hrs</div>;
          }
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
        render: (_, row) => {
          const isFuture = isFutureEvent(row) || row._id?.startsWith('future-');
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation(); // Prevent row click from firing
                handleOpenPunchModal(row);
              }}
              disabled={isFuture}
              className={clsxm(
                "flex items-center justify-center p-2 rounded-md transition-colors",
                isFuture
                  ? "text-gray-300 cursor-not-allowed"
                  : "text-gray-600 hover:text-teal-600 hover:bg-teal-50"
              )}
              title={isFuture ? "Future scheduled shift (not editable)" : "Edit punch details"}
            >
              <Pencil className="h-4 w-4" />
            </button>
          );
        },
        className: 'w-16 text-center',
      },
    ],
    [handleOpenPunchModal, getAvatarUrl, isFutureEvent]
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

        {/* Job Selector and Clocked In Summary Row - responsive: stack on mobile, row on sm+ */}
        <div className="flex flex-wrap gap-4 mb-3">
          {/* Job Selector */}
          <div className="w-full min-w-0 sm:flex-1 sm:max-w-md">
            <div className="flex flex-wrap items-center gap-4 mb-1">
              <label className="text-sm font-medium text-gray-700 shrink-0">
                Select Job
              </label>
              <ToggleGroup
                type="single"
                value={jobFilter}
                onValueChange={(v) => v && setJobFilter(v as 'all' | 'today' | 'upcoming' | 'past')}
                className="flex flex-wrap gap-1"
              >
                <ToggleGroupItem value="all" aria-label="All jobs" className="text-xs px-2 py-1 h-7">
                  All
                </ToggleGroupItem>
                <ToggleGroupItem value="today" aria-label="Today" className="text-xs px-2 py-1 h-7">
                  Today
                </ToggleGroupItem>
                <ToggleGroupItem value="upcoming" aria-label="Upcoming" className="text-xs px-2 py-1 h-7">
                  Upcoming
                </ToggleGroupItem>
                <ToggleGroupItem value="past" aria-label="Past" className="text-xs px-2 py-1 h-7">
                  Past
                </ToggleGroupItem>
              </ToggleGroup>
              <label className="flex items-center gap-1.5 shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeHiddenJobs}
                  onChange={(e) => setIncludeHiddenJobs(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  aria-label="Include hidden jobs"
                />
                <span className="text-sm text-gray-600">Hidden jobs</span>
              </label>
            </div>
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
                {jobFilter === 'all' && (
                  <>
                    {groupedJobs.today.length > 0 && (
                      <SelectGroup>
                        <SelectGroupLabel>Today</SelectGroupLabel>
                        {groupedJobs.today.map((job) => {
                          const displayTitle = job.title
                            ? job.title.charAt(0).toUpperCase() + job.title.slice(1)
                            : job._id;
                          return (
                            <SelectItem key={job._id} value={job._id}>
                              {displayTitle}
                            </SelectItem>
                          );
                        })}
                      </SelectGroup>
                    )}
                    {groupedJobs.upcomingOnly.length > 0 && (
                      <SelectGroup>
                        <SelectGroupLabel>Upcoming</SelectGroupLabel>
                        {groupedJobs.upcomingOnly.map((job) => {
                          const displayTitle = job.title
                            ? job.title.charAt(0).toUpperCase() + job.title.slice(1)
                            : job._id;
                          return (
                            <SelectItem key={job._id} value={job._id}>
                              {displayTitle}
                            </SelectItem>
                          );
                        })}
                      </SelectGroup>
                    )}
                    {groupedJobs.past.length > 0 && (
                      <SelectGroup>
                        <SelectGroupLabel>Past</SelectGroupLabel>
                        {groupedJobs.past.map((job) => {
                          const displayTitle = job.title
                            ? job.title.charAt(0).toUpperCase() + job.title.slice(1)
                            : job._id;
                          return (
                            <SelectItem key={job._id} value={job._id}>
                              {displayTitle}
                            </SelectItem>
                          );
                        })}
                      </SelectGroup>
                    )}
                  </>
                )}
                {jobFilter === 'today' && groupedJobs.today.length > 0 && (
                  <SelectGroup>
                    <SelectGroupLabel>Today</SelectGroupLabel>
                    {groupedJobs.today.map((job) => {
                      const displayTitle = job.title
                        ? job.title.charAt(0).toUpperCase() + job.title.slice(1)
                        : job._id;
                      return (
                        <SelectItem key={job._id} value={job._id}>
                          {displayTitle}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                )}
                {jobFilter === 'upcoming' && groupedJobs.upcomingForFilter.length > 0 && (
                  <SelectGroup>
                    <SelectGroupLabel>Upcoming</SelectGroupLabel>
                    {groupedJobs.upcomingForFilter.map((job) => {
                      const displayTitle = job.title
                        ? job.title.charAt(0).toUpperCase() + job.title.slice(1)
                        : job._id;
                      return (
                        <SelectItem key={job._id} value={job._id}>
                          {displayTitle}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                )}
                {jobFilter === 'past' && groupedJobs.past.length > 0 && (
                  <SelectGroup>
                    <SelectGroupLabel>Past</SelectGroupLabel>
                    {groupedJobs.past.map((job) => {
                      const displayTitle = job.title
                        ? job.title.charAt(0).toUpperCase() + job.title.slice(1)
                        : job._id;
                      return (
                        <SelectItem key={job._id} value={job._id}>
                          {displayTitle}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                )}
                {((jobFilter === 'today' && groupedJobs.today.length === 0) ||
                  (jobFilter === 'upcoming' && groupedJobs.upcomingForFilter.length === 0) ||
                  (jobFilter === 'past' && groupedJobs.past.length === 0)) && (
                  <div className="py-2 px-2 text-sm text-muted-foreground">
                    No jobs in this period
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Shift Selector - Only show when a job is selected */}
          {selectedJobId !== 'all' && (
            <div className="w-full min-w-0 sm:flex-1 sm:max-w-md">
              <div className="flex flex-wrap items-center gap-4 mb-1">
                <label className="text-sm font-medium text-gray-700 shrink-0">
                  Select Shift
                </label>
                <ToggleGroup
                  type="single"
                  value={shiftFilter}
                  onValueChange={(v) => v && setShiftFilter(v as 'all' | 'today' | 'upcoming' | 'past')}
                  className="flex flex-wrap gap-1"
                >
                  <ToggleGroupItem value="all" aria-label="All shifts" className="text-xs px-2 py-1 h-7">
                    All
                  </ToggleGroupItem>
                  <ToggleGroupItem value="today" aria-label="Today" className="text-xs px-2 py-1 h-7">
                    Today
                  </ToggleGroupItem>
                  <ToggleGroupItem value="upcoming" aria-label="Upcoming" className="text-xs px-2 py-1 h-7">
                    Upcoming
                  </ToggleGroupItem>
                  <ToggleGroupItem value="past" aria-label="Past" className="text-xs px-2 py-1 h-7">
                    Past
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
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
                    {shiftFilter === 'all' && (
                      <>
                        {groupedShifts.today.length > 0 && (
                          <SelectGroup>
                            <SelectGroupLabel>Today</SelectGroupLabel>
                            {groupedShifts.today.map((shift) => {
                              const displayName = (shift.shiftName || shift.slug).charAt(0).toUpperCase() + (shift.shiftName || shift.slug).slice(1);
                              const dateContext = getShiftDateContext(shift);
                              return (
                                <SelectItem key={shift.slug} value={shift.slug}>
                                  <div className="flex flex-col items-start">
                                    <span>{displayName}</span>
                                    <span className="text-xs text-muted-foreground font-normal">{dateContext}</span>
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectGroup>
                        )}
                        {groupedShifts.upcomingOnly.length > 0 && (
                          <SelectGroup>
                            <SelectGroupLabel>Upcoming</SelectGroupLabel>
                            {groupedShifts.upcomingOnly.map((shift) => {
                              const displayName = (shift.shiftName || shift.slug).charAt(0).toUpperCase() + (shift.shiftName || shift.slug).slice(1);
                              const dateContext = getShiftDateContext(shift);
                              return (
                                <SelectItem key={shift.slug} value={shift.slug}>
                                  <div className="flex flex-col items-start">
                                    <span>{displayName}</span>
                                    <span className="text-xs text-muted-foreground font-normal">{dateContext}</span>
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectGroup>
                        )}
                        {groupedShifts.past.length > 0 && (
                          <SelectGroup>
                            <SelectGroupLabel>Past</SelectGroupLabel>
                            {groupedShifts.past.map((shift) => {
                              const displayName = (shift.shiftName || shift.slug).charAt(0).toUpperCase() + (shift.shiftName || shift.slug).slice(1);
                              const dateContext = getShiftDateContext(shift);
                              return (
                                <SelectItem key={shift.slug} value={shift.slug}>
                                  <div className="flex flex-col items-start">
                                    <span>{displayName}</span>
                                    <span className="text-xs text-muted-foreground font-normal">{dateContext}</span>
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectGroup>
                        )}
                      </>
                    )}
                    {shiftFilter === 'today' && groupedShifts.today.length > 0 && (
                      <SelectGroup>
                        <SelectGroupLabel>Today</SelectGroupLabel>
                        {groupedShifts.today.map((shift) => {
                          const displayName = (shift.shiftName || shift.slug).charAt(0).toUpperCase() + (shift.shiftName || shift.slug).slice(1);
                          const dateContext = getShiftDateContext(shift);
                          return (
                            <SelectItem key={shift.slug} value={shift.slug}>
                              <div className="flex flex-col items-start">
                                <span>{displayName}</span>
                                <span className="text-xs text-muted-foreground font-normal">{dateContext}</span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectGroup>
                    )}
                    {shiftFilter === 'upcoming' && groupedShifts.upcomingForFilter.length > 0 && (
                      <SelectGroup>
                        <SelectGroupLabel>Upcoming</SelectGroupLabel>
                        {groupedShifts.upcomingForFilter.map((shift) => {
                          const displayName = (shift.shiftName || shift.slug).charAt(0).toUpperCase() + (shift.shiftName || shift.slug).slice(1);
                          const dateContext = getShiftDateContext(shift);
                          return (
                            <SelectItem key={shift.slug} value={shift.slug}>
                              <div className="flex flex-col items-start">
                                <span>{displayName}</span>
                                <span className="text-xs text-muted-foreground font-normal">{dateContext}</span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectGroup>
                    )}
                    {shiftFilter === 'past' && groupedShifts.past.length > 0 && (
                      <SelectGroup>
                        <SelectGroupLabel>Past</SelectGroupLabel>
                        {groupedShifts.past.map((shift) => {
                          const displayName = (shift.shiftName || shift.slug).charAt(0).toUpperCase() + (shift.shiftName || shift.slug).slice(1);
                          const dateContext = getShiftDateContext(shift);
                          return (
                            <SelectItem key={shift.slug} value={shift.slug}>
                              <div className="flex flex-col items-start">
                                <span>{displayName}</span>
                                <span className="text-xs text-muted-foreground font-normal">{dateContext}</span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectGroup>
                    )}
                    {((shiftFilter === 'today' && groupedShifts.today.length === 0) ||
                      (shiftFilter === 'upcoming' && groupedShifts.upcomingForFilter.length === 0) ||
                      (shiftFilter === 'past' && groupedShifts.past.length === 0)) && (
                      <div className="py-2 px-2 text-sm text-muted-foreground">
                        No shifts in this period
                      </div>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Geofence Map Button - Only show when a job is selected and has location data */}
          {selectedJobId !== 'all' && selectedJob && geofenceLocationData && (
            <div className="flex flex-col shrink-0">
              <label className="block text-sm font-medium text-gray-700 mb-3 opacity-0 pointer-events-none">
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

          {/* Currently Clocked In Summary Card - full width on mobile so it doesn't overflow */}
          <div className="flex item-center bg-teal-50 border border-teal-200 rounded-lg p-2 w-full min-w-0 sm:min-w-[240px] sm:w-auto">
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

        {/* View Toggle Buttons and Controls */}
        <div className="flex flex-col gap-4">
          {/* First Row: View Type and Date Navigation */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* View Type: Table | Calendar — same Day | Week | Month toggle for both (range for Table, view for Calendar) */}
            <div className="flex flex-wrap items-center gap-4">
              <ToggleGroup
                type="single"
                value={viewType === 'table' ? 'table' : 'calendar'}
                onValueChange={(value) => {
                  if (value === 'table') {
                    setViewType('table');
                  } else if (value === 'calendar') {
                    setViewType((prev) =>
                      prev === 'table' ? tableRange : prev
                    );
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
                  value="calendar"
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    viewType !== 'table'
                      ? 'bg-blue-500 text-white shadow-md'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Calendar
                </ToggleGroupItem>
              </ToggleGroup>

              {/* Same Day | Week | Month toggle for both: Table range when Table selected, Calendar view when Calendar selected */}
              <ToggleGroup
                type="single"
                value={
                  viewType === 'table'
                    ? tableRange
                    : (viewType as 'day' | 'week' | 'month')
                }
                onValueChange={(value) => {
                  if (!value) return;
                  if (viewType === 'table') {
                    setTableRange(value as 'day' | 'week' | 'month');
                  } else {
                    setViewType(value as 'day' | 'week' | 'month');
                  }
                }}
                className="inline-flex rounded-lg border border-gray-300 p-1"
              >
                <ToggleGroupItem
                  value="day"
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                    (viewType === 'table' ? tableRange : viewType) === 'day'
                      ? 'bg-blue-500 text-white shadow-md'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Day
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="week"
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                    (viewType === 'table' ? tableRange : viewType) === 'week'
                      ? 'bg-blue-500 text-white shadow-md'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Week
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="month"
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                    (viewType === 'table' ? tableRange : viewType) === 'month'
                      ? 'bg-blue-500 text-white shadow-md'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  Month
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* Include Future Timecards - shared for both Table and Calendar */}
            <div className="flex items-center gap-2 whitespace-nowrap">
              <input
                type="checkbox"
                id="show-future-timecards"
                checked={showFutureTimecards}
                onChange={(e) => setShowFutureTimecards(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="show-future-timecards" className="text-sm font-medium text-gray-700 cursor-pointer">
                Include Future Timecards
              </label>
            </div>

            {/* Date Navigation */}
            <div className="flex items-center justify-end gap-2">
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
              <span className="text-center font-medium text-sm px-2 min-w-[180px]">
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
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {viewType === 'table'
                ? 'Weekly Shift Details'
                : viewType === 'month'
                  ? 'Monthly Shift Details'
                  : viewType === 'week'
                    ? 'Weekly Shift Details'
                    : 'Daily Shift Details'}
            </h2>
          </div>

          {/* Table Controls - Only show in table view (Day | Week | Month and Include Future Timecards are in top row) */}
          {viewType === 'table' && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              {/* Mobile: full width; sm and up: fixed half-width so it doesn't stretch (max-w-md = 28rem) */}
              <div className="relative w-full sm:w-1/2 sm:min-w-0 sm:max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 z-10 pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search employees..."
                  value={employeeSearchQuery}
                  onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                  className="pl-10 h-8 text-sm w-full"
                />
              </div>
            </div>
          )}
        </div>

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
              // Check if this is a future punch by ID or time
              const isFutureById = row._id?.startsWith('future-');
              const timeInMs = new Date(row.timeIn).getTime();
              const isFutureByTime = !Number.isNaN(timeInMs) && timeInMs > Date.now();
              
              if (isFutureById || isFutureByTime) {
                // Light blue background to indicate upcoming shifts
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
            dayBadges={dayBadges}
            onOverflowClick={handleOverflowClick}
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
        shift={selectedShift}
        job={selectedJob ? {
          additionalConfig: selectedJob.additionalConfig
        } : undefined}
        onSuccess={() => {
          // Refetch data after successful update will be handled by queryClient
          // The modal component will handle the refetch
        }}
      />

      {/* Overflow Dropdown - Custom positioned */}
      {isMounted &&
        overflowDropdownOpen &&
        overflowEvents.length > 0 &&
        overflowDropdownPosition &&
        createPortal(
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0"
              style={{ zIndex: 20000 }}
              onClick={() => setOverflowDropdownOpen(false)}
            />

            {/* Dropdown Content */}
            <div
              className="fixed bg-white border border-gray-200 rounded-lg shadow-lg w-80 flex flex-col"
              style={{
                left: `${overflowDropdownPosition.x}px`,
                top: `${overflowDropdownPosition.y}px`,
                maxHeight: `${overflowDropdownPosition.maxHeight}px`,
                zIndex: 20001,
              }}
            >
              <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 border-b sticky top-0 bg-white z-10 flex-shrink-0">
                {overflowEvents.length} Employee
                {overflowEvents.length !== 1 ? 's' : ''}
              </div>
              <div
                className="py-1 overflow-y-auto flex-1 min-h-0"
                style={{ scrollbarWidth: 'thin' }}
              >
                {overflowEvents.map((event) => {
                  // Find the matching punch
                  const punch = allEmployeePunches.find((p) => p._id === event.id);
                  if (!punch) return null;

                  const avatarUrl = getAvatarUrl(punch);
                  const initials = `${punch.firstName?.[0] || ''}${punch.lastName?.[0] || ''}`.toUpperCase();
                  const isFuture =
                    isFutureEvent(punch) || punch._id?.startsWith('future-');

                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => {
                        if (!isFuture) {
                          handleOpenPunchModal(punch);
                        }
                        setOverflowDropdownOpen(false);
                      }}
                      disabled={isFuture}
                      className={clsxm(
                        'w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 transition-colors',
                        isFuture && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      {avatarUrl ? (
                        <Image
                          src={avatarUrl}
                          alt={punch.employeeName}
                          width={32}
                          height={32}
                          className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-medium flex-shrink-0">
                          {initials || 'N/A'}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {punch.employeeName}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {punch.jobTitle}
                          {punch.shiftName && ` • ${punch.shiftName}`}
                        </div>
                        <div className="text-xs text-gray-400">
                          {formatTime24(punch.timeIn)} -{' '}
                          {punch.timeOut ? formatTime24(punch.timeOut) : '----'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>,
          document.body
        )}

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
          employeePunches={jobEmployeePunches}
          primaryCompanyImageUrl={primaryCompany?.imageUrl}
        />
      )}
    </div>
  );
}
