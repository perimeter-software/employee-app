"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { ChevronDown } from "lucide-react";
import { GignologyJob, Shift } from "@/domains/job/types/job.types";
import { GignologyUser } from "@/domains/user/types";

interface JobShiftSelectorProps {
  userData: GignologyUser;
  selectedJob: GignologyJob | null;
  selectedShift: Shift | null;
  availableShifts: Shift[];
  blockJobSelection: boolean;
  onJobSelect: (job: GignologyJob) => void;
  onShiftSelect: (shift: Shift) => void;
}

export function JobShiftSelector({
  userData,
  selectedJob,
  selectedShift,
  availableShifts,
  blockJobSelection,
  onJobSelect,
  onShiftSelect,
}: JobShiftSelectorProps) {
  return (
    <div className="space-y-4 mb-8">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between h-12 text-base font-medium border-2 border-gray-200 hover:border-blue-300"
            disabled={blockJobSelection}
            title={
              blockJobSelection
                ? "Please clock out open punches first."
                : "Please select a job."
            }
          >
            {selectedJob?.title || "Select Job"}
            <ChevronDown className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-full">
          {userData.jobs?.map((job: GignologyJob) => (
            <DropdownMenuItem key={job._id} onClick={() => onJobSelect(job)}>
              {job.title}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {selectedJob && availableShifts.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between h-12 text-base font-medium border-2 border-gray-200 hover:border-blue-300"
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
              <ChevronDown className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-full">
            {availableShifts.map((shift) => (
              <DropdownMenuItem
                key={shift.slug}
                onClick={() => onShiftSelect(shift)}
              >
                {shift.shiftName || shift.slug}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
