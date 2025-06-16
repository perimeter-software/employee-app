"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Clock, MapPin } from "lucide-react";
import { isJobGeoFenced } from "@/domains/punch/utils/shift-job-utils";
import type { GignologyJob, Shift } from "@/domains/job/types/job.types";

interface ShiftRowData {
  date: string;
  dateObj: Date;
  jobId: string;
  jobTitle: string;
  job: GignologyJob;
  shift: Shift;
  shiftName: string;
  startTime: string;
  endTime: string;
  totalHours: number;
  punches: Array<{
    id: string;
    timeIn: string;
    timeOut: string | null;
    status: "active" | "completed";
  }>;
  canClockIn: boolean;
  canClockOut: boolean;
  allowBreaks: boolean;
  isWithinShift: boolean;
  hasActivePunch: boolean;
  isToday: boolean;
  shiftHasEnded?: boolean; // Add this new property
}

interface ShiftRowProps {
  shiftData: ShiftRowData;
  onClockIn: (shiftData: ShiftRowData) => void;
  onClockOut: (shiftData: ShiftRowData) => void;
  loading?: boolean;
}

// Helper function to format time
const formatTime = (date: Date) => {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

export function ShiftRow({
  shiftData,
  onClockIn,
  onClockOut,
  loading = false,
}: ShiftRowProps) {
  // Render time range with multiple punches
  const renderTimeRange = () => {
    if (shiftData.punches.length === 0) {
      return <span className="text-gray-400">---- to ----</span>;
    }

    if (shiftData.punches.length === 1) {
      const punch = shiftData.punches[0];
      const startTime = formatTime(new Date(punch.timeIn));
      const endTime = punch.timeOut
        ? formatTime(new Date(punch.timeOut))
        : "----";
      return `${startTime} to ${endTime}`;
    }

    // Multiple punches - show as ranges
    return (
      <div className="space-y-1">
        {shiftData.punches.map((punch) => {
          const startTime = formatTime(new Date(punch.timeIn));
          const endTime = punch.timeOut
            ? formatTime(new Date(punch.timeOut))
            : "----";
          return (
            <div key={punch.id} className="text-xs">
              {startTime} to {endTime}
              {punch.status === "active" && (
                <Badge variant="outline" className="ml-2 text-xs">
                  Active
                </Badge>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Render action buttons
  const renderActionButtons = () => {
    const isDisabled = loading || !shiftData.isToday;
    const shiftEnded = shiftData.shiftHasEnded;

    return (
      <div className="flex space-x-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onClockIn(shiftData)}
          disabled={isDisabled || !shiftData.canClockIn || shiftEnded}
          className="border-blue-500 text-blue-500 hover:bg-blue-50 disabled:opacity-50"
        >
          {loading ? <Clock className="h-3 w-3 animate-spin" /> : "Clock In"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onClockOut(shiftData)}
          disabled={isDisabled || !shiftData.canClockOut}
          className="border-red-500 text-red-500 hover:bg-red-50 disabled:opacity-50"
        >
          {loading ? <Clock className="h-3 w-3 animate-spin" /> : "Clock Out"}
        </Button>
      </div>
    );
  };

  return (
    <tr
      className={`border-b border-gray-100 hover:bg-gray-50 ${
        shiftData.isToday ? "bg-blue-50/30" : ""
      } ${shiftData.hasActivePunch ? "bg-green-50/30" : ""} ${
        shiftData.shiftHasEnded && !shiftData.hasActivePunch ? "opacity-75" : ""
      }`}
    >
      <td className="py-3 px-4 text-sm">
        <div className="flex items-center gap-2">
          {shiftData.date}
          {shiftData.isToday && (
            <Badge variant="outline" className="text-xs">
              Today
            </Badge>
          )}
          {shiftData.shiftHasEnded && !shiftData.hasActivePunch && (
            <Badge variant="outline" className="text-xs text-gray-500">
              Ended
            </Badge>
          )}
        </div>
      </td>
      <td className="py-3 px-4 text-sm">
        <div className="flex items-center gap-2">
          {shiftData.jobTitle}
          {isJobGeoFenced(shiftData.job) && (
            <MapPin className="h-3 w-3 text-gray-400" aria-label="Geofenced" />
          )}
        </div>
      </td>
      <td className="py-3 px-4 text-sm">{shiftData.shiftName}</td>
      <td className="py-3 px-4 text-sm">{renderTimeRange()}</td>
      <td className="py-3 px-4 text-sm">
        <div className="flex items-center gap-2">
          {shiftData.totalHours > 0
            ? `${shiftData.totalHours} Hours`
            : "0 Hours"}
          {shiftData.hasActivePunch && (
            <Badge
              variant="default"
              className="text-xs bg-green-100 text-green-800"
            >
              Active
            </Badge>
          )}
        </div>
      </td>
      <td className="py-3 px-4">{renderActionButtons()}</td>
    </tr>
  );
}
