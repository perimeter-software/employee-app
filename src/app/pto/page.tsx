"use client";

import React, { useState, useMemo } from "react";
import { format, eachDayOfInterval } from "date-fns";
import {
  Calendar as CalendarIcon,
  Plus,
  Upload,
  X,
  FileText,
  Check,
  Clock,
  XCircle,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/ToggleGroup";
import { CalendarEvent, Mode } from "@/components/ui/Calendar";
import CalendarProvider from "@/components/ui/Calendar/CalendarProvider";
import CalendarBody from "@/components/ui/Calendar/Body/CalendarBody";
import CalendarHeaderDate from "@/components/ui/Calendar/Header/Date/CalendarHeaderDate";
import CalendarHeaderActionsMode from "@/components/ui/Calendar/Header/Actions/CalendarHeaderActionsMode";
import { useCalendarContext } from "@/components/ui/Calendar/CalendarContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import Layout from "@/components/layout/Layout";
import { Table } from "@/components/ui/Table";
import { TableColumn } from "@/components/ui/Table/types";
import { clsxm } from "@/lib/utils";

// PTO Types
type PTOType = "vacation" | "sick" | "fmla" | "sabbatical" | "personal";
type PTOStatus = "approved" | "pending" | "rejected";

interface PTORequest {
  id: string;
  type: PTOType;
  startDate: Date;
  endDate: Date;
  days: number;
  reason: string;
  status: PTOStatus;
  requestedDate: Date;
  approvedBy?: string;
  attachment?: File;
}

interface PTOTableData extends Record<string, unknown> {
  id: string;
  dateRange: string;
  type: PTOType;
  days: number;
  reason: string;
  requestedDate: string;
  status: PTOStatus;
  approvedBy: string | undefined;
  startDate: Date;
  endDate: Date;
}

// Static PTO data
const ptoData: PTORequest[] = [
  {
    id: "1",
    type: "vacation",
    startDate: new Date("2025-06-01"),
    endDate: new Date("2025-06-05"),
    days: 5,
    reason: "Family vacation to Hawaii",
    status: "approved",
    requestedDate: new Date("2025-05-06"),
    approvedBy: "Jane Doe",
  },
  {
    id: "2",
    type: "sick",
    startDate: new Date("2025-06-02"),
    endDate: new Date("2025-06-02"),
    days: 1,
    reason: "Fever",
    status: "pending",
    requestedDate: new Date("2025-05-06"),
  },
  {
    id: "3",
    type: "fmla",
    startDate: new Date("2025-06-03"),
    endDate: new Date("2025-06-03"),
    days: 1,
    reason: "Short Vacation",
    status: "rejected",
    requestedDate: new Date("2025-05-06"),
  },
  {
    id: "4",
    type: "sabbatical",
    startDate: new Date("2025-06-04"),
    endDate: new Date("2025-06-04"),
    days: 1,
    reason: "Family vacation to Hawaii",
    status: "approved",
    requestedDate: new Date("2025-05-06"),
    approvedBy: "Jane Doe",
  },
  {
    id: "5",
    type: "vacation",
    startDate: new Date("2025-06-10"),
    endDate: new Date("2025-06-10"),
    days: 1,
    reason: "Sick Leave",
    status: "approved",
    requestedDate: new Date("2025-05-06"),
    approvedBy: "Jane Doe",
  },
  {
    id: "6",
    type: "vacation",
    startDate: new Date("2025-06-13"),
    endDate: new Date("2025-06-13"),
    days: 1,
    reason: "Sabbatical",
    status: "approved",
    requestedDate: new Date("2025-05-06"),
    approvedBy: "Jane Doe",
  },
];

// PTO Type configurations
const ptoTypeConfig = {
  vacation: {
    label: "Vacation Leave",
    color: "bg-blue-100 text-blue-800",
    calendarColor: "blue",
  },
  sick: {
    label: "Sick Leave",
    color: "bg-red-100 text-red-800",
    calendarColor: "red",
  },
  fmla: {
    label: "FMLA",
    color: "bg-purple-100 text-purple-800",
    calendarColor: "purple",
  },
  sabbatical: {
    label: "Sabbatical",
    color: "bg-green-100 text-green-800",
    calendarColor: "green",
  },
  personal: {
    label: "Personal Leave",
    color: "bg-orange-100 text-orange-800",
    calendarColor: "orange",
  },
};

// Status configurations
const statusConfig = {
  approved: { label: "Approved", color: "text-green-600", icon: Check },
  pending: { label: "Pending", color: "text-yellow-600", icon: Clock },
  rejected: { label: "Rejected", color: "text-red-600", icon: XCircle },
};

// Enhanced File Dropzone Component
const FileDropzone = ({
  onFileSelect,
  selectedFile,
}: {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onFileSelect(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    onFileSelect(file);
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-gray-900">Attachment</Label>
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          isDragOver
            ? "border-blue-400 bg-blue-50"
            : selectedFile
            ? "border-green-400 bg-green-50"
            : "border-gray-300 hover:border-gray-400"
        }`}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
      >
        {selectedFile ? (
          <div className="flex items-center justify-center gap-2">
            <FileText className="h-5 w-5 text-green-600" />
            <span className="text-sm text-green-700 font-medium">
              {selectedFile.name}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-6 w-6"
              onClick={() => onFileSelect(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div>
            <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600 mb-2">
              Drop your file here, or{" "}
              <label className="text-blue-600 hover:text-blue-700 cursor-pointer underline">
                browse
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                />
              </label>
            </p>
            <p className="text-xs text-gray-500">
              Supports: PDF, DOC, DOCX, JPG, PNG (max 10MB)
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// PTO Request Modal
const PTORequestModal = ({
  isOpen,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    request: Omit<PTORequest, "id" | "status" | "requestedDate">
  ) => void;
}) => {
  const [ptoType, setPtoType] = useState<PTOType>("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const calculateDays = () => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    onSubmit({
      type: ptoType,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      days: calculateDays(),
      reason,
      attachment: selectedFile || undefined,
    });

    // Reset form
    setPtoType("vacation");
    setStartDate("");
    setEndDate("");
    setReason("");
    setSelectedFile(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-xs sm:max-w-md p-0 gap-0">
        <DialogTitle asChild>
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Request PTO</h2>
            <p className="text-sm text-gray-600">
              Fill your Paid time-off here.
            </p>
          </div>
        </DialogTitle>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>Available PTO Balance:</strong> 21 days
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-900">
              PTO Type
            </Label>
            <Select
              value={ptoType}
              onValueChange={(value) => setPtoType(value as PTOType)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select PTO type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ptoTypeConfig).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-900">
                Start date
              </Label>
              <div className="relative">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-900">
                End date
              </Label>
              <div className="relative">
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
            </div>
          </div>

          {startDate && endDate && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-sm text-gray-700">
                <strong>Total Days:</strong> {calculateDays()} day
                {calculateDays() !== 1 ? "s" : ""}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-900">Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Lorem ipsum dolor."
              className="min-h-[80px] resize-none"
              required
            />
          </div>

          <FileDropzone
            onFileSelect={setSelectedFile}
            selectedFile={selectedFile}
          />

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Submit Request</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// Calendar Event Handler
const CalendarEventHandler = ({
  ptoRequests,
  onEventClick,
}: {
  ptoRequests: PTORequest[];
  onEventClick: (request: PTORequest) => void;
}) => {
  const { selectedEvent, manageEventDialogOpen, setManageEventDialogOpen } =
    useCalendarContext();

  React.useEffect(() => {
    if (selectedEvent && manageEventDialogOpen) {
      const ptoRequest = ptoRequests.find((req) => req.id === selectedEvent.id);

      if (ptoRequest) {
        setManageEventDialogOpen(false);
        onEventClick(ptoRequest);
      }
    }
  }, [
    selectedEvent,
    manageEventDialogOpen,
    ptoRequests,
    onEventClick,
    setManageEventDialogOpen,
  ]);

  return null;
};

// Main PTO Dashboard Component
export default function PTODashboard() {
  const [viewType, setViewType] = useState<"monthly" | "weekly" | "calendar">(
    "monthly"
  );
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [, setSelectedPTO] = useState<PTORequest | null>(null);
  const [ptoRequests, setPtoRequests] = useState<PTORequest[]>(ptoData);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [mode, setMode] = useState<Mode>("month");

  // Calendar events from PTO data
  const calendarEvents = useMemo(() => {
    return ptoRequests
      .map((request) => {
        const daysBetween = eachDayOfInterval({
          start: request.startDate,
          end: request.endDate,
        });

        return daysBetween.map((day, index) => ({
          id: `${request.id}-${index}`,
          title: ptoTypeConfig[request.type].label,
          color: ptoTypeConfig[request.type].calendarColor,
          start: day,
          end: day,
        }));
      })
      .flat();
  }, [ptoRequests]);

  const [events, setEvents] = useState<CalendarEvent[]>([]);

  React.useEffect(() => {
    setEvents(calendarEvents);
  }, [calendarEvents]);

  // Statistics
  const stats = useMemo(() => {
    const totalUsed = ptoRequests
      .filter((req) => req.status === "approved")
      .reduce((sum, req) => sum + req.days, 0);

    const totalRemaining = 120 - totalUsed; // Assuming 120 total PTO days
    const pendingRequests = ptoRequests.filter(
      (req) => req.status === "pending"
    ).length;
    const upcomingPTO = ptoRequests.filter(
      (req) => req.status === "approved" && req.startDate > new Date()
    ).length;

    return {
      used: totalUsed,
      remaining: totalRemaining,
      pending: pendingRequests,
      upcoming: upcomingPTO,
      total: 120,
    };
  }, [ptoRequests]);

  const handleSubmitRequest = (
    request: Omit<PTORequest, "id" | "status" | "requestedDate">
  ) => {
    const newRequest: PTORequest = {
      ...request,
      id: `${Date.now()}`,
      status: "pending",
      requestedDate: new Date(),
    };

    setPtoRequests((prev) => [...prev, newRequest]);
  };

  const filteredRequests = useMemo(() => {
    if (viewType === "monthly") {
      return ptoRequests;
    } else if (viewType === "weekly") {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() + 7);

      return ptoRequests.filter(
        (req) => req.requestedDate >= weekStart && req.requestedDate <= weekEnd
      );
    }
    return ptoRequests;
  }, [ptoRequests, viewType]);

  const columns: TableColumn<PTOTableData>[] = [
    {
      key: "dateRange",
      header: "Date/s",
      render: (value: unknown) => String(value),
    },
    {
      key: "type",
      header: "Type",
      render: (value: unknown, row: PTOTableData) => (
        <Badge className={ptoTypeConfig[row.type].color}>
          {ptoTypeConfig[row.type].label}
        </Badge>
      ),
    },
    {
      key: "days",
      header: "Days",
      render: (value: unknown) => String(value),
    },
    {
      key: "reason",
      header: "Reason",
      render: (value: unknown) => (
        <span className="max-w-xs truncate">{String(value)}</span>
      ),
    },
    {
      key: "requestedDate",
      header: "Requested",
      render: (value: unknown) => String(value),
    },
    {
      key: "status",
      header: "Status",
      render: (value: unknown, row: PTOTableData) => {
        const StatusIcon = statusConfig[row.status].icon;
        return (
          <div
            className={`flex items-center gap-1 ${
              statusConfig[row.status].color
            }`}
          >
            <StatusIcon className="h-4 w-4" />
            <span className="font-medium">
              {statusConfig[row.status].label}
            </span>
          </div>
        );
      },
    },
    {
      key: "approvedBy",
      header: "Approved by",
      render: (value: unknown) => (value ? String(value) : "-"),
    },
  ];

  // Transform the filtered requests into the table data format
  const tableData: PTOTableData[] = filteredRequests.map((request) => ({
    id: request.id,
    dateRange:
      request.startDate.getTime() === request.endDate.getTime()
        ? format(request.startDate, "MM/dd/yyyy")
        : `${format(request.startDate, "MM/dd/yyyy")} - ${format(
            request.endDate,
            "MM/dd/yyyy"
          )}`,
    type: request.type,
    days: request.days,
    reason: request.reason,
    requestedDate: format(request.requestedDate, "MM/dd/yyyy"),
    status: request.status,
    approvedBy: request.approvedBy,
    startDate: request.startDate,
    endDate: request.endDate,
  }));

  return (
    <Layout title="Paid Time Off">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 space-y-6">
        {/* Header */}
        <h1 className="text-2xl sm:text-2xl font-bold text-gray-900">
          Paid Time Off (PTO)
        </h1>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center justify-start w-full sm:w-auto">
            {/* View Toggle */}
            <ToggleGroup
                className="inline-flex rounded-lg border border-gray-30 p-1 self-start sm:self-auto shadow-sm"
                type="single"
              value={viewType}
              onValueChange={(value) =>
                value && setViewType(value as typeof viewType)
              }
            >
              <ToggleGroupItem
                  value="monthly"
                  className={clsxm(
                    "rounded-md px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-all",
                    viewType === "monthly" ?
                      "bg-appPrimary text-white shadow-md":
                      "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
                  )}
                >
                Monthly
              </ToggleGroupItem>
              <ToggleGroupItem
                value="weekly"
                className={clsxm(
                  "rounded-md px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-all",
                  viewType === "weekly" ?
                    "bg-appPrimary text-white shadow-md":
                    "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
                )}
              >
                Weekly
              </ToggleGroupItem>
              <ToggleGroupItem
                value="calendar"
                className={clsxm(
                  "rounded-md px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-all",
                  viewType === "calendar" ?
                    "bg-appPrimary text-white shadow-md":
                    "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
                )}              >
                Calendar
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <Button
            onClick={() => setShowRequestModal(true)}
            className="w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            Request PTO
          </Button>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">PTO used</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {stats.used}
                  </p>
                  <p className="text-xs text-gray-500">days</p>
                </div>
                <CalendarIcon className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    PTO remaining
                  </p>
                  <p className="text-2xl font-bold text-green-600">
                    -{stats.remaining}
                  </p>
                  <p className="text-xs text-gray-500">days</p>
                </div>
                <Check className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    Pending requests
                  </p>
                  <p className="text-2xl font-bold text-yellow-600">
                    {stats.pending}
                  </p>
                  <p className="text-xs text-gray-500">days</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total PTO</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {stats.total}
                  </p>
                  <p className="text-xs text-gray-500">days</p>
                </div>
                <Calendar className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Calendar View */}
        {viewType === "calendar" && (
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 md:gap-0">
                <h2 className="text-lg sm:text-xl font-semibold">
                  PTO Calendar
                </h2>
                <div className="flex items-center gap-2 sm:gap-4 w-full md:w-auto">
                  <CalendarProvider
                    events={events}
                    setEvents={setEvents}
                    mode={mode}
                    setMode={setMode}
                    date={currentDate}
                    setDate={setCurrentDate}
                    calendarIconIsToday={false}
                  >
                    <CalendarHeaderDate />
                  </CalendarProvider>
                  <CalendarProvider
                    events={events}
                    setEvents={setEvents}
                    mode={mode}
                    setMode={setMode}
                    date={currentDate}
                    setDate={setCurrentDate}
                    calendarIconIsToday={false}
                  >
                    <CalendarHeaderActionsMode />
                  </CalendarProvider>
                </div>
              </div>

              <div className="border rounded-lg overflow-x-auto">
                <CalendarProvider
                  events={events}
                  setEvents={setEvents}
                  mode={mode}
                  setMode={setMode}
                  date={currentDate}
                  setDate={setCurrentDate}
                  calendarIconIsToday={false}
                >
                  <CalendarBody hideTotalColumn={true} />
                  <CalendarEventHandler
                    ptoRequests={ptoRequests}
                    onEventClick={setSelectedPTO}
                  />
                </CalendarProvider>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-2 sm:gap-4 mt-4">
                {Object.entries(ptoTypeConfig).map(([key, config]) => (
                  <div key={key} className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 rounded bg-${config.calendarColor}-500`}
                    ></div>
                    <span className="text-sm text-gray-600">
                      {config.label}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {viewType !== "calendar" && (
          <Card>
            <CardContent className="p-4 sm:p-6">
              <h2 className="text-lg sm:text-xl font-semibold mb-4 sm:mb-6">
                PTO Request History{" "}
                {viewType === "weekly"
                  ? "(Weekly)"
                  : viewType === "monthly"
                  ? "(Monthly)"
                  : ""}
              </h2>

              <div className="w-full overflow-x-auto">
                <Table
                  columns={columns}
                  data={tableData}
                  showPagination={true}
                  selectable={true}
                  className="min-w-[600px] w-full"
                  emptyMessage="No PTO requests found."
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* PTO Request Modal */}
        <PTORequestModal
          isOpen={showRequestModal}
          onClose={() => setShowRequestModal(false)}
          onSubmit={handleSubmitRequest}
        />
      </div>
    </Layout>
  );
}
