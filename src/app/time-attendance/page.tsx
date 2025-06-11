"use client";

import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, User } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { Card, CardContent } from "@/components/ui/Card";
import Layout from "@/components/layout/Layout";
import { CalendarEvent, Mode } from "@/components/ui/Calendar";
import { generateMockEvents } from "@/lib/utils/mock-calendar-events";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/ToggleGroup";
import CalendarProvider from "@/components/ui/Calendar/CalendarProvider";
import CalendarBody from "@/components/ui/Calendar/Body/CalendarBody";
import CalendarHeaderDate from "@/components/ui/Calendar/Header/Date/CalendarHeaderDate";
import CalendarHeaderActionsMode from "@/components/ui/Calendar/Header/Actions/CalendarHeaderActionsMode";

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

const CircularTimer = ({
  time,
  isActive,
}: {
  time: string;
  isActive: boolean;
}) => {
  const circumference = 2 * Math.PI * 45;
  const strokeDasharray = circumference;
  const strokeDashoffset = isActive ? circumference * 0.25 : circumference;

  return (
    <div className="relative w-64 h-64 mx-auto">
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
        <div className="text-base font-bold text-appPrimary">{time}</div>
        <div className="text-xl font-semibold text-appPrimary mt-1">
          {isActive ? "CLOCK OUT" : "CLOCK IN"}
        </div>
      </div>
    </div>
  );
};

export default function EmployeeTimeTracker() {
  const [currentTime, setCurrentTime] = useState("02:25:45");
  const [isClocked, setIsClocked] = useState(true);
  const [selectedJob, setSelectedJob] = useState("Redesign Website");
  const [selectedShift, setSelectedShift] = useState("First Shift");
  const [viewType, setViewType] = useState<"table" | "calendar">("table");
  const [currentDate] = useState("Wednesday, June 05, 2025");
  const [totalHours] = useState("4 HOURS");
  const [dateRange, setDateRange] = useState("June 01 - June 07, 2025");

  const [events, setEvents] = useState<CalendarEvent[]>(generateMockEvents());
  const [mode, setMode] = useState<Mode>("month");
  const [date, setDate] = useState<Date>(new Date(2025, 5, 11));

  useEffect(() => {
    if (isClocked) {
      const timer = setInterval(() => {
        setCurrentTime((prev) => {
          const [hours, minutes, seconds] = prev.split(":").map(Number);
          const totalSeconds = hours * 3600 + minutes * 60 + seconds + 1;
          const newHours = Math.floor(totalSeconds / 3600);
          const newMinutes = Math.floor((totalSeconds % 3600) / 60);
          const newSecs = totalSeconds % 60;
          return `${newHours.toString().padStart(2, "0")}:${newMinutes
            .toString()
            .padStart(2, "0")}:${newSecs.toString().padStart(2, "0")}`;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [isClocked]);

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

  const handleClockIn = (shiftId: number) => {
    console.log("Clock in for shift:", shiftId);
  };

  const handleClockOut = (shiftId: number) => {
    console.log("Clock out for shift:", shiftId);
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Timer Card */}
        <Card className="w-full max-w-md mx-auto shadow-md">
          <CardContent className="py-6 px-16">
            <div className="space-y-4 mb-6">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    {selectedJob}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-full">
                  <DropdownMenuItem
                    onClick={() => setSelectedJob("Redesign Website")}
                  >
                    Redesign Website
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setSelectedJob("Sample Job 2")}
                  >
                    Sample Job 2
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setSelectedJob("Sample Job 3")}
                  >
                    Sample Job 3
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    {selectedShift}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-full">
                  <DropdownMenuItem
                    onClick={() => setSelectedShift("First Shift")}
                  >
                    First Shift
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setSelectedShift("Second Shift")}
                  >
                    Second Shift
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setSelectedShift("Third Shift")}
                  >
                    Third Shift
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="text-center mb-6">
              <CircularTimer time={currentTime} isActive={isClocked} />
            </div>

            <div className="text-center space-y-2 mb-4">
              <div className="text-sm font-medium shadow-sm py-2 px-4 rounded-md border">
                Total Hours: {totalHours}
              </div>
              <div className="text-sm font-medium shadow-sm py-2 px-4 rounded-md border">
                {currentDate}
              </div>
            </div>

            <Button
              variant="ghost"
              className="w-full text-appPrimary hover:bg-appPrimary/10"
            >
              <User className="h-4 w-4 mr-2" />
              View Map
            </Button>
          </CardContent>
        </Card>

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
                              variant="outline-primary"
                              onClick={() => handleClockIn(shift.id)}
                            >
                              Clock In
                            </Button>
                            <Button
                              size="sm"
                              variant="outline-danger"
                              onClick={() => handleClockOut(shift.id)}
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
