import { baseInstance } from '@/lib/api/instance';
import { PayrollBatch, PayrollBatchParams } from '../types';

export const payrollQueryKeys = {
  all: ['payroll'] as const,
  batches: () => [...payrollQueryKeys.all, 'batches'] as const,
  batch: (id: string) => [...payrollQueryKeys.all, 'batch', id] as const,
  batchByTimecard: (timecardId: string) =>
    [...payrollQueryKeys.all, 'batchByTimecard', timecardId] as const,
} as const;

export class PayrollService {
  static readonly ENDPOINTS = {
    GET_BATCHES: () => '/payroll/batches',
    GET_BATCH: (id: string) => `/payroll/batches/${id}`,
    CHECK_TIMECARD: (timecardId: string) =>
      `/payroll/batches/timecard/${timecardId}`,
  } as const;

  /**
   * Get all payroll batches with optional filters
   */
  static async getPayrollBatches(
    params?: PayrollBatchParams
  ): Promise<{ batches: PayrollBatch[] }> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.jobSlug) queryParams.append('jobSlug', params.jobSlug);
      if (params?.startDate) queryParams.append('startDate', params.startDate);
      if (params?.endDate) queryParams.append('endDate', params.endDate);
      if (params?.status) queryParams.append('status', params.status);
      if (params?.timecardId)
        queryParams.append('timecardId', params.timecardId);

      const response = await baseInstance.get<{ batches: PayrollBatch[] }>(
        `${this.ENDPOINTS.GET_BATCHES()}?${queryParams.toString()}`
      );

      if (!response.success || !response.data) {
        console.error('❌ No payroll batches data in response:', response);
        throw new Error('No payroll batches data received from API');
      }

      return response.data;
    } catch (error) {
      console.error('❌ getPayrollBatches API error:', error);
      throw error;
    }
  }

  /**
   * Get a single payroll batch by ID
   */
  static async getPayrollBatch(id: string): Promise<PayrollBatch> {
    try {
      const response = await baseInstance.get<PayrollBatch>(
        this.ENDPOINTS.GET_BATCH(id)
      );

      if (!response.success || !response.data) {
        console.error('❌ No payroll batch data in response:', response);
        throw new Error('No payroll batch data received from API');
      }

      return response.data;
    } catch (error) {
      console.error('❌ getPayrollBatch API error:', error);
      throw error;
    }
  }

  /**
   * Check if a specific timecard/punch is in a processed payroll batch
   */
  static async checkTimecardInProcessedBatch(timecardId: string): Promise<{
    isInProcessedBatch: boolean;
    batch?: PayrollBatch;
  }> {
    try {
      const response = await baseInstance.get<{
        isInProcessedBatch: boolean;
        batch?: PayrollBatch;
      }>(this.ENDPOINTS.CHECK_TIMECARD(timecardId));

      if (!response.success || !response.data) {
        console.error('❌ No timecard batch check data in response:', response);
        throw new Error('No timecard batch check data received from API');
      }

      return response.data;
    } catch (error) {
      console.error('❌ checkTimecardInProcessedBatch API error:', error);
      throw error;
    }
  }
}
