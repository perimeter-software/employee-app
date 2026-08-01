'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { format, startOfWeek, endOfWeek } from 'date-fns';
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
  CalendarIcon,
  Activity,
  Clock,
  TrendingUp,
  TrendingDown,
  User,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Target,
  DollarSign,
  LayoutDashboard,
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
import Calendar from '@/components/ui/Calendar/Calendar';
import { CalendarEvent, Mode } from '@/components/ui/Calendar';
import { useCalendarContext } from '@/components/ui/Calendar/CalendarContext';
import { useCurrentUser } from '@/domains/user';
import { useAppUser } from '@/domains/user/hooks/useAppUser';
import { useUserApplicantJob } from '@/domains/job/hooks';
import { useCompanyWorkWeek } from '@/domains/shared/hooks/use-company-work-week';
import { Table } from '@/components/ui/Table';
import { TableColumn } from '@/components/ui/Table/types';
import { clsxm } from '@/lib/utils';
import ReactSelect from 'react-select';
import { useQuery } from '@tanstack/react-query';
import { useDashboardStats } from '@/domains/dashboard/hooks/use-dashboard-stats';
import { useAttendanceData } from '@/domains/dashboard/hooks/use-attendance-data';
import { usePerformanceMetrics } from '@/domains/dashboard/hooks/use-performance-metrics';
import { useInsights } from '@/domains/dashboard/hooks/use-insights';
import { formatDashboardParams } from '@/domains/dashboard/utils/dashboard-utils';
import {
  DashboardStats,
  PerformanceMetrics,
  InsightData,
  ShiftTableData as ShiftTableDataType,
} from '@/domains/dashboard/types';
import { useFindPunches } from '@/domains/punch/hooks/use-find-punches';
import type { PunchWithJobInfo } from '@/domains/punch/types';
import type { GignologyJob, Shift } from '@/domains/job/types/job.types';
import { ShiftDetailsModal } from '@/domains/punch/components/TimeTracker/ShiftDetailsModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShiftCalendarEvent extends CalendarEvent {
  punchData?: PunchWithJobInfo;
  jobData?: GignologyJob;
  shiftData?: Shift;
  status: 'active' | 'completed' | 'scheduled' | 'missed';
  totalHours?: number;
  punchCount?: number;
  allPunches?: PunchWithJobInfo[];
}

export interface DashboardViewProps {
  mode: 'full' | 'mini';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const generateDashboardShiftEvents = (
  userData: { jobs?: GignologyJob[] },
  startDate: Date,
  endDate: Date,
  allPunches?: PunchWithJobInfo[]
): ShiftCalendarEvent[] => {
  if (!userData?.jobs || !allPunches?.length) return [];
  const events: ShiftCalendarEvent[] = [];
  const punchMap = new Map<string, PunchWithJobInfo[]>();

  allPunches.forEach((punch) => {
    const punchStart = new Date(punch.timeIn);
    if (punchStart >= startDate && punchStart <= endDate) {
      const dateKey = punchStart.toDateString();
      const job = userData.jobs?.find((j) => j._id === punch.jobId);
      if (!job) return;
      const groupKey = `${dateKey}-${punch.jobId}`;
      if (!punchMap.has(groupKey)) punchMap.set(groupKey, []);
      punchMap.get(groupKey)!.push(punch);
    }
  });

  punchMap.forEach((punches, groupKey) => {
    const [, jobId] = groupKey.split('-');
    const job = userData.jobs?.find((j) => j._id === jobId);
    if (!job) return;
    let totalWorkingMinutes = 0;
    let hasActivePunch = false;
    punches.forEach((punch) => {
      if (punch.timeOut) {
        totalWorkingMinutes +=
          (new Date(punch.timeOut).getTime() - new Date(punch.timeIn).getTime()) / 60000;
      } else {
        hasActivePunch = true;
        totalWorkingMinutes +=
          (Date.now() - new Date(punch.timeIn).getTime()) / 60000;
      }
    });
    const totalHours = Math.round((totalWorkingMinutes / 60) * 100) / 100;
    const firstPunch = punches[0];
    const lastPunch = punches[punches.length - 1];
    const shift = job.shifts?.find((s) => s.slug === firstPunch.shiftSlug);
    events.push({
      id: `dashboard-${groupKey}`,
      title: `${job.title} - ${totalHours}h`,
      color: hasActivePunch ? 'green' : 'blue',
      start: new Date(firstPunch.timeIn),
      end: lastPunch.timeOut ? new Date(lastPunch.timeOut) : new Date(),
      punchData: firstPunch,
      jobData: job,
      shiftData: shift,
      status: hasActivePunch ? 'active' : 'completed',
      totalHours,
      punchCount: punches.length,
      allPunches: punches,
    });
  });
  return events;
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const DashboardCalendarEventHandler = ({
  shiftEvents,
  onShiftClick,
}: {
  shiftEvents: ShiftCalendarEvent[];
  onShiftClick: (e: ShiftCalendarEvent) => void;
}) => {
  const { selectedEvent, manageEventDialogOpen, setManageEventDialogOpen } =
    useCalendarContext();
  useEffect(() => {
    if (selectedEvent && manageEventDialogOpen) {
      const shiftEvent = shiftEvents.find((e) => e.id === selectedEvent.id);
      if (shiftEvent) {
        setManageEventDialogOpen(false);
        onShiftClick(shiftEvent);
      }
    }
  }, [selectedEvent, manageEventDialogOpen, shiftEvents, onShiftClick, setManageEventDialogOpen]);
  return null;
};

const StatsCards = ({
  view,
  statsData,
  isLoading,
  isClient,
  compact = false,
}: {
  view: 'monthly' | 'weekly' | 'calendar';
  statsData?: DashboardStats;
  isLoading?: boolean;
  isClient?: boolean;
  compact?: boolean;
}) => {
  const cardCount = isClient && !compact ? 5 : 4;
  const gridCols = compact
    ? 'grid-cols-2 sm:grid-cols-4'
    : `grid-cols-2 ${isClient ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`;
  const gap = compact ? 'gap-2' : 'gap-3 sm:gap-6';
  const padding = compact ? 'p-3' : 'p-4 sm:p-6';
  const numSize = compact ? 'text-xl' : 'text-2xl sm:text-3xl';
  const labelSize = compact ? 'text-xs' : 'text-xs sm:text-sm';
  const iconSize = compact ? 'w-3 h-3' : 'w-3 h-3 sm:w-4 sm:h-4';

  if (isLoading) {
    return (
      <div className={`grid ${gridCols} ${gap}`}>
        {Array.from({ length: cardCount }).map((_, i) => (
          <Card key={i}>
            <CardContent className={padding}>
              <div className="animate-pulse space-y-2">
                <div className="h-3 bg-gray-200 rounded w-20" />
                <div className="h-7 bg-gray-200 rounded w-14" />
                <div className="h-2 bg-gray-200 rounded w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (view === 'monthly') {
    return (
      <div className={`grid ${compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 lg:grid-cols-4'} ${gap}`}>
        {[
          { label: 'Total days', value: statsData?.shiftsCompleted || 119, color: 'text-appPrimary', trend: 'down', trendLabel: '2 days from previous year' },
          { label: 'Avg monthly', value: 20, color: 'text-appPrimary', trend: 'down', trendLabel: '1.6 days from previous year' },
          { label: 'Best month', value: 23, color: 'text-appPrimary', trend: 'up', trendLabel: '2 days from previous year' },
          { label: 'Lowest month', value: 15, color: 'text-red-600', trend: 'down', trendLabel: '1.5 days from previous year' },
        ].map(({ label, value, color, trend, trendLabel }) => (
          <Card key={label}>
            <CardContent className={padding}>
              <p className={`${labelSize} text-gray-600 mb-1`}>{label}</p>
              <p className={`${numSize} font-bold ${color}`}>{value}</p>
              <div className="flex items-center gap-1 mt-2">
                {trend === 'up'
                  ? <TrendingUp className="w-3 h-3 text-green-500" />
                  : <TrendingDown className="w-3 h-3 text-red-500" />
                }
                <span className={`text-xs ${trend === 'up' ? 'text-green-500' : 'text-red-500'}`}>{trendLabel}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Weekly / Calendar
  return (
    <div className={`grid ${gridCols} ${gap}`}>
      <Card>
        <CardContent className={padding}>
          <div className={`flex items-center gap-1.5 mb-1`}>
            <Clock className={`${iconSize} text-cyan-500 shrink-0`} />
            <p className={`${labelSize} text-gray-600`}>Total hours this week</p>
          </div>
          <p className={`${numSize} font-bold text-cyan-500`}>
            {statsData?.totalHours ? `${statsData.totalHours} hrs` : '0 hrs'}
          </p>
          <div className="flex items-center gap-1 mt-2">
            <TrendingUp className="w-3 h-3 text-green-500 shrink-0" />
            <span className="text-xs text-green-500">
              {statsData?.weeklyChange?.hours
                ? `+${statsData.weeklyChange.hours} hrs from last week`
                : 'No change from last week'}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className={padding}>
          <div className={`flex items-center gap-1.5 mb-1`}>
            <Users className={`${iconSize} text-green-500 shrink-0`} />
            <p className={`${labelSize} text-gray-600`}>Shifts Completed</p>
          </div>
          <p className={`${numSize} font-bold text-green-600`}>
            {statsData?.shiftsCompleted || 0}
          </p>
          <div className="flex items-center gap-1 mt-2">
            <TrendingDown className="w-3 h-3 text-red-500 shrink-0" />
            <span className="text-xs text-red-500">
              {statsData?.weeklyChange?.shifts
                ? `${statsData.weeklyChange.shifts} shifts from last month`
                : 'No change from last month'}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className={padding}>
          <div className={`flex items-center gap-1.5 mb-1`}>
            <User className={`${iconSize} text-yellow-500 shrink-0`} />
            <p className={`${labelSize} text-gray-600`}>Absences</p>
          </div>
          <p className={`${numSize} font-bold text-yellow-600`}>
            {statsData?.absences || 0}
          </p>
          <div className="flex items-center gap-1 mt-2">
            <TrendingUp className="w-3 h-3 text-red-500 shrink-0" />
            <span className="text-xs text-red-500">
              {statsData?.weeklyChange?.absences
                ? `+${statsData.weeklyChange.absences} from last month`
                : 'No change from last month'}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className={padding}>
          <div className={`flex items-center gap-1.5 mb-1`}>
            <AlertTriangle className={`${iconSize} text-red-500 shrink-0`} />
            <p className={`${labelSize} text-gray-600`}>Shifts Pending</p>
          </div>
          <p className={`${numSize} font-bold text-red-600`}>
            {statsData?.geofenceViolations || 0}
          </p>
          <div className="flex items-center gap-1 mt-2">
            <span className="text-xs text-red-500">
              {statsData?.weeklyChange?.violations
                ? `+${statsData.weeklyChange.violations} new`
                : 'No new violations'}
            </span>
          </div>
        </CardContent>
      </Card>

      {isClient && !compact && (
        <Card>
          <CardContent className={padding}>
            <div className={`flex items-center gap-1.5 mb-1`}>
              <DollarSign className={`${iconSize} text-purple-500 shrink-0`} />
              <p className={`${labelSize} text-gray-600`}>Total Spend</p>
            </div>
            <p className={`${numSize} font-bold text-purple-600`}>
              {statsData?.totalSpend !== undefined
                ? `$${statsData.totalSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '$0.00'}
            </p>
            <div className="flex items-center gap-1 mt-2">
              <span className="text-xs text-gray-500">Bill Rate × Hours</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const PerformanceSummary = ({
  performanceData,
  isLoading,
}: {
  performanceData?: PerformanceMetrics;
  isLoading?: boolean;
}) => {
  const rows = [
    { icon: CheckCircle, label: 'On-time Rate', value: performanceData?.onTimeRate ? `${performanceData.onTimeRate}%` : '0%', bg: 'bg-green-50', color: 'text-green-600' },
    { icon: BarChart3, label: 'Avg Hours/Day', value: performanceData?.avgHoursPerDay ? `${performanceData.avgHoursPerDay} hrs` : '0 hrs', bg: 'bg-blue-50', color: 'text-blue-600' },
    { icon: AlertTriangle, label: 'Violation Rate', value: performanceData?.violationRate ? `${performanceData.violationRate}%` : '0%', bg: 'bg-red-50', color: 'text-red-600' },
    { icon: Users, label: 'Attendance Rate', value: performanceData?.attendanceRate ? `${performanceData.attendanceRate}%` : '0%', bg: 'bg-green-50', color: 'text-green-600' },
    { icon: Clock, label: 'Overtime Hours', value: performanceData?.overtimeHours ? `${performanceData.overtimeHours} hrs` : '0 hrs', bg: 'bg-cyan-50', color: 'text-cyan-600' },
  ];

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Performance Summary</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {rows.map((_, i) => (
            <div key={i} className="p-4 bg-gray-50 rounded-lg border animate-pulse">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-300 rounded" />
                  <div className="h-4 bg-gray-300 rounded w-20" />
                </div>
                <div className="h-4 bg-gray-300 rounded w-12" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Performance Summary</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {rows.map(({ icon: Icon, label, value, bg, color }) => (
          <div key={label} className={`p-4 ${bg} rounded-lg border`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-gray-700">{label}</span>
              </div>
              <span className={`font-semibold ${color}`}>{value}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

const WeeklyShiftTable = ({
  shiftData,
  isLoading,
}: {
  shiftData?: ShiftTableDataType[];
  isLoading?: boolean;
}) => {
  const columns: TableColumn<Record<string, unknown>>[] = [
    { key: 'date', header: 'Date', render: (v) => String(v) },
    { key: 'jobSite', header: 'Job/Site', render: (v) => String(v) },
    {
      key: 'timeRange',
      header: 'Start - End Time',
      render: (v) => <span style={{ whiteSpace: 'pre-line' }}>{String(v)}</span>,
    },
    { key: 'punches', header: 'Punches', render: (v) => String(v) },
    { key: 'totalHours', header: 'Total Hours', render: (v) => String(v) },
    {
      key: 'location',
      header: 'Location',
      render: (v, row) => (
        <span className={(row.locationColor as string) || 'text-gray-900'}>{String(v)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (v, row) => (
        <span className={`${row.statusColor as string} font-semibold`}>{String(v)}</span>
      ),
    },
  ];

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Weekly Shift Details</CardTitle></CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-gray-200 rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Weekly Shift Details</CardTitle></CardHeader>
      <CardContent>
        <Table
          columns={columns}
          data={(shiftData || []).map((item) => ({ ...item }))}
          showPagination
          selectable
          className="w-full"
          emptyMessage="No shift data available."
        />
      </CardContent>
    </Card>
  );
};

const InsightsRecommendations = ({
  view,
  insightsData,
  isLoading,
}: {
  view: 'monthly' | 'weekly' | 'calendar';
  insightsData?: InsightData[];
  isLoading?: boolean;
}) => {
  const fallback =
    view === 'monthly'
      ? [
          { title: 'Productivity Trend', description: 'Your productivity peaked this month. Consider scheduling important tasks on similar high-energy days.', type: 'productivity' as const, priority: 'medium' as const },
          { title: 'Goal Progress', description: "You're on track towards your monthly targets. Maintain current pace to exceed expectations.", type: 'goal' as const, priority: 'low' as const },
        ]
      : [
          { title: 'Weekly Performance', description: 'Your weekly performance shows consistent improvement. Keep up the great work!', type: 'productivity' as const, priority: 'medium' as const },
          { title: 'Schedule Optimization', description: 'Consider optimizing your schedule for better work-life balance and productivity.', type: 'schedule' as const, priority: 'low' as const },
        ];

  const display = insightsData?.length ? insightsData : fallback;

  const getIcon = (type: string) => {
    switch (type) {
      case 'productivity': return <BarChart3 className="w-4 h-4 text-blue-600" />;
      case 'alert': return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'goal': return <Target className="w-4 h-4 text-green-600" />;
      case 'schedule': return <CalendarIcon className="w-4 h-4 text-yellow-600" />;
      default: return <BarChart3 className="w-4 h-4 text-appPrimary" />;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">{view === 'monthly' ? 'Monthly' : 'Weekly'} Insights & Recommendations</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg animate-pulse">
              <div className="w-4 h-4 bg-gray-300 rounded mt-0.5" />
              <div className="flex-1">
                <div className="h-4 bg-gray-300 rounded w-24 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-full mb-1" />
                <div className="h-3 bg-gray-200 rounded w-3/4" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">{view === 'monthly' ? 'Monthly' : 'Weekly'} Insights & Recommendations</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {display.map((insight, i) => (
          <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="mt-0.5">{getIcon(insight.type)}</div>
            <div>
              <span className="font-medium text-gray-900">{insight.title}</span>
              <p className="text-gray-600 text-sm mt-1">{insight.description}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// DashboardView — shared by /dashboard (full) and /home (mini)
// ---------------------------------------------------------------------------

export const DashboardView: React.FC<DashboardViewProps> = ({ mode }) => {
  const { user } = useAppUser();
  const { data: currentUser } = useCurrentUser();
  const { weekStartsOn, isLoading: companyLoading } = useCompanyWorkWeek();

  const [dashboardView, setDashboardView] = useState<'monthly' | 'weekly' | 'calendar'>('weekly');
  const [currentDate, setCurrentDate] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );

  // Mini-mode only: controls the collapsible card
  const [dashboardExpanded, setDashboardExpanded] = useState(false);

  // Full-mode only: calendar display mode and shift modal
  const [calendarMode, setCalendarMode] = useState<Mode>('month');
  const [selectedShift, setSelectedShift] = useState<ShiftCalendarEvent | null>(null);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  const isClient = currentUser?.userType === 'Client';
  const isFull = mode === 'full';

  // Sync currentDate when company work week loads
  useEffect(() => {
    if (!companyLoading && weekStartsOn !== undefined) {
      setCurrentDate(startOfWeek(new Date(), { weekStartsOn }));
    }
  }, [weekStartsOn, companyLoading]);

  // Employee list (full mode + Client only)
  const { data: employeesList = [], isLoading: employeesListLoading } = useQuery<
    Array<{ _id: string; firstName: string; lastName: string; email: string }>
  >({
    queryKey: ['employeesList'],
    queryFn: async () => {
      const res = await fetch('/api/employees/list');
      if (!res.ok) return [];
      const json = await res.json();
      return json.data || [];
    },
    enabled: isClient && isFull,
    staleTime: 300000,
  });

  // Job data (full mode only, used for calendar events)
  const { data: userData } = useUserApplicantJob(
    isFull ? (user?.email || '') : ''
  );

  // Calendar date range for punch data
  const calendarDateRange = useMemo(() => {
    const start = new Date(currentDate);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(currentDate);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
    end.setHours(23, 59, 59, 999);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }, [currentDate]);

  const jobIds = useMemo(
    () => (isFull ? userData?.jobs?.map((j) => j._id) || [] : []),
    [userData?.jobs, isFull]
  );

  const { data: allPunches } = useFindPunches({
    userId: isFull ? (userData?._id || '') : '',
    jobIds,
    startDate: calendarDateRange.startDate,
    endDate: calendarDateRange.endDate,
  });

  const shiftEvents = useMemo(() => {
    if (!isFull || !userData || !allPunches?.length) return [];
    return generateDashboardShiftEvents(
      userData,
      new Date(calendarDateRange.startDate),
      new Date(calendarDateRange.endDate),
      allPunches
    );
  }, [isFull, userData, allPunches, calendarDateRange]);

  const calendarEvents = useMemo(
    () => shiftEvents.map(({ id, title, color, start, end }) => ({ id, title, color, start, end })),
    [shiftEvents]
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  useEffect(() => { setEvents(calendarEvents); }, [calendarEvents]);

  // Dashboard params — mini mode only fetches when expanded
  const dashboardParams = useMemo(() => {
    if (!currentUser?._id) return null;
    if (mode === 'mini' && !dashboardExpanded) return null;
    const params = formatDashboardParams(currentUser._id, dashboardView, currentDate, weekStartsOn || 0);
    if (isFull && isClient && selectedEmployeeId) params.selectedEmployeeId = selectedEmployeeId;
    return params;
  }, [currentUser?._id, mode, dashboardExpanded, dashboardView, currentDate, weekStartsOn, isFull, isClient, selectedEmployeeId]);

  const { data: statsData, isLoading: statsLoading } = useDashboardStats(dashboardParams, { enabled: !!dashboardParams });
  const { data: attendanceData, isLoading: attendanceLoading } = useAttendanceData(dashboardParams, { enabled: !!dashboardParams });
  const { data: performanceData, isLoading: performanceLoading } = usePerformanceMetrics(dashboardParams, { enabled: !!dashboardParams });
  const { data: insightsData, isLoading: insightsLoading } = useInsights(dashboardParams, { enabled: !!dashboardParams && isFull });

  // Computed date labels
  const weekStart = startOfWeek(currentDate, { weekStartsOn: weekStartsOn || 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: weekStartsOn || 0 });
  const weekDateLabel = `${format(weekStart, 'MMM dd')} – ${format(weekEnd, 'MMM dd')}`;
  const totalHrsLabel = statsData?.totalHours ? `${statsData.totalHours} hrs` : '0 hrs';
  const shiftsLabel = statsData?.shiftsCompleted ? `${statsData.shiftsCompleted} shifts` : '0 shifts';

  const shiftDate = (dir: 1 | -1) => {
    setCurrentDate((d) => {
      const next = new Date(d);
      if (dashboardView === 'monthly') next.setMonth(next.getMonth() + dir);
      else next.setDate(next.getDate() + 7 * dir);
      return next;
    });
  };

  // Shared date nav + view toggle UI
  const dateNavAndToggle = (compact: boolean) => (
    <div className={`flex flex-wrap items-center justify-between gap-2 ${compact ? '' : 'mb-6'}`}>
      {/* Employee filter (full mode, Client users only) */}
      {isFull && isClient && (
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Employee:</label>
          <div className="w-[180px] sm:w-[250px]">
            <ReactSelect
              value={
                employeesListLoading
                  ? null
                  : selectedEmployeeId
                  ? (() => {
                      const e = employeesList.find((emp) => emp._id === selectedEmployeeId);
                      return {
                        value: selectedEmployeeId,
                        label: e ? `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() || e.email || 'Employee' : 'Employee',
                      };
                    })()
                  : { value: 'all', label: 'All Employees' }
              }
              onChange={(opt) =>
                setSelectedEmployeeId(opt?.value === 'all' ? null : opt?.value || null)
              }
              options={[
                { value: 'all', label: 'All Employees' },
                ...employeesList.map((e) => ({
                  value: e._id,
                  label: `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() || e.email || 'Employee',
                })),
              ]}
              isSearchable
              isLoading={employeesListLoading}
              isDisabled={employeesListLoading}
              placeholder={employeesListLoading ? 'Loading employees…' : 'Search employees…'}
              classNamePrefix="react-select"
              styles={{
                control: (base) => ({ ...base, minHeight: '40px', fontSize: '14px', borderColor: '#d1d5db', '&:hover': { borderColor: '#9ca3af' } }),
                menu: (base) => ({ ...base, zIndex: 9999 }),
                option: (base, state) => ({ ...base, fontSize: '14px', backgroundColor: state.isSelected ? '#3b82f6' : state.isFocused ? '#f3f4f6' : 'white', color: state.isSelected ? 'white' : '#111827', '&:active': { backgroundColor: state.isSelected ? '#2563eb' : '#e5e7eb' } }),
              }}
              theme={(t) => ({ ...t, colors: { ...t.colors, primary: '#3b82f6', primary25: '#f3f4f6', primary50: '#e5e7eb', primary75: '#d1d5db' } })}
            />
          </div>
        </div>
      )}

      {/* Date navigation */}
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" className={compact ? 'h-7 w-7 p-0' : ''} onClick={() => shiftDate(-1)}>
          <ChevronLeft className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
        </Button>
        <span className={`font-medium text-center ${compact ? 'text-xs px-1 min-w-[120px]' : 'text-xs sm:text-sm px-1 min-w-[110px] sm:min-w-[180px]'}`}>
          {dashboardView === 'monthly'
            ? format(currentDate, 'MMMM yyyy')
            : `${weekDateLabel}, ${format(weekEnd, 'yyyy')}`}
        </span>
        <Button variant="outline" size="sm" className={compact ? 'h-7 w-7 p-0' : ''} onClick={() => shiftDate(1)}>
          <ChevronRight className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
        </Button>
      </div>

      {/* View toggle */}
      <ToggleGroup
        className="inline-flex rounded-lg border border-gray-200 p-0.5 shadow-sm"
        type="single"
        value={dashboardView}
        onValueChange={(v) => v && setDashboardView(v as typeof dashboardView)}
      >
        {(['monthly', 'weekly', 'calendar'] as const).map((v) => (
          <ToggleGroupItem
            key={v}
            value={v}
            className={clsxm(
              'rounded-md font-medium capitalize transition-all',
              compact ? 'px-2 py-1 text-xs' : 'px-2 sm:px-3 py-1.5 text-xs sm:text-sm',
              dashboardView === v
                ? 'bg-appPrimary text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            )}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Mini mode render
  // ---------------------------------------------------------------------------
  if (mode === 'mini') {
    return (
      <Card className="overflow-hidden">
        {/* Toggle button */}
        <button
          type="button"
          onClick={() => setDashboardExpanded((v) => !v)}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
        >
          <LayoutDashboard className="w-5 h-5 text-appPrimary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Dashboard</p>
            <p className="text-xs text-gray-500 truncate">
              Week of {weekDateLabel} &middot; {totalHrsLabel} &middot; {shiftsLabel}
            </p>
          </div>
          <ChevronDown
            className={clsxm(
              'w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200',
              dashboardExpanded && 'rotate-180'
            )}
          />
        </button>

        {/* Expanded content */}
        {dashboardExpanded && (
          <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-4">
            {dateNavAndToggle(true)}

            <StatsCards
              view={dashboardView}
              statsData={statsData}
              isLoading={statsLoading}
              compact
            />

            {/* Chart — full width */}
            <div className="rounded-lg border bg-white p-3">
              <p className="text-sm font-semibold text-gray-900 mb-0.5">Daily Trends</p>
              <p className="text-xs text-gray-500 mb-3">Week of {weekDateLabel}</p>
              {attendanceLoading ? (
                <div className="h-[180px] flex items-center justify-center animate-pulse">
                  <span className="text-xs text-gray-400">Loading chart…</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={attendanceData?.weeklyTrends || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="hours" stroke="#40C8FD" strokeWidth={2} dot={{ fill: '#40C8FD', r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Performance Summary — full width, no card wrapper */}
            <div className="rounded-lg border bg-white p-3">
              <p className="text-sm font-semibold text-gray-900 mb-3">Performance Summary</p>
              {performanceLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-9 rounded-lg bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {[
                    { icon: CheckCircle, label: 'On-time Rate', value: performanceData?.performanceMetrics?.onTimeRate ? `${performanceData.performanceMetrics.onTimeRate}%` : '0%', bg: 'bg-green-50', color: 'text-green-600' },
                    { icon: BarChart3, label: 'Avg Hours/Day', value: performanceData?.performanceMetrics?.avgHoursPerDay ? `${performanceData.performanceMetrics.avgHoursPerDay} hrs` : '0 hrs', bg: 'bg-blue-50', color: 'text-blue-600' },
                    { icon: AlertTriangle, label: 'Violation Rate', value: performanceData?.performanceMetrics?.violationRate ? `${performanceData.performanceMetrics.violationRate}%` : '0%', bg: 'bg-red-50', color: 'text-red-600' },
                    { icon: Users, label: 'Attendance Rate', value: performanceData?.performanceMetrics?.attendanceRate ? `${performanceData.performanceMetrics.attendanceRate}%` : '0%', bg: 'bg-green-50', color: 'text-green-600' },
                    { icon: Clock, label: 'Overtime Hours', value: performanceData?.performanceMetrics?.overtimeHours ? `${performanceData.performanceMetrics.overtimeHours} hrs` : '0 hrs', bg: 'bg-cyan-50', color: 'text-cyan-600' },
                  ].map(({ icon: Icon, label, value, bg, color }) => (
                    <div key={label} className={clsxm('flex items-center justify-between px-3 py-2 rounded-lg', bg)}>
                      <div className="flex items-center gap-2">
                        <Icon className={clsxm('w-4 h-4', color)} />
                        <span className="text-sm text-gray-700">{label}</span>
                      </div>
                      <span className={clsxm('text-sm font-semibold', color)}>{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-sm text-appPrimary font-medium hover:underline"
            >
              Open full dashboard
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </Card>
    );
  }

  // ---------------------------------------------------------------------------
  // Full mode render
  // ---------------------------------------------------------------------------
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between sm:mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        {dateNavAndToggle(false)}
      </div>

      {/* Stats */}
      <StatsCards
        view={dashboardView}
        statsData={statsData}
        isLoading={statsLoading}
        isClient={isClient}
      />

      {/* Monthly View */}
      {dashboardView === 'monthly' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="w-full lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">{format(currentDate, 'yyyy')} Attendance Trends</CardTitle>
                <CardDescription>
                  {(() => {
                    const year = currentDate.getFullYear();
                    const currentMonth = currentDate.getMonth();
                    return `Year-to-date employee attendance (${format(new Date(year, 0, 1), 'MMM')} - ${format(new Date(year, currentMonth, 1), 'MMM')})`;
                  })()}
                </CardDescription>
                <div className="flex flex-wrap gap-2 sm:gap-4 text-xs">
                  {(() => {
                    const monthly = attendanceData?.monthlyAttendance || [];
                    if (!monthly.length) return <span className="text-gray-500">No data available</span>;
                    const peak = monthly.reduce((p, c) => (p.days > c.days ? p : c));
                    const low = monthly.reduce((p, c) => (p.days < c.days ? p : c));
                    const total = monthly.reduce((s, m) => s + m.days, 0);
                    const ytd = monthly.length > 0 ? Math.round((total / (monthly.length * 22)) * 100) : 0;
                    return (
                      <>
                        <span className="text-green-600">Peak: {peak.month} ({peak.days} days)</span>
                        <span className="text-red-600">Low: {low.month} ({low.days} days)</span>
                        <span className="text-blue-600">YTD Attendance: {ytd}%</span>
                      </>
                    );
                  })()}
                </div>
              </CardHeader>
              <CardContent>
                {attendanceLoading ? (
                  <div className="flex items-center justify-center h-[300px] animate-pulse">
                    <div className="text-gray-500">Loading chart data…</div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={attendanceData?.monthlyAttendance || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="days" fill="#40C8FD" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <PerformanceSummary performanceData={performanceData?.performanceMetrics} isLoading={performanceLoading} />
          </div>
          {!isClient && <WeeklyShiftTable shiftData={performanceData?.shiftDetails} isLoading={performanceLoading} />}
          <InsightsRecommendations view="monthly" insightsData={insightsData} isLoading={insightsLoading} />
        </div>
      )}

      {/* Weekly View */}
      {dashboardView === 'weekly' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="w-full lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Daily Trends</CardTitle>
                    <CardDescription>
                      {`Week of ${format(weekStart, 'MMM dd')} - ${format(weekEnd, 'MMM dd, yyyy')}`}
                    </CardDescription>
                  </div>
                  <select className="text-sm border rounded px-3 py-1">
                    <option>Hours Worked</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-2 sm:gap-4 text-xs mt-2">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-cyan-500 shrink-0" />
                    <span className="text-gray-600">Total Break Time: 4.32 hrs</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <BarChart3 className="w-3 h-3 text-blue-500 shrink-0" />
                    <span className="text-blue-600">Productivity Score: 92%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Activity className="w-3 h-3 text-yellow-500 shrink-0" />
                    <span className="text-yellow-600">Efficiency Rating: 88%</span>
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
                    <Line type="monotone" dataKey="hours" stroke="#40C8FD" strokeWidth={3} dot={{ fill: '#40C8FD', strokeWidth: 2, r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <PerformanceSummary performanceData={performanceData?.performanceMetrics} isLoading={performanceLoading} />
          </div>
          {!isClient && <WeeklyShiftTable shiftData={performanceData?.shiftDetails} isLoading={performanceLoading} />}
          <InsightsRecommendations view="weekly" insightsData={insightsData} isLoading={insightsLoading} />
        </div>
      )}

      {/* Calendar View */}
      {dashboardView === 'calendar' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="w-full lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">{format(currentDate, 'yyyy')} Attendance Trends</CardTitle>
                <CardDescription>
                  {`Year-to-date employee attendance (Jan - ${format(currentDate, 'MMM')})`}
                </CardDescription>
                <div className="flex flex-wrap gap-2 sm:gap-4 text-xs">
                  {(() => {
                    const monthly = attendanceData?.monthlyAttendance || [];
                    if (!monthly.length) return <span className="text-gray-500">No data available</span>;
                    const peak = monthly.reduce((p, c) => (p.days > c.days ? p : c));
                    const low = monthly.reduce((p, c) => (p.days < c.days ? p : c));
                    const total = monthly.reduce((s, m) => s + m.days, 0);
                    const rate = total > 0 ? Math.round((total / (monthly.length * 22)) * 100) : 0;
                    return (
                      <>
                        <span className="text-green-600">Peak: {peak.month} ({peak.days} days)</span>
                        <span className="text-red-600">Low: {low.month} ({low.days} days)</span>
                        <span className="text-blue-600">YTD Attendance: {rate}%</span>
                      </>
                    );
                  })()}
                </div>
              </CardHeader>
              <CardContent>
                {attendanceLoading ? (
                  <div className="flex items-center justify-center h-[300px] animate-pulse">
                    <div className="text-gray-500">Loading chart data…</div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={attendanceData?.monthlyAttendance || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="days" fill="#40C8FD" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <PerformanceSummary performanceData={performanceData?.performanceMetrics} isLoading={performanceLoading} />
          </div>

          {!isClient && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Weekly Shift Details</CardTitle></CardHeader>
              <CardContent>
                {companyLoading ? (
                  <div className="flex items-center justify-center min-h-[500px]">
                    <div className="text-gray-500">Loading calendar…</div>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <CalendarProvider
                      events={events}
                      setEvents={setEvents}
                      mode={calendarMode}
                      setMode={setCalendarMode}
                      date={currentDate}
                      setDate={setCurrentDate}
                      calendarIconIsToday={false}
                      weekStartsOn={weekStartsOn || 0}
                    >
                      <Calendar hideTotalColumn />
                      <DashboardCalendarEventHandler
                        shiftEvents={shiftEvents}
                        onShiftClick={(e) => { setSelectedShift(e); setShowShiftModal(true); }}
                      />
                    </CalendarProvider>
                  </div>
                )}
                <div className="flex items-center gap-4 mt-4 text-xs">
                  {[
                    { color: 'bg-green-500', label: 'Work Day' },
                    { color: 'bg-yellow-500', label: 'Partial Day' },
                    { color: 'bg-red-500', label: 'Vacation Day' },
                    { color: 'bg-gray-300', label: 'Off Day' },
                  ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-2">
                      <div className={`w-4 h-4 ${color} rounded`} />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <InsightsRecommendations view="calendar" insightsData={insightsData} isLoading={insightsLoading} />
        </div>
      )}

      {/* Shift Details Modal */}
      <ShiftDetailsModal
        isOpen={showShiftModal}
        onClose={() => { setShowShiftModal(false); setSelectedShift(null); }}
        shiftEvent={selectedShift}
        userData={{
          _id: currentUser?._id || '',
          applicantId: currentUser?.applicantId || '',
          userType: 'User',
        }}
        onSuccess={() => {}}
      />
    </div>
  );
};
