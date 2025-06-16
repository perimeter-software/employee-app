import React from "react";
import { Formik, Form, Field, FieldInputProps } from "formik";
import * as Yup from "yup";
import { Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { useUpdatePunch, useDeletePunch } from "@/domains/punch/hooks";
import type { PunchWithJobInfo, Punch } from "@/domains/punch/types";
import type { GignologyJob, Shift } from "@/domains/job/types/job.types";
import { toast } from "sonner";

// Enhanced shift event interface
interface ShiftCalendarEvent {
  id: string;
  title: string;
  color: string;
  start: Date;
  end: Date;
  punchData?: PunchWithJobInfo;
  jobData?: GignologyJob;
  shiftData?: Shift;
  status: "active" | "completed" | "scheduled" | "missed";
}

interface ShiftDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  shiftEvent: ShiftCalendarEvent | null;
  userData: {
    _id: string;
    applicantId: string;
    userType?: string;
  };
  onSuccess?: () => void;
}

// Validation schema
const shiftValidationSchema = Yup.object({
  clockIn: Yup.string().required("Clock in time is required"),
  clockOut: Yup.string()
    .nullable()
    .test(
      "clockOut-after-clockIn",
      "Clock out must be after clock in",
      function (value) {
        const { clockIn } = this.parent;
        if (value && clockIn) {
          const clockInDate = new Date(clockIn);
          const clockOutDate = new Date(value);
          if (clockOutDate <= clockInDate) {
            return this.createError({
              message: "Clock out must be after clock in time",
            });
          }
        }
        return true;
      }
    ),
  userNote: Yup.string().max(500, "Note cannot exceed 500 characters"),
  managerNote: Yup.string().max(
    500,
    "Manager note cannot exceed 500 characters"
  ),
});

export function ShiftDetailsModal({
  isOpen,
  onClose,
  shiftEvent,
  userData,
  onSuccess,
}: ShiftDetailsModalProps) {
  // Hooks for API calls
  const updatePunchMutation = useUpdatePunch(
    userData._id,
    shiftEvent?.punchData?.jobId || ""
  );
  const deletePunchMutation = useDeletePunch();

  if (!shiftEvent) return null;

  // Extract job and shift info from title or data
  const jobTitle =
    shiftEvent.jobData?.title || shiftEvent.title.split(" - ")[0];
  const shiftName =
    shiftEvent.shiftData?.shiftName || shiftEvent.title.split(" - ")[1];

  // Check permissions
  const canEdit =
    userData.userType !== "User" ||
    shiftEvent.jobData?.additionalConfig?.allowManualPunches;

  // Initial form values
  const initialValues = {
    clockIn: shiftEvent.start.toISOString(),
    clockOut:
      shiftEvent.status === "active" ? "" : shiftEvent.end.toISOString(),
    userNote: shiftEvent.punchData?.userNote || "",
    managerNote: shiftEvent.punchData?.managerNote || "",
    status: shiftEvent.status,
  };

  const handleSave = async (values: typeof initialValues) => {
    console.log("shiftEvent: ", shiftEvent);

    if (!shiftEvent.punchData) {
      toast.error("Cannot update a scheduled shift without punch data.");
      return;
    }

    try {
      const loadingToastId = toast.loading("Updating punch...");

      const updatedPunch: Punch = {
        ...shiftEvent.punchData,
        timeIn: values.clockIn,
        timeOut: values.clockOut || null,
        userNote: values.userNote || null,
        managerNote: values.managerNote || null,
        modifiedDate: shiftEvent.punchData.modifiedDate,
        modifiedBy: shiftEvent.punchData.modifiedBy,
      };

      await updatePunchMutation.mutateAsync(updatedPunch);

      toast.dismiss(loadingToastId);
      toast.success("Punch updated successfully!");

      onSuccess?.();
      onClose();
    } catch (error: unknown) {
      console.error("Error updating punch:", error);
      toast.error("Failed to update punch. Please try again.");
    }
  };

  const handleDelete = async () => {
    if (!shiftEvent.punchData?._id) {
      toast.error("Cannot delete a scheduled shift without punch data.");
      return;
    }

    try {
      const loadingToastId = toast.loading("Deleting punch...");
      await deletePunchMutation.mutateAsync(shiftEvent.punchData._id);
      toast.dismiss(loadingToastId);
      toast.success("Punch deleted successfully!");
      onSuccess?.();
      onClose();
    } catch (error: unknown) {
      console.error("Error deleting punch:", error);
      toast.error("Failed to delete punch. Please try again.");
    }
  };

  const parseDateTime = (value: string) => {
    if (!value) return "";
    const date = new Date(value);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const isLoading =
    updatePunchMutation.isPending || deletePunchMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md p-6 gap-6">
        {/* Header */}
        <DialogTitle className="sr-only">Shift Details</DialogTitle>
        <div className="flex items-center justify-between -mt-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{shiftName}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{jobTitle}</p>
          </div>
        </div>

        {/* Form Content */}
        <Formik
          initialValues={initialValues}
          validationSchema={shiftValidationSchema}
          onSubmit={handleSave}
        >
          {({ errors, touched, setFieldValue }) => (
            <Form className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-900">
                  Clock In
                </Label>
                <Field name="clockIn">
                  {({ field }: { field: FieldInputProps<string> }) => (
                    <Input
                      type="datetime-local"
                      value={parseDateTime(field.value)}
                      onChange={(e) => {
                        const newDate = new Date(e.target.value);
                        setFieldValue("clockIn", newDate.toISOString());
                      }}
                      className={`h-11 ${
                        errors.clockIn && touched.clockIn
                          ? "border-red-300"
                          : ""
                      }`}
                      disabled={!canEdit}
                    />
                  )}
                </Field>
                {touched.clockIn && errors.clockIn && (
                  <p className="text-sm text-red-600">{errors.clockIn}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-900">
                  Clock Out
                </Label>
                <Field name="clockOut">
                  {({ field }: { field: FieldInputProps<string> }) => (
                    <Input
                      type="datetime-local"
                      value={parseDateTime(field.value)}
                      onChange={(e) => {
                        const newDate = new Date(e.target.value);
                        setFieldValue("clockOut", newDate.toISOString());
                      }}
                      className={`h-11 ${
                        errors.clockOut && touched.clockOut
                          ? "border-red-300"
                          : ""
                      }`}
                      disabled={!canEdit}
                    />
                  )}
                </Field>
                {touched.clockOut && errors.clockOut && (
                  <p className="text-sm text-red-600">{errors.clockOut}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-900">
                  Notes/Remarks
                </Label>
                <Field name="userNote">
                  {({ field }: { field: FieldInputProps<string> }) => (
                    <Textarea
                      {...field}
                      placeholder="Add any notes about this shift..."
                      className="min-h-[80px] resize-none"
                      disabled={!canEdit}
                    />
                  )}
                </Field>
                {touched.userNote && errors.userNote && (
                  <p className="text-sm text-red-600">{errors.userNote}</p>
                )}
              </div>

              {userData.userType !== "User" && (
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
                    <p className="text-sm text-red-600">{errors.managerNote}</p>
                  )}
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="danger"
                  onClick={handleDelete}
                  disabled={isLoading || !shiftEvent.punchData?._id}
                >
                  Delete
                </Button>
                <Button type="submit" disabled={isLoading}>
                  <Save className="h-4 w-4 mr-2" />
                  {isLoading ? "Saving..." : "Edit Punch"}
                </Button>
              </DialogFooter>
            </Form>
          )}
        </Formik>
      </DialogContent>
    </Dialog>
  );
}
