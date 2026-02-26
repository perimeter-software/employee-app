import React, { useState, useMemo } from 'react';
import { Formik, Form, Field, FieldInputProps } from 'formik';
import * as Yup from 'yup';
import { Save, MapPin } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { MapModal } from '../MapModal';
import { toast } from 'sonner';
import type { EmployeePunch } from '@/domains/punch/types/employee-punches.types';
import type { Shift } from '@/domains/job/types/job.types';
import { formatPhoneNumber } from '@/lib/utils';
import { punchQueryKeys } from '@/domains/punch/services';

interface EmployeePunchDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  punch: EmployeePunch | null;
  onSuccess?: () => void;
  shift?: Shift; // Optional shift data for validation
  job?: { additionalConfig?: { earlyClockInMinutes?: number } }; // Optional job data for early clock-in config
}

// Helper to get shift schedule for a specific day
const getShiftScheduleForDay = (shift: Shift, date: Date) => {
  if (!shift?.defaultSchedule) return null;
  
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
  const dayName = daysOfWeek[date.getDay()];
  const daySchedule = shift.defaultSchedule[dayName];
  
  if (!daySchedule?.start || !daySchedule?.end) return null;
  
  return {
    start: new Date(daySchedule.start),
    end: new Date(daySchedule.end),
  };
};

// Helper to combine date with time from another date (similar to shift-job-utils)
const combineDateWithTime = (date: Date, timeSource: Date): Date => {
  const combined = new Date(date);
  combined.setHours(timeSource.getHours(), timeSource.getMinutes(), timeSource.getSeconds(), timeSource.getMilliseconds());
  return combined;
};

// Create validation schema function that can access shift data
const createValidationSchema = (shift?: Shift, punch?: EmployeePunch | null, job?: { additionalConfig?: { earlyClockInMinutes?: number } }) => {
  return Yup.object({
    timeIn: Yup.string()
      .required('Time in is required')
      .test(
        'timeIn-within-shift',
        'Time in must be within the shift time range',
        function (value) {
          if (!value || !shift || !punch) return true; // Skip validation if no shift/punch data
          
          const timeInDate = new Date(value);
          const daySchedule = getShiftScheduleForDay(shift, timeInDate);
          
          if (!daySchedule) return true; // No schedule for this day, skip validation
          
          // Get early clock-in minutes from job config (default to 0)
          const earlyClockInMinutes = job?.additionalConfig?.earlyClockInMinutes ?? 0;
          
          // Combine the punch date with the shift schedule times
          const shiftStartTime = combineDateWithTime(timeInDate, daySchedule.start);
          const shiftEndTime = combineDateWithTime(timeInDate, daySchedule.end);
          
          // Check if shift is overnight (end time is before start time)
          const isOvernightShift = 
            daySchedule.start.getHours() > daySchedule.end.getHours() ||
            (daySchedule.start.getHours() === daySchedule.end.getHours() &&
             daySchedule.start.getMinutes() > daySchedule.end.getMinutes());
          
          if (isOvernightShift) {
            // For overnight shifts, end time is on next day
            shiftEndTime.setDate(shiftEndTime.getDate() + 1);
          }
          
          // Calculate earliest allowed clock-in time (with early clock-in buffer)
          const earliestClockIn = new Date(shiftStartTime.getTime() - earlyClockInMinutes * 60000);
          
          // Check if timeIn is within the allowed window
          const isValid = timeInDate >= earliestClockIn && timeInDate <= shiftEndTime;
          
          if (!isValid) {
            const startTimeStr = format(daySchedule.start, 'h:mm a');
            const endTimeStr = format(daySchedule.end, 'h:mm a');
            const bufferText = earlyClockInMinutes > 0 ? ` (allows ${earlyClockInMinutes} min early clock-in)` : '';
            return this.createError({
              message: `Time in must be between ${startTimeStr} and ${endTimeStr}${bufferText}`,
            });
          }
          
          return true;
        }
      ),
    timeOut: Yup.string()
      .nullable()
      .test(
        'timeOut-validation',
        'Time out validation',
        function (value) {
          const { timeIn } = this.parent;
          
          // Validate timeOut > timeIn
          if (value && timeIn) {
            const timeInDate = new Date(timeIn);
            const timeOutDate = new Date(value);
            const diffMs = timeOutDate.getTime() - timeInDate.getTime();
            
            // Check if this is an overnight shift (different calendar days)
            const timeInDay = timeInDate.toDateString();
            const timeOutDay = timeOutDate.toDateString();
            const isOvernight = timeInDay !== timeOutDay;
            
            if (isOvernight) {
              // Overnight shift: timeOut is on a different day than timeIn
              // Validate that timeOut date is after timeIn date
              if (timeOutDate < timeInDate) {
                return this.createError({
                  message: 'Time out date must be on or after time in date. For overnight shifts, time out should be on the next day.',
                });
              }
              
              // Calculate actual duration (accounting for overnight)
              // For overnight shifts, duration should be reasonable (0-24 hours)
              if (diffMs < 0) {
                // This shouldn't happen if dates are correct, but handle it
                const overnightDuration = (24 * 60 * 60 * 1000) + diffMs;
                if (overnightDuration < 0 || overnightDuration > 24 * 60 * 60 * 1000) {
                  return this.createError({
                    message: 'Time out must be after time in. For overnight shifts, ensure the duration is reasonable (0-24 hours).',
                  });
                }
              } else if (diffMs > 24 * 60 * 60 * 1000) {
                return this.createError({
                  message: 'Time out cannot be more than 24 hours after time in',
                });
              }
            } else {
              // Same day: timeOut must be after timeIn
              if (diffMs <= 0) {
                return this.createError({
                  message: 'Time out must be after time in on the same day.',
                });
              }
              
              // Same day shifts shouldn't be more than 24 hours
              if (diffMs > 24 * 60 * 60 * 1000) {
                return this.createError({
                  message: 'Time out cannot be more than 24 hours after time in',
                });
              }
            }
            
            // Validate timeOut is within shift time range if shift data is available
            if (shift && punch) {
              const timeInDate = new Date(timeIn);
              const daySchedule = getShiftScheduleForDay(shift, timeInDate);
              
              if (daySchedule) {
                // Combine the punch date with the shift schedule times
                const shiftStartTime = combineDateWithTime(timeInDate, daySchedule.start);
                const shiftEndTimeBase = combineDateWithTime(timeInDate, daySchedule.end);
                
                // Check if shift is overnight (end time is before start time)
                const shiftIsOvernight = 
                  daySchedule.start.getHours() > daySchedule.end.getHours() ||
                  (daySchedule.start.getHours() === daySchedule.end.getHours() &&
                   daySchedule.start.getMinutes() > daySchedule.end.getMinutes());
                
                // For overnight shifts, end time is on next day
                const shiftEndTime = shiftIsOvernight 
                  ? (() => {
                      const nextDay = new Date(shiftEndTimeBase);
                      nextDay.setDate(nextDay.getDate() + 1);
                      return nextDay;
                    })()
                  : shiftEndTimeBase;
                
                // Allow late clock-out (up to 30 minutes after shift end)
                const lateClockOutBuffer = 30; // minutes
                const latestClockOut = new Date(shiftEndTime.getTime() + lateClockOutBuffer * 60000);
                
                // Check if timeOut is within the allowed window
                const isValid = timeOutDate >= shiftStartTime && timeOutDate <= latestClockOut;
                
                if (!isValid) {
                  const startTimeStr = format(daySchedule.start, 'h:mm a');
                  const endTimeStr = format(daySchedule.end, 'h:mm a');
                  return this.createError({
                    message: `Time out must be between ${startTimeStr} and ${endTimeStr} (allows ${lateClockOutBuffer} min late clock-out)`,
                  });
                }
              }
            }
          }
          
          return true;
        }
      ),
    userNote: Yup.string().max(500, 'Note cannot exceed 500 characters'),
    managerNote: Yup.string().max(
      500,
      'Manager note cannot exceed 500 characters'
    ),
  });
};

export function EmployeePunchDetailsModal({
  isOpen,
  onClose,
  punch,
  onSuccess,
  shift,
  job,
}: EmployeePunchDetailsModalProps) {
  // ERROR-PROOF: All hooks must be called before any conditional returns
  // This ensures hooks are always called in the same order
  const [showMapModal, setShowMapModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const queryClient = useQueryClient();

  // ERROR-PROOF: Prepare initial values - recalculate when punch changes
  // Use useMemo to ensure values update when punch prop changes
  // Handle null punch case by providing default values
  const initialValues = useMemo(() => ({
    timeIn: punch?.timeIn || '',
    timeOut: punch?.timeOut || '',
    userNote: (punch as unknown as { userNote?: string })?.userNote || '',
    managerNote:
      (punch as unknown as { managerNote?: string })?.managerNote || '',
  }), [punch]);

  // ERROR-PROOF: Check if coordinates exist for map button (handle null punch)
  const hasCoordinates = useMemo(() => {
    if (!punch) return false;
    const coords = (punch as unknown as { clockInCoordinates?: { latitude: number; longitude: number } })
      .clockInCoordinates;
    return (
      coords &&
      typeof coords.latitude === 'number' &&
      typeof coords.longitude === 'number'
    );
  }, [punch]);

  // ERROR-PROOF: Prepare location data for map (handle null punch)
  const clockInCoords = useMemo(() => {
    if (!punch) return null;
    return (punch as unknown as {
      clockInCoordinates?: { latitude: number; longitude: number };
    }).clockInCoordinates || null;
  }, [punch]);

  const userLocation = useMemo(() => {
    if (!clockInCoords) return null;
    return {
      latitude: clockInCoords.latitude,
      longitude: clockInCoords.longitude,
    };
  }, [clockInCoords]);

  const jobLocation = useMemo(() => {
    if (!punch) return null;
    const jobLoc = (punch as unknown as {
      jobLocation?: { latitude: number; longitude: number };
    }).jobLocation;
    if (!jobLoc) return null;
    return {
      latitude: jobLoc.latitude,
      longitude: jobLoc.longitude,
    };
  }, [punch]);

  const geoFenceRadius = useMemo(() => {
    if (!punch) return 100;
    return (punch as unknown as { geoFenceRadius?: number }).geoFenceRadius || 100;
  }, [punch]);

  // Check if this is an overnight shift (timeOut is on a different day than timeIn)
  // ERROR-PROOF: Must be called before any early returns to maintain hook order
  const isOvernightShift = useMemo(() => {
    if (!punch?.timeIn || !punch?.timeOut) return false;
    const timeInDate = new Date(punch.timeIn);
    const timeOutDate = new Date(punch.timeOut);
    // Check if they're on different calendar days
    return timeInDate.toDateString() !== timeOutDate.toDateString();
  }, [punch?.timeIn, punch?.timeOut]);

  // ERROR-PROOF: Early return AFTER all hooks are called
  // This ensures hooks are always called in the same order
  if (!punch) return null;

  const handleSave = async (values: typeof initialValues) => {
    if (!punch) return;

    setIsUpdating(true);
    try {
      // Call the update API
      const response = await fetch(
        `/api/punches/${punch.userId}/${punch.jobId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'update',
            punch: {
              _id: punch._id,
              userId: punch.userId,
              applicantId: punch.applicantId,
              jobId: punch.jobId,
              timeIn: values.timeIn,
              timeOut: values.timeOut || null,
              userNote: values.userNote,
              managerNote: values.managerNote,
              status: punch.status,
              shiftSlug: punch.shiftSlug,
              shiftName: punch.shiftName,
            },
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to update punch');
      }

      toast.success('Punch updated successfully!');
      
      // Invalidate punch-domain queries so table and active card refetch (same keys as useEmployeePunches / useActiveEmployeeCount)
      queryClient.invalidateQueries({
        queryKey: [...punchQueryKeys.all, 'employeePunches'],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: [...punchQueryKeys.all, 'activeCount'],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: [...punchQueryKeys.all, 'activeEmployees'],
        exact: false,
      });

      await queryClient.refetchQueries({
        queryKey: [...punchQueryKeys.all, 'employeePunches'],
        exact: false,
      });
      
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error updating punch:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to update punch. Please try again.'
      );
    } finally {
      setIsUpdating(false);
    }
  };

  // Same date-time format as Time In / Time Out fields (for correction "Previous" display)
  const formatTimeField = (iso: string) => {
    if (!iso || typeof iso !== 'string') return '—';
    try {
      const d = parseISO(iso);
      if (isNaN(d.getTime())) return '—';
      return format(d, "yyyy-MM-dd 'at' h:mm a");
    } catch {
      return '—';
    }
  };

  const formatModifiedAt = (iso: string | undefined) => {
    if (!iso || typeof iso !== 'string') return '—';
    try {
      const d = parseISO(iso);
      if (isNaN(d.getTime())) return '—';
      return format(d, 'MMM d, yyyy \'at\' h:mm a');
    } catch {
      return '—';
    }
  };

  // Parse datetime for datetime-local input, handling timezone correctly
  // For overnight shifts, ensure we display the correct date
  const parseDateTime = (value: string) => {
    if (!value) return '';
    
    try {
      const date = new Date(value);
      
      // Validate the date
      if (isNaN(date.getTime())) {
        console.warn('Invalid date value:', value);
        return '';
      }
      
      // Use local time components to display in user's timezone
      // This ensures the date shown matches what the user expects
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      
      // Return in format: YYYY-MM-DDTHH:mm (required by datetime-local input)
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (error) {
      console.error('Error parsing date:', value, error);
      return '';
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md p-6 gap-6">
          {/* Header */}
          <DialogTitle className="sr-only">Employee Punch Details</DialogTitle>
          <div className="flex items-center justify-between -mt-2">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {punch.employeeName || 'Employee'}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {punch.jobTitle || 'Job'} - {punch.shiftName || 'Shift'}
              </p>
            </div>
            {/* View Map Button - Show if coordinates exist */}
            {hasCoordinates && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMapModal(true)}
                className="flex items-center gap-2 mt-4"
              >
                <MapPin className="h-4 w-4" />
                View Map
              </Button>
            )}
          </div>

          {/* Employee Info */}
          <div className="bg-gray-50 rounded-md p-3 space-y-1">
            <div className="text-sm">
              <span className="font-medium text-gray-700">Email:</span>{' '}
              <span className="text-gray-600">{punch.employeeEmail || 'N/A'}</span>
            </div>
            <div className="text-sm">
              <span className="font-medium text-gray-700">Phone:</span>{' '}
              <span className="text-gray-600">
                {formatPhoneNumber(punch.phoneNumber)}
              </span>
            </div>
            <div className="text-sm">
              <span className="font-medium text-gray-700">Location:</span>{' '}
              <span className="text-gray-600">{punch.location || punch.jobSite || 'N/A'}</span>
            </div>
            <div className="text-sm">
              <span className="font-medium text-gray-700">Status:</span>{' '}
              <span className="text-gray-600">{punch.status || 'N/A'}</span>
            </div>
          </div>

          {/* Form Content */}
          <Formik
            initialValues={initialValues}
            validationSchema={createValidationSchema(shift, punch, job)}
            onSubmit={handleSave}
            enableReinitialize={true}
            key={punch._id}
          >
            {({ errors, touched, setFieldValue, values }) => (
              <Form className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-900">
                    Time In
                  </Label>
                  <Field name="timeIn">
                    {({ field }: { field: FieldInputProps<string> }) => (
                      <Input
                        type="datetime-local"
                        value={parseDateTime(field.value)}
                        onChange={(e) => {
                          const newDate = new Date(e.target.value);
                          setFieldValue('timeIn', newDate.toISOString());
                        }}
                        className={`h-11 ${
                          errors.timeIn && touched.timeIn
                            ? 'border-red-300'
                            : ''
                        }`}
                      />
                    )}
                  </Field>
                  {touched.timeIn && errors.timeIn && (
                    <p className="text-sm text-red-600">{errors.timeIn}</p>
                  )}
                  {punch.updateHistory && punch.updateHistory.length > 0 && (() => {
                    type Entry = {
                      timeIn: string;
                      timeInBefore?: string;
                      modifiedByName?: string;
                      modifiedDate: string;
                    };
                    const entriesThatChangedTimeIn = punch.updateHistory!.filter((entry) => {
                      const e = entry as Entry;
                      return e.timeInBefore != null && e.timeInBefore !== e.timeIn;
                    }) as Entry[];
                    if (entriesThatChangedTimeIn.length === 0) return null;
                    return (
                      <div className="space-y-2">
                        {entriesThatChangedTimeIn.map((entry, i) => {
                          const by = entry.modifiedByName?.trim() || (punch as { modifiedByName?: string }).modifiedByName?.trim() || '—';
                          const at = formatModifiedAt(entry.modifiedDate);
                          const previous = entry.timeInBefore
                            ? formatTimeField(entry.timeInBefore)
                            : '—';
                          return (
                            <div key={i} className="rounded-md bg-amber-50 border border-amber-200/60 p-2 text-xs text-gray-700">
                              <div className="font-medium text-amber-800">
                                <span className="text-red-600">Correction</span> (by {by} {at})
                              </div>
                              <div className="mt-1 text-gray-600">
                                Previous: <span className="text-red-600">{previous}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-900">
                    Time Out
                    {isOvernightShift && (
                      <span className="ml-2 text-xs text-gray-500 font-normal">
                        (Overnight shift - next day)
                      </span>
                    )}
                  </Label>
                  <Field name="timeOut">
                    {({ field }: { field: FieldInputProps<string> }) => {
                      // Check if current values indicate overnight shift
                      const currentTimeIn = values.timeIn ? new Date(values.timeIn) : null;
                      const currentTimeOut = field.value ? new Date(field.value) : null;
                      const isCurrentlyOvernight = currentTimeIn && currentTimeOut && 
                        currentTimeIn.toDateString() !== currentTimeOut.toDateString();
                      
                      return (
                        <>
                          <Input
                            type="datetime-local"
                            value={field.value ? parseDateTime(field.value) : ''}
                            onChange={(e) => {
                              if (!e.target.value) {
                                setFieldValue('timeOut', '');
                                return;
                              }

                              const newTimeOutDate = new Date(e.target.value);
                              const timeInDate = values.timeIn ? new Date(values.timeIn) : null;
                              
                              // Validate the date
                              if (isNaN(newTimeOutDate.getTime())) {
                                setFieldValue('timeOut', '');
                                return;
                              }
                              
                              // Handle overnight shift: if timeOut appears before or equal to timeIn,
                              // automatically adjust to next day (assuming overnight shift)
                              if (timeInDate) {
                                const timeInTime = timeInDate.getTime();
                                const timeOutTime = newTimeOutDate.getTime();
                                
                                // If timeOut is before or equal to timeIn, it's likely an overnight shift
                                // Check if they're on the same day first
                                const sameDay = timeInDate.toDateString() === newTimeOutDate.toDateString();
                                
                                if (sameDay && timeOutTime <= timeInTime) {
                                  // Same day but timeOut is before/equal to timeIn - adjust to next day
                                  newTimeOutDate.setDate(newTimeOutDate.getDate() + 1);
                                } else if (!sameDay) {
                                  // Different days - check if timeOut is actually before timeIn
                                  // (e.g., timeIn is 11 PM on day 1, timeOut is 1 AM on day 2)
                                  // In this case, if timeOut date is before timeIn date, it's wrong
                                  if (newTimeOutDate < timeInDate) {
                                    // This shouldn't happen normally, but if it does, adjust to next day after timeIn
                                    const adjustedDate = new Date(timeInDate);
                                    adjustedDate.setDate(adjustedDate.getDate() + 1);
                                    adjustedDate.setHours(newTimeOutDate.getHours(), newTimeOutDate.getMinutes(), 0, 0);
                                    setFieldValue('timeOut', adjustedDate.toISOString());
                                    return;
                                  }
                                }
                              }
                              
                              setFieldValue('timeOut', newTimeOutDate.toISOString());
                            }}
                            className={`h-11 ${
                              errors.timeOut && touched.timeOut
                                ? 'border-red-300'
                                : ''
                            }`}
                          />
                          {(isOvernightShift || isCurrentlyOvernight) && (
                            <p className="text-xs text-gray-500 mt-1">
                              This shift spans midnight. Time out is on the next day.
                            </p>
                          )}
                        </>
                      );
                    }}
                  </Field>
                  {touched.timeOut && errors.timeOut && (
                    <p className="text-sm text-red-600">{errors.timeOut}</p>
                  )}
                  {punch.updateHistory && punch.updateHistory.length > 0 && (() => {
                    type Entry = {
                      timeOut: string | null;
                      timeOutBefore?: string | null;
                      modifiedByName?: string;
                      modifiedDate: string;
                    };
                    const outBefore = (e: Entry) => e.timeOutBefore?.trim() || null;
                    const outAfter = (e: Entry) => e.timeOut?.trim() || null;
                    const entriesThatChangedTimeOut = punch.updateHistory!.filter((entry) => {
                      const e = entry as Entry;
                      return outBefore(e) !== outAfter(e);
                    }) as Entry[];
                    if (entriesThatChangedTimeOut.length === 0) return null;
                    return (
                      <div className="space-y-2">
                        {entriesThatChangedTimeOut.map((entry, i) => {
                          const by = entry.modifiedByName?.trim() || (punch as { modifiedByName?: string }).modifiedByName?.trim() || '—';
                          const at = formatModifiedAt(entry.modifiedDate);
                          const previous = entry.timeOutBefore != null && entry.timeOutBefore !== ''
                            ? formatTimeField(entry.timeOutBefore)
                            : '—';
                          return (
                            <div key={i} className="rounded-md bg-amber-50 border border-amber-200/60 p-2 text-xs text-gray-700">
                              <div className="font-medium text-amber-800">
                                <span className="text-red-600">Correction</span> (by {by} {at})
                              </div>
                              <div className="mt-1 text-gray-600">
                                Previous: <span className="text-red-600">{previous}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-900">
                    Employee Notes
                  </Label>
                  <Field name="userNote">
                    {({ field }: { field: FieldInputProps<string> }) => (
                      <Textarea
                        {...field}
                        placeholder="Employee notes about this shift..."
                        className="min-h-[80px] resize-none"
                      />
                    )}
                  </Field>
                  {touched.userNote && errors.userNote && (
                    <p className="text-sm text-red-600">{errors.userNote}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-900">
                    Manager Notes
                  </Label>
                  <Field name="managerNote">
                    {({ field }: { field: FieldInputProps<string> }) => (
                      <Textarea
                        {...field}
                        placeholder="Add manager notes (optional)..."
                        className="min-h-[80px] resize-none"
                      />
                    )}
                  </Field>
                  {touched.managerNote && errors.managerNote && (
                    <p className="text-sm text-red-600">
                      {errors.managerNote}
                    </p>
                  )}
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    disabled={isUpdating}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isUpdating}>
                    <Save className="h-4 w-4 mr-2" />
                    {isUpdating ? 'Saving...' : 'Save Changes'}
                  </Button>
                </DialogFooter>
              </Form>
            )}
          </Formik>
        </DialogContent>
      </Dialog>

      {/* Map Modal */}
      {userLocation && (
        <MapModal
          isOpen={showMapModal}
          onClose={() => setShowMapModal(false)}
          userLocation={userLocation}
          jobLocation={jobLocation}
          geoFenceRadius={geoFenceRadius}
          title={`${punch.jobTitle || 'Job'} - Clock In Location`}
        />
      )}
    </>
  );
}
