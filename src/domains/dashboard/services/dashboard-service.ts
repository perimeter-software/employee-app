import { baseInstance } from '@/lib/api/instance';
import { DashboardData, DashboardParams } from '../types';

export const dashboardQueryKeys = {
  all: ['dashboard'] as const,
  data: (params: DashboardParams) =>
    [...dashboardQueryKeys.all, 'data', params] as const,
  stats: (userId: string, view: string) =>
    [...dashboardQueryKeys.all, 'stats', userId, view] as const,
  attendance: (userId: string) =>
    [...dashboardQueryKeys.all, 'attendance', userId] as const,
  performance: (userId: string) =>
    [...dashboardQueryKeys.all, 'performance', userId] as const,
  insights: (userId: string, view: string) =>
    [...dashboardQueryKeys.all, 'insights', userId, view] as const,
} as const;

export class DashboardApiService {
  static readonly ENDPOINTS = {
    GET_DASHBOARD_DATA: () => `/dashboard`,
    GET_DASHBOARD_STATS: () => `/dashboard/stats`,
    GET_ATTENDANCE_DATA: () => `/dashboard/attendance`,
    GET_PERFORMANCE_METRICS: () => `/dashboard/performance`,
    GET_INSIGHTS: () => `/dashboard/insights`,
    GET_TODAY_ATTENDANCE: () => `/dashboard/today-attendance`,
  } as const;

  /**
   * Get comprehensive dashboard data
   */
  static async getDashboardData(
    params: DashboardParams
  ): Promise<DashboardData> {
    try {
      const response = await baseInstance.post<DashboardData>(
        DashboardApiService.ENDPOINTS.GET_DASHBOARD_DATA(),
        params
      );

      if (!response.success || !response.data) {
        console.error('❌ No dashboard data in response:', response);
        throw new Error('No dashboard data received from API');
      }

      return response.data;
    } catch (error) {
      console.error('❌ getDashboardData API error:', error);
      throw error;
    }
  }

  /**
   * Get dashboard statistics
   */
  static async getDashboardStats(
    params: Pick<DashboardParams, 'userId' | 'view' | 'startDate' | 'endDate'>
  ): Promise<DashboardData['stats']> {
    try {
      const response = await baseInstance.post<DashboardData['stats']>(
        DashboardApiService.ENDPOINTS.GET_DASHBOARD_STATS(),
        params
      );

      if (!response.success || !response.data) {
        console.error('❌ No stats data in response:', response);
        throw new Error('No stats data received from API');
      }

      return response.data;
    } catch (error) {
      console.error('❌ getDashboardStats API error:', error);
      throw error;
    }
  }

  /**
   * Get attendance data for charts
   */
  static async getAttendanceData(
    params: Pick<DashboardParams, 'userId' | 'view' | 'startDate' | 'endDate'>
  ): Promise<{
    monthlyAttendance: DashboardData['monthlyAttendance'];
    weeklyTrends: DashboardData['weeklyTrends'];
  }> {
    try {
      const response = await baseInstance.post<{
        monthlyAttendance: DashboardData['monthlyAttendance'];
        weeklyTrends: DashboardData['weeklyTrends'];
      }>(DashboardApiService.ENDPOINTS.GET_ATTENDANCE_DATA(), params);

      if (!response.success || !response.data) {
        console.error('❌ No attendance data in response:', response);
        throw new Error('No attendance data received from API');
      }

      return response.data;
    } catch (error) {
      console.error('❌ getAttendanceData API error:', error);
      throw error;
    }
  }

  /**
   * Get performance metrics
   */
  static async getPerformanceMetrics(
    params: Pick<DashboardParams, 'userId' | 'startDate' | 'endDate'>
  ): Promise<{
    performanceMetrics: DashboardData['performanceMetrics'];
    shiftDetails: DashboardData['shiftDetails'];
  }> {
    try {
      const response = await baseInstance.post<{
        performanceMetrics: DashboardData['performanceMetrics'];
        shiftDetails: DashboardData['shiftDetails'];
      }>(DashboardApiService.ENDPOINTS.GET_PERFORMANCE_METRICS(), params);

      if (!response.success || !response.data) {
        console.error('❌ No performance data in response:', response);
        throw new Error('No performance data received from API');
      }

      return response.data;
    } catch (error) {
      console.error('❌ getPerformanceMetrics API error:', error);
      throw error;
    }
  }

  /**
   * Get insights and recommendations
   */
  static async getInsights(
    params: Pick<DashboardParams, 'userId' | 'view'>
  ): Promise<DashboardData['insights']> {
    try {
      const response = await baseInstance.post<DashboardData['insights']>(
        DashboardApiService.ENDPOINTS.GET_INSIGHTS(),
        params
      );

      if (!response.success || !response.data) {
        console.error('❌ No insights data in response:', response);
        throw new Error('No insights data received from API');
      }

      return response.data;
    } catch (error) {
      console.error('❌ getInsights API error:', error);
      throw error;
    }
  }

  /**
   * Get today's attendance data
   */
  static async getTodayAttendance(): Promise<DashboardData['todayAttendance']> {
    try {
      const response = await baseInstance.get<DashboardData['todayAttendance']>(
        DashboardApiService.ENDPOINTS.GET_TODAY_ATTENDANCE()
      );

      if (!response.success || !response.data) {
        console.error('❌ No today attendance data in response:', response);
        throw new Error('No today attendance data received from API');
      }

      return response.data;
    } catch (error) {
      console.error('❌ getTodayAttendance API error:', error);
      throw error;
    }
  }
}
