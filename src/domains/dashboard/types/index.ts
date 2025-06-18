// Dashboard types for the employee dashboard

export interface DashboardStats {
  totalHours: number;
  shiftsCompleted: number;
  absences: number;
  geofenceViolations: number;
  weeklyChange?: {
    hours: number;
    shifts: number;
    absences: number;
    violations: number;
  };
}

export interface MonthlyAttendanceData {
  month: string;
  days: number;
  previous: number;
}

export interface WeeklyTrendsData {
  day: string;
  hours: number;
}

export interface PerformanceMetrics {
  onTimeRate: number;
  avgHoursPerDay: number;
  violationRate: number;
  attendanceRate: number;
  overtimeHours: number;
}

export interface ShiftTableData {
  date: string;
  jobSite: string;
  timeRange: string;
  punches: number;
  totalHours: string;
  location: string;
  status: string;
  statusColor: string;
  locationColor?: string;
}

export interface TodayAttendanceData {
  name: string;
  time: string;
  hours: string;
  avatar: string;
  isCheckedIn: boolean;
}

export interface InsightData {
  title: string;
  description: string;
  type: 'productivity' | 'alert' | 'goal' | 'schedule';
  priority: 'high' | 'medium' | 'low';
}

export interface DashboardData {
  stats: DashboardStats;
  monthlyAttendance: MonthlyAttendanceData[];
  weeklyTrends: WeeklyTrendsData[];
  performanceMetrics: PerformanceMetrics;
  shiftDetails: ShiftTableData[];
  todayAttendance: TodayAttendanceData[];
  insights: InsightData[];
}

export interface DashboardParams {
  view: 'monthly' | 'weekly' | 'calendar';
  startDate?: string;
  endDate?: string;
  userId: string;
}

export interface DashboardResponse {
  data: DashboardData;
  success: boolean;
  message?: string;
}
