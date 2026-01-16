import React, { useState, useMemo } from 'react';
import { Formik, Form, Field, FieldInputProps } from 'formik';
import * as Yup from 'yup';
import { Save, MapPin } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
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
import type { EmployeePunch } from './types';

interface EmployeePunchDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  punch: EmployeePunch | null;
  onSuccess?: () => void;
}

// Validation schema
const punchValidationSchema = Yup.object({
  timeIn: Yup.string().required('Time in is required'),
  timeOut: Yup.string()
    .nullable()
    .test(
      'timeOut-after-timeIn',
      'Time out must be after time in',
      function (value) {
        const { timeIn } = this.parent;
        if (value && timeIn) {
          const timeInDate = new Date(timeIn);
          const timeOutDate = new Date(value);
          if (timeOutDate <= timeInDate) {
            return this.createError({
              message: 'Time out must be after time in',
            });
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

export function EmployeePunchDetailsModal({
  isOpen,
  onClose,
  punch,
  onSuccess,
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
      
      // ERROR-PROOF: Invalidate queries with pattern matching to refetch all employeePunches queries
      // This ensures all date ranges and filters get fresh data
      queryClient.invalidateQueries({ 
        queryKey: ['employeePunches'],
        exact: false, // Match all queries that start with 'employeePunches'
      });
      queryClient.invalidateQueries({ queryKey: ['activeEmployeeCount'] });
      
      // Refetch immediately to ensure fresh data is available
      await queryClient.refetchQueries({ 
        queryKey: ['employeePunches'],
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

  const parseDateTime = (value: string) => {
    if (!value) return '';
    const date = new Date(value);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
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
            validationSchema={punchValidationSchema}
            onSubmit={handleSave}
            enableReinitialize={true}
            key={punch._id}
          >
            {({ errors, touched, setFieldValue }) => (
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
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-900">
                    Time Out
                  </Label>
                  <Field name="timeOut">
                    {({ field }: { field: FieldInputProps<string> }) => (
                      <Input
                        type="datetime-local"
                        value={field.value ? parseDateTime(field.value) : ''}
                        onChange={(e) => {
                          if (e.target.value) {
                            const newDate = new Date(e.target.value);
                            setFieldValue('timeOut', newDate.toISOString());
                          } else {
                            setFieldValue('timeOut', '');
                          }
                        }}
                        className={`h-11 ${
                          errors.timeOut && touched.timeOut
                            ? 'border-red-300'
                            : ''
                        }`}
                      />
                    )}
                  </Field>
                  {touched.timeOut && errors.timeOut && (
                    <p className="text-sm text-red-600">{errors.timeOut}</p>
                  )}
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
