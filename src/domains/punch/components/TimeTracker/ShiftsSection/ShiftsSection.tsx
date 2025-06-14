"use client";

import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/ToggleGroup";
import { CalendarEvent, Mode } from "@/components/ui/Calendar";
import { generateMockEvents } from "@/lib/utils/mock-calendar-events";
import CalendarProvider from "@/components/ui/Calendar/CalendarProvider";
import CalendarBody from "@/components/ui/Calendar/Body/CalendarBody";
import CalendarHeaderDate from "@/components/ui/Calendar/Header/Date/CalendarHeaderDate";
import CalendarHeaderActionsMode from "@/components/ui/Calendar/Header/Actions/CalendarHeaderActionsMode";
import { ShiftsTable } from "./ShiftsTable";
import type { GignologyUser } from "@/domains/user/types";
import type { PunchWithJobInfo } from "@/domains/punch/types";

interface ShiftsSectionProps {
  userData: GignologyUser;
  openPunches: PunchWithJobInfo[] | undefined;
  allPunches?: PunchWithJobInfo[] | undefined;
  punchesLoading?: boolean;
  dateRange?: {
    startDate: string;
    endDate: string;
  };
}

export function ShiftsSection({
  userData,
  openPunches,
  allPunches,
  punchesLoading,
}: ShiftsSectionProps) {
  const [viewType, setViewType] = useState<"table" | "calendar">("table");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>(generateMockEvents());
  const [mode, setMode] = useState<Mode>("month");
  const [calendarDate, setCalendarDate] = useState<Date>(new Date(2025, 5, 11));

  // Calculate weekly date range based on current date
  const dateRange = useMemo(() => {
    const baseDate = new Date(currentDate);

    // Always use weekly view
    const startOfWeek = new Date(baseDate);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return {
      startDate: startOfWeek,
      endDate: endOfWeek,
      displayRange: `${startOfWeek.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
      })} - ${endOfWeek.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })}`,
    };
  }, [currentDate]);

  const navigateDateRange = (direction: number) => {
    const newDate = new Date(currentDate);
    // Navigate by weeks
    newDate.setDate(newDate.getDate() + direction * 7);
    setCurrentDate(newDate);
  };

  return (
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
                  {dateRange.displayRange}
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
                  date={calendarDate}
                  setDate={setCalendarDate}
                  calendarIconIsToday={false}
                >
                  <CalendarHeaderDate />
                </CalendarProvider>
                <CalendarProvider
                  events={events}
                  setEvents={setEvents}
                  mode={mode}
                  setMode={setMode}
                  date={calendarDate}
                  setDate={setCalendarDate}
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
              date={calendarDate}
              setDate={setCalendarDate}
              calendarIconIsToday={false}
            >
              <CalendarBody />
            </CalendarProvider>
          </div>
        ) : (
          <ShiftsTable
            userData={userData}
            openPunches={openPunches}
            allPunches={allPunches}
            punchesLoading={punchesLoading}
            dateRange={{
              startDate: dateRange.startDate.toISOString(),
              endDate: dateRange.endDate.toISOString(),
              displayRange: dateRange.displayRange,
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
