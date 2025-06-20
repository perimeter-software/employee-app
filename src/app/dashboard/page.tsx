'use client';

import { useUser } from '@auth0/nextjs-auth0';
import Layout from '@/components/layout/Layout';
import React, { useState, useMemo, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  Users,
  Calendar,
  Activity,
  Clock,
  TrendingUp,
  TrendingDown,
  User,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Target,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/ToggleGroup';
import CalendarProvider from '@/components/ui/Calendar/CalendarProvider';
import CalendarBody from '@/components/ui/Calendar/Body/CalendarBody';
import CalendarHeaderDate from '@/components/ui/Calendar/Header/Date/CalendarHeaderDate';
import CalendarHeaderActionsMode from '@/components/ui/Calendar/Header/Actions/CalendarHeaderActionsMode';
import { CalendarEvent, Mode } from '@/components/ui/Calendar';
import { useCalendarContext } from '@/components/ui/Calendar/CalendarContext';
import { NextPage } from 'next';
import { usePageAuth } from '@/domains/shared/hooks/use-page-auth';
import {
  AuthErrorState,
  AuthLoadingState,
  UnauthenticatedState,
} from '@/components/shared/PageProtection';
import { useCurrentUser } from '@/domains/user';
import { useUserApplicantJob } from '@/domains/job/hooks';
import { Table } from '@/components/ui/Table';
import { TableColumn } from '@/components/ui/Table/types';
import { clsxm } from '@/lib/utils';

// Dashboard domain imports
import { useDashboardStats } from '@/domains/dashboard/hooks/use-dashboard-stats';
import { useAttendanceData } from '@/domains/dashboard/hooks/use-attendance-data';
import { usePerformanceMetrics } from '@/domains/dashboard/hooks/use-performance-metrics';
import { useInsights } from '@/domains/dashboard/hooks/use-insights';
import { useTodayAttendance } from '@/domains/dashboard/hooks/use-today-attendance';
import { formatDashboardParams } from '@/domains/dashboard/utils/dashboard-utils';
import {
  DashboardStats,
  PerformanceMetrics,
  TodayAttendanceData,
  InsightData,
  ShiftTableData as ShiftTableDataType,
} from '@/domains/dashboard/types';

// Punch domain imports for calendar events
import { useFindPunches } from '@/domains/punch/hooks/use-find-punches';
import type { PunchWithJobInfo } from '@/domains/punch/types';
import type { GignologyJob, Shift } from '@/domains/job/types/job.types';

// Shift Details Modal import
import { ShiftDetailsModal } from '@/domains/punch/components/TimeTracker/ShiftDetailsModal';

// Enhanced CalendarEvent interface for shift data
interface ShiftCalendarEvent extends CalendarEvent {
  punchData?: PunchWithJobInfo;
  jobData?: GignologyJob;
  shiftData?: Shift;
  status: 'active' | 'completed' | 'scheduled' | 'missed';
  totalHours?: number;
  punchCount?: number;
  allPunches?: PunchWithJobInfo[];
}

// Generate calendar events from punch data (dashboard read-only version)
const generateDashboardShiftEvents = (
  userData: { jobs?: GignologyJob[] },
  startDate: Date,
  endDate: Date,
  allPunches?: PunchWithJobInfo[]
): ShiftCalendarEvent[] => {
  if (!userData?.jobs || !allPunches?.length) return [];

  const events: ShiftCalendarEvent[] = [];

  // Group punches by date and job for dashboard display
  const punchMap = new Map<string, PunchWithJobInfo[]>();

  allPunches.forEach((punch) => {
    const punchStart = new Date(punch.timeIn);

    // Only include punches within our date range
    if (punchStart >= startDate && punchStart <= endDate) {
      const dateKey = punchStart.toDateString();
      const job = userData.jobs?.find((j) => j._id === punch.jobId);
      if (!job) return;

      const groupKey = `${dateKey}-${punch.jobId}`;

      if (!punchMap.has(groupKey)) {
        punchMap.set(groupKey, []);
      }
      punchMap.get(groupKey)!.push(punch);
    }
  });

  // Create events from grouped punches
  punchMap.forEach((punches, groupKey) => {
    const [, jobId] = groupKey.split('-');
    const job = userData.jobs?.find((j) => j._id === jobId);
    if (!job) return;

    // Calculate total hours for this day/job combination
    let totalWorkingMinutes = 0;
    let hasActivePunch = false;

    punches.forEach((punch) => {
      if (punch.timeOut) {
        const punchStart = new Date(punch.timeIn);
        const punchEnd = new Date(punch.timeOut);
        totalWorkingMinutes +=
          (punchEnd.getTime() - punchStart.getTime()) / (1000 * 60);
      } else {
        hasActivePunch = true;
        const punchStart = new Date(punch.timeIn);
        const now = new Date();
        totalWorkingMinutes +=
          (now.getTime() - punchStart.getTime()) / (1000 * 60);
      }
    });

    const totalHours = Math.round((totalWorkingMinutes / 60) * 100) / 100;
    const firstPunch = punches[0];
    const lastPunch = punches[punches.length - 1];

    // Set event start to first punch time, end to last punch time (or current time if active)
    const eventStart = new Date(firstPunch.timeIn);
    const eventEnd = lastPunch.timeOut
      ? new Date(lastPunch.timeOut)
      : new Date();

    const status = hasActivePunch ? 'active' : 'completed';
    const color = hasActivePunch ? 'green' : 'blue';

    // Get shift information
    const shift = job.shifts?.find((s) => s.slug === firstPunch.shiftSlug);

    events.push({
      id: `dashboard-${groupKey}`, // Unique ID for dashboard events
      title: `${job.title} - ${totalHours}h`, // Show job title and total hours
      color,
      start: eventStart,
      end: eventEnd,
      punchData: firstPunch, // Use first punch as representative
      jobData: job,
      shiftData: shift,
      status,
      totalHours,
      punchCount: punches.length,
      allPunches: punches, // All punches for this day/job
    });
  });

  return events;
};

// Component that listens to calendar context for event selections (dashboard version)
const DashboardCalendarEventHandler = ({
  shiftEvents,
  onShiftClick,
}: {
  shiftEvents: ShiftCalendarEvent[];
  onShiftClick: (shiftEvent: ShiftCalendarEvent) => void;
}) => {
  // Use the calendar context hook
  const { selectedEvent, manageEventDialogOpen, setManageEventDialogOpen } =
    useCalendarContext();

  useEffect(() => {
    // When calendar selects an event and opens the dialog
    if (selectedEvent && manageEventDialogOpen) {
      // Find the corresponding shift event
      const shiftEvent = shiftEvents.find(
        (event) => event.id === selectedEvent.id
      );

      if (shiftEvent) {
        // Close the calendar's default dialog
        setManageEventDialogOpen(false);

        // Open our custom shift modal
        onShiftClick(shiftEvent);
      }
    }
  }, [
    selectedEvent,
    manageEventDialogOpen,
    shiftEvents,
    onShiftClick,
    setManageEventDialogOpen,
  ]);

  return null; // This component doesn't render anything
};

// Stats Cards Component
const StatsCards = ({
  view,
  statsData,
  isLoading,
}: {
  view: 'monthly' | 'weekly' | 'calendar';
  statsData?: DashboardStats;
  isLoading?: boolean;
}) => {
  // Show loading state
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-20 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-16 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-24"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (view === 'monthly') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total days</p>
                <p className="text-3xl font-bold text-appPrimary">
                  {statsData?.shiftsCompleted || 119}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <TrendingDown className="w-3 h-3 text-red-500" />
                  <span className="text-xs text-red-500">
                    2 days from previous year
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Avg monthly</p>
              <p className="text-3xl font-bold text-appPrimary">20</p>
              <div className="flex items-center gap-1 mt-2">
                <TrendingDown className="w-3 h-3 text-red-500" />
                <span className="text-xs text-red-500">
                  1.6 days from previous year
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Best month</p>
              <p className="text-3xl font-bold text-appPrimary">23</p>
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp className="w-3 h-3 text-green-500" />
                <span className="text-xs text-green-500">
                  2 days from previous year
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Lowest month</p>
              <p className="text-3xl font-bold text-red-600">15</p>
              <div className="flex items-center gap-1 mt-2">
                <TrendingDown className="w-3 h-3 text-red-500" />
                <span className="text-xs text-red-500">
                  1.5 days from previous year
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Weekly and Calendar view stats
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-cyan-500" />
                <p className="text-sm text-gray-600">Total hours this week</p>
              </div>
              <p className="text-3xl font-bold text-cyan-500">
                {statsData?.totalHours
                  ? `${statsData.totalHours} hrs`
                  : '0 hrs'}
              </p>
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp className="w-3 h-3 text-green-500" />
                <span className="text-xs text-green-500">
                  {statsData?.weeklyChange?.hours
                    ? `+${statsData.weeklyChange.hours} hrs from last week`
                    : 'No change from last week'}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-green-500" />
              <p className="text-sm text-gray-600">Shifts Completed</p>
            </div>
            <p className="text-3xl font-bold text-green-600">
              {statsData?.shiftsCompleted || 0}
            </p>
            <div className="flex items-center gap-1 mt-2">
              <TrendingDown className="w-3 h-3 text-red-500" />
              <span className="text-xs text-red-500">
                {statsData?.weeklyChange?.shifts
                  ? `${statsData.weeklyChange.shifts} shifts from last month`
                  : 'No change from last month'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <User className="w-4 h-4 text-yellow-500" />
              <p className="text-sm text-gray-600">Absences</p>
            </div>
            <p className="text-3xl font-bold text-yellow-600">
              {statsData?.absences || 0}
            </p>
            <div className="flex items-center gap-1 mt-2">
              <TrendingUp className="w-3 h-3 text-red-500" />
              <span className="text-xs text-red-500">
                {statsData?.weeklyChange?.absences
                  ? `+${statsData.weeklyChange.absences} from last month`
                  : 'No change from last month'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <p className="text-sm text-gray-600">Geofence Violation</p>
            </div>
            <p className="text-3xl font-bold text-red-600">
              {statsData?.geofenceViolations || 0}
            </p>
            <div className="flex items-center gap-1 mt-2">
              <span className="text-xs text-red-500">
                {statsData?.weeklyChange?.violations
                  ? `+${statsData.weeklyChange.violations} new`
                  : 'No new violations'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Performance Summary Component (for weekly view)
const PerformanceSummary = ({
  performanceData,
  isLoading,
}: {
  performanceData?: PerformanceMetrics;
  isLoading?: boolean;
}) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Performance Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="p-4 bg-gray-50 rounded-lg border animate-pulse"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-300 rounded"></div>
                  <div className="h-4 bg-gray-300 rounded w-20"></div>
                </div>
                <div className="h-4 bg-gray-300 rounded w-12"></div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Performance Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 bg-green-50 rounded-lg border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-gray-700">On-time Rate</span>
            </div>
            <span className="font-semibold text-green-600">
              {performanceData?.onTimeRate
                ? `${performanceData.onTimeRate}%`
                : '0%'}
            </span>
          </div>
        </div>

        <div className="p-4 bg-blue-50 rounded-lg border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              <span className="text-gray-700">Avg Hours/Day</span>
            </div>
            <span className="font-semibold text-blue-600">
              {performanceData?.avgHoursPerDay
                ? `${performanceData.avgHoursPerDay} hrs`
                : '0 hrs'}
            </span>
          </div>
        </div>

        <div className="p-4 bg-red-50 rounded-lg border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span className="text-gray-700">Violation Rate</span>
            </div>
            <span className="font-semibold text-red-600">
              {performanceData?.violationRate
                ? `${performanceData.violationRate}%`
                : '0%'}
            </span>
          </div>
        </div>

        <div className="p-4 bg-green-50 rounded-lg border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-green-600" />
              <span className="text-gray-700">Attendance Rate</span>
            </div>
            <span className="font-semibold text-green-600">
              {performanceData?.attendanceRate
                ? `${performanceData.attendanceRate}%`
                : '0%'}
            </span>
          </div>
        </div>

        <div className="p-4 bg-cyan-50 rounded-lg border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-600" />
              <span className="text-gray-700">Overtime Hours</span>
            </div>
            <span className="font-semibold text-cyan-600">
              {performanceData?.overtimeHours
                ? `${performanceData.overtimeHours} hrs`
                : '0 hrs'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Weekly Shift Details Table Component
const WeeklyShiftTable = ({
  shiftData,
  isLoading,
}: {
  shiftData?: ShiftTableDataType[];
  isLoading?: boolean;
}) => {
  const columns: TableColumn<Record<string, unknown>>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (value: unknown) => String(value),
    },
    {
      key: 'jobSite',
      header: 'Job/Site',
      render: (value: unknown) => String(value),
    },
    {
      key: 'timeRange',
      header: 'Start - End Time',
      render: (value: unknown) => (
        <span style={{ whiteSpace: 'pre-line' }}>{String(value)}</span>
      ),
    },
    {
      key: 'punches',
      header: 'Punches',
      render: (value: unknown) => String(value),
    },
    {
      key: 'totalHours',
      header: 'Total Hours',
      render: (value: unknown) => String(value),
    },
    {
      key: 'location',
      header: 'Location',
      render: (value: unknown, row: Record<string, unknown>) => (
        <span className={(row.locationColor as string) || 'text-gray-900'}>
          {String(value)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (value: unknown, row: Record<string, unknown>) => (
        <span className={`${row.statusColor as string} font-semibold`}>
          {String(value)}
        </span>
      ),
    },
  ];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Weekly Shift Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const tableData: Record<string, unknown>[] = (shiftData || []).map(
    (item) => ({ ...item })
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Weekly Shift Details</CardTitle>
      </CardHeader>
      <CardContent>
        <Table
          columns={columns}
          data={tableData}
          showPagination={true}
          selectable={true}
          className="w-full"
          emptyMessage="No shift data available."
        />
      </CardContent>
    </Card>
  );
};

// Insights Component
const InsightsRecommendations = ({
  view,
  insightsData,
  isLoading,
}: {
  view: 'monthly' | 'weekly' | 'calendar';
  insightsData?: InsightData[];
  isLoading?: boolean;
}) => {
  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {view === 'monthly' ? 'Monthly' : 'Weekly'} Insights &
            Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg animate-pulse"
            >
              <div className="w-4 h-4 bg-gray-300 rounded mt-0.5"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-300 rounded w-24 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-full mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-3/4"></div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // Fallback data if no real insights are available
  const fallbackInsights =
    view === 'monthly'
      ? [
          {
            title: 'Productivity Trend',
            description:
              'Your productivity peaked this month. Consider scheduling important tasks on similar high-energy days.',
            type: 'productivity' as const,
            priority: 'medium' as const,
          },
          {
            title: 'Goal Progress',
            description:
              "You're on track towards your monthly targets. Maintain current pace to exceed expectations.",
            type: 'goal' as const,
            priority: 'low' as const,
          },
        ]
      : [
          {
            title: 'Weekly Performance',
            description:
              'Your weekly performance shows consistent improvement. Keep up the great work!',
            type: 'productivity' as const,
            priority: 'medium' as const,
          },
          {
            title: 'Schedule Optimization',
            description:
              'Consider optimizing your schedule for better work-life balance and productivity.',
            type: 'schedule' as const,
            priority: 'low' as const,
          },
        ];

  const displayInsights =
    insightsData && insightsData.length > 0 ? insightsData : fallbackInsights;

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'productivity':
        return <BarChart3 className="w-4 h-4 text-blue-600" />;
      case 'alert':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'goal':
        return <Target className="w-4 h-4 text-green-600" />;
      case 'schedule':
        return <Calendar className="w-4 h-4 text-yellow-600" />;
      default:
        return <BarChart3 className="w-4 h-4 text-appPrimary" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {view === 'monthly' ? 'Monthly' : 'Weekly'} Insights & Recommendations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {displayInsights.map((insight, index) => (
          <div
            key={index}
            className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
          >
            <div className="mt-0.5">{getInsightIcon(insight.type)}</div>
            <div>
              <span className="font-medium text-gray-900">{insight.title}</span>
              <p className="text-gray-600 text-sm mt-1">
                {insight.description}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

// Today's Attendance Component
const TodayAttendance = ({
  attendanceData,
  isLoading,
}: {
  attendanceData?: TodayAttendanceData[];
  isLoading?: boolean;
}) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today&apos;s Attendance</CardTitle>
          <CardDescription>Live employee check-in status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b last:border-b-0 animate-pulse"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-300 rounded-full"></div>
                  <div>
                    <div className="h-4 bg-gray-300 rounded w-20 mb-1"></div>
                    <div className="h-3 bg-gray-200 rounded w-16"></div>
                  </div>
                </div>
                <div className="h-4 bg-gray-300 rounded w-12"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const displayData = attendanceData || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Today&apos;s Attendance</CardTitle>
        <CardDescription>Live employee check-in status</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {displayData.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              No attendance data available
            </p>
          ) : (
            displayData.map((person, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-2 border-b last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                    <span className="text-xs font-medium">{person.avatar}</span>
                  </div>
                  <div>
                    <p className="font-medium text-sm">{person.name}</p>
                    <p className="text-xs text-gray-500">{person.time}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold">{person.hours}</span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Main Dashboard Component
const DashboardPage: NextPage = () => {
  const { user, error: authError, isLoading: authLoading } = useUser();
  const { data: currentUser, isLoading: currentUserLoading } = useCurrentUser();
  const { data: userData, isLoading: userLoading } = useUserApplicantJob(
    user?.email || ''
  );
  // Auth check
  const { shouldShowContent, isLoading: pageAuthLoading, error: pageAuthError } = usePageAuth({
    requireAuth: true,
  });

  const [dashboardView, setDashboardView] = useState<
    'monthly' | 'weekly' | 'calendar'
  >('weekly');
  const [currentDate, setCurrentDate] = useState(new Date(2025, 5, 16)); // June 16, 2025
  const [mode, setMode] = useState<Mode>('month');

  // Shift Details Modal State for dashboard
  const [selectedShift, setSelectedShift] = useState<ShiftCalendarEvent | null>(
    null
  );
  const [showShiftModal, setShowShiftModal] = useState(false);

  // Calendar date range for punch data fetching
  const calendarDateRange = useMemo(() => {
    // For calendar view, fetch a month range around current date
    const start = new Date(currentDate);
    start.setDate(1); // Start of month
    start.setHours(0, 0, 0, 0);

    const end = new Date(currentDate);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0); // Last day of month
    end.setHours(23, 59, 59, 999);

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  }, [currentDate]);

  // Get job IDs for the user
  const jobIds = useMemo(() => {
    const ids = userData?.jobs?.map((job) => job._id) || [];
    return ids;
  }, [userData?.jobs]);

  // Fetch punch data for calendar events
  const { data: allPunches } = useFindPunches({
    userId: userData?._id || '',
    jobIds,
    startDate: calendarDateRange.startDate,
    endDate: calendarDateRange.endDate,
  });

  // Generate calendar events from punch data
  const shiftEvents = useMemo(() => {
    if (!userData || !allPunches?.length) return [];

    const start = new Date(calendarDateRange.startDate);
    const end = new Date(calendarDateRange.endDate);

    return generateDashboardShiftEvents(userData, start, end, allPunches);
  }, [userData, allPunches, calendarDateRange]);

  // Convert to regular CalendarEvent for the calendar component
  const calendarEvents = useMemo(() => {
    return shiftEvents.map((event) => ({
      id: event.id,
      title: event.title,
      color: event.color,
      start: event.start,
      end: event.end,
    }));
  }, [shiftEvents]);

  const [events, setEvents] = useState<CalendarEvent[]>([]);

  // Update calendar events when shift events change
  useEffect(() => {
    setEvents(calendarEvents);
  }, [calendarEvents]);

  // Handle shift click from calendar
  const handleShiftClick = (shiftEvent: ShiftCalendarEvent) => {
    setSelectedShift(shiftEvent);
    setShowShiftModal(true);
  };

  const handleCloseShiftModal = () => {
    setShowShiftModal(false);
    setSelectedShift(null);
  };

  // Prepare dashboard parameters
  const dashboardParams = useMemo(() => {
    if (!currentUser?._id) return null;
    return formatDashboardParams(currentUser._id, dashboardView, currentDate);
  }, [currentUser?._id, dashboardView, currentDate]);

  // Fetch dashboard data using our hooks
  const { data: statsData, isLoading: statsLoading } = useDashboardStats(
    dashboardParams,
    { enabled: !!dashboardParams }
  );

  const { data: attendanceData, isLoading: attendanceLoading } =
    useAttendanceData(dashboardParams, { enabled: !!dashboardParams });

  const { data: performanceData, isLoading: performanceLoading } =
    usePerformanceMetrics(dashboardParams, { enabled: !!dashboardParams });

  const { data: insightsData, isLoading: insightsLoading } = useInsights(
    dashboardParams,
    { enabled: !!dashboardParams }
  );

  const { data: todayAttendance, isLoading: todayAttendanceLoading } =
    useTodayAttendance();

  // Show loading state
  if (authLoading || currentUserLoading || userLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
          <p className="text-gray-600 font-medium">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (authError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
            <CardDescription>
              {authError.message || 'Something went wrong'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.reload()} fullWidth>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show not authenticated state
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-yellow-600">
              Authentication Required
            </CardTitle>
            <CardDescription>
              Please log in to access your dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild fullWidth>
              <a href="/auth/login">Log In</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Early returns for auth states (after all hooks are called)
  if (pageAuthLoading || authLoading) {
    return <AuthLoadingState />;
  }

  if (pageAuthError || authError) {
    const errorMessage = pageAuthError?.message || 
                        (authError && typeof authError === 'object' && 'message' in authError ? 
                         (authError as { message: string }).message : 
                         'Authentication error');
    return <AuthErrorState error={errorMessage} />;
  }

  if (!shouldShowContent) {
    return <UnauthenticatedState />;
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Dashboard Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <div className="flex items-center gap-4">
            {dashboardView === 'calendar' && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium">
                  June 01 - June 07, 2025
                </span>
                <Button variant="outline" size="sm">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
            <ToggleGroup
              className="inline-flex rounded-lg border border-gray-30 p-1 self-start sm:self-auto shadow-sm"
              type="single"
              value={dashboardView}
              onValueChange={(value) =>
                value && setDashboardView(value as typeof dashboardView)
              }
            >
              <ToggleGroupItem
                value="monthly"
                className={clsxm(
                  'rounded-md px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-all',
                  dashboardView === 'monthly'
                    ? 'bg-appPrimary text-white shadow-md'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                )}
              >
                Monthly
              </ToggleGroupItem>
              <ToggleGroupItem
                value="weekly"
                className={clsxm(
                  'rounded-md px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-all',
                  dashboardView === 'weekly'
                    ? 'bg-appPrimary text-white shadow-md'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                )}
              >
                Weekly
              </ToggleGroupItem>
              <ToggleGroupItem
                value="calendar"
                className={clsxm(
                  'rounded-md px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-all',
                  dashboardView === 'calendar'
                    ? 'bg-appPrimary text-white shadow-md'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                )}
              >
                Calendar
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {/* Stats Cards */}
        <StatsCards
          view={dashboardView}
          statsData={statsData}
          isLoading={statsLoading}
        />

        {/* Monthly View */}
        {dashboardView === 'monthly' && (
          <div className="space-y-6">
            {/* Charts and Today's Attendance */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Bar Chart */}
              <Card className="w-full lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg">
                    2025 Attendance Trends
                  </CardTitle>
                  <CardDescription>
                    Year-to-date employee attendance (Jan - Jun)
                  </CardDescription>
                  <div className="flex gap-4 text-xs">
                    <span className="text-green-600">Peak: June (23 days)</span>
                    <span className="text-red-600">Low: March (15 days)</span>
                    <span className="text-blue-600">YTD Attendance: 88%</span>
                  </div>
                </CardHeader>
                <CardContent>
                  {attendanceLoading ? (
                    <div className="flex items-center justify-center h-[300px] animate-pulse">
                      <div className="text-gray-500">Loading chart data...</div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={attendanceData?.monthlyAttendance || []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip />
                        <Bar
                          dataKey="days"
                          fill="#40C8FD"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Today's Attendance */}
              <TodayAttendance
                attendanceData={todayAttendance}
                isLoading={todayAttendanceLoading}
              />
            </div>

            {/* Weekly Shift Details Table */}
            <WeeklyShiftTable
              shiftData={performanceData?.shiftDetails}
              isLoading={performanceLoading}
            />

            {/* Monthly Insights & Recommendations */}
            <InsightsRecommendations
              view="monthly"
              insightsData={insightsData}
              isLoading={insightsLoading}
            />
          </div>
        )}

        {/* Weekly View */}
        {dashboardView === 'weekly' && (
          <div className="space-y-6">
            {/* Daily Trends and Performance Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Line Chart */}
              <Card className="w-full lg:col-span-2">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">Daily Trends</CardTitle>
                      <CardDescription>
                        Week of June 1 - June 7, 2025
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <select className="text-sm border rounded px-3 py-1">
                        <option>Hours Worked</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs mt-2">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-cyan-500" />
                      <span className="text-gray-600">
                        Total Break Time: 4.32 hrs
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <BarChart3 className="w-3 h-3 text-blue-500" />
                      <span className="text-blue-600">
                        Productivity Score: 92%
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Activity className="w-3 h-3 text-yellow-500" />
                      <span className="text-yellow-600">
                        Efficiency Rating: 88%
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={attendanceData?.weeklyTrends || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" />
                      <YAxis />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="hours"
                        stroke="#40C8FD"
                        strokeWidth={3}
                        dot={{ fill: '#40C8FD', strokeWidth: 2, r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Performance Summary */}
              <PerformanceSummary
                performanceData={performanceData?.performanceMetrics}
                isLoading={performanceLoading}
              />
            </div>

            {/* Weekly Shift Details Table */}
            <WeeklyShiftTable
              shiftData={performanceData?.shiftDetails}
              isLoading={performanceLoading}
            />

            {/* Weekly Insights & Recommendations */}
            <InsightsRecommendations
              view="weekly"
              insightsData={insightsData}
              isLoading={insightsLoading}
            />
          </div>
        )}

        {/* Calendar View */}
        {dashboardView === 'calendar' && (
          <div className="space-y-6">
            {/* Attendance Trends Bar Chart */}

            {/* Today's Attendance & Calendar */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Bar Chart */}
              <Card className="w-full lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg">
                    2025 Attendance Trends
                  </CardTitle>
                  <CardDescription>
                    Year-to-date employee attendance (Jan - Jun)
                  </CardDescription>
                  <div className="flex gap-4 text-xs">
                    <span className="text-green-600">Peak: June (23 days)</span>
                    <span className="text-red-600">Low: March (15 days)</span>
                    <span className="text-blue-600">YTD Attendance: 88%</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={attendanceData?.monthlyAttendance || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Bar
                        dataKey="days"
                        fill="#40C8FD"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Today's Attendance */}
              <TodayAttendance
                attendanceData={todayAttendance}
                isLoading={todayAttendanceLoading}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Weekly Shift Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden">
                  <CalendarProvider
                    events={events}
                    setEvents={setEvents}
                    mode={mode}
                    setMode={setMode}
                    date={currentDate}
                    setDate={setCurrentDate}
                    calendarIconIsToday={false}
                  >
                    <div className="p-4 border-b bg-white">
                      <div className="flex items-center justify-between">
                        <CalendarHeaderDate />
                        <CalendarHeaderActionsMode />
                      </div>
                    </div>
                    <CalendarBody hideTotalColumn={true} />

                    {/* Custom event handler - listen to calendar context */}
                    <DashboardCalendarEventHandler
                      shiftEvents={shiftEvents}
                      onShiftClick={handleShiftClick}
                    />
                  </CalendarProvider>
                </div>

                {/* Calendar Legend */}
                <div className="flex items-center gap-4 mt-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-green-500 rounded"></div>
                    <span>Work Day</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                    <span>Partial Day</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-red-500 rounded"></div>
                    <span>Vacation Day</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-gray-300 rounded"></div>
                    <span>Off Day</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Insights & Recommendations */}
            <InsightsRecommendations
              view="calendar"
              insightsData={insightsData}
              isLoading={insightsLoading}
            />
          </div>
        )}
      </div>

      {/* Shift Details Modal - Read-only for Dashboard */}
      <ShiftDetailsModal
        isOpen={showShiftModal}
        onClose={handleCloseShiftModal}
        shiftEvent={selectedShift}
        userData={{
          _id: currentUser?._id || '',
          applicantId: currentUser?.applicantId || '',
          userType: 'User', // Default for dashboard view
        }}
        onSuccess={() => {}}
      />
    </Layout>
  );
};

export default DashboardPage;
