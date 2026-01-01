import { baseInstance } from '@/lib/api/instance';
import { PaycheckStub, PaycheckStubsResponse } from '../types';

export const paycheckStubQueryKeys = {
  all: ['paycheckStubs'] as const,
  lists: () => [...paycheckStubQueryKeys.all, 'list'] as const,
  list: (applicantId?: string) =>
    [...paycheckStubQueryKeys.lists(), applicantId] as const,
  details: () => [...paycheckStubQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...paycheckStubQueryKeys.details(), id] as const,
} as const;

export class PaycheckStubService {
  static readonly ENDPOINTS = {
    GET_PAYCHECK_STUBS: (applicantId: string) =>
      `/applicants/${applicantId}/paycheck-stubs`,
    GET_PRESIGNED_URL: (applicantId: string, stubId: string) =>
      `/applicants/${applicantId}/paycheck-stubs/${stubId}/generate-paycheck-presigned-url`,
    UPDATE_VIEW_STATUS: (applicantId: string, stubId: string) =>
      `/applicants/${applicantId}/paycheck-stubs/${stubId}`,
  } as const;

  /**
   * Get paycheck stubs for the current user
   */
  static async getPaycheckStubs(
    applicantId: string
  ): Promise<PaycheckStubsResponse> {
    try {
      const response = await baseInstance.get<PaycheckStub[]>(
        PaycheckStubService.ENDPOINTS.GET_PAYCHECK_STUBS(applicantId)
      );

      if (!response.success || !response.data) {
        console.error('❌ No paycheck stubs data in response:', response);
        throw new Error('No paycheck stubs data received from API');
      }

      return {
        paycheckStubs: response.data,
        count: response.data.length,
      };
    } catch (error) {
      console.error('❌ getPaycheckStubs API error:', error);
      throw error;
    }
  }

  /**
   * Get pre-signed URL for a paycheck stub PDF
   */
  static async getPresignedUrl(
    applicantId: string,
    stubId: string
  ): Promise<{ presignedUrl: string; expiresIn: number }> {
    try {
      const response = await baseInstance.get<{
        presignedUrl: string;
        expiresIn: number;
      }>(PaycheckStubService.ENDPOINTS.GET_PRESIGNED_URL(applicantId, stubId));

      if (!response.success || !response.data) {
        throw new Error('Failed to get pre-signed URL');
      }

      return response.data;
    } catch (error) {
      console.error('❌ getPresignedUrl API error:', error);
      throw error;
    }
  }

  /**
   * Update view status of a paycheck stub
   */
  static async updateViewStatus(
    applicantId: string,
    stubId: string,
    viewStatus: 'viewed' | 'unviewed'
  ): Promise<{ message: string }> {
    try {
      const response = await baseInstance.put<{ message: string }>(
        PaycheckStubService.ENDPOINTS.UPDATE_VIEW_STATUS(applicantId, stubId),
        { viewStatus }
      );

      if (!response.success || !response.data) {
        throw new Error('Failed to update view status');
      }

      return response.data;
    } catch (error) {
      console.error('❌ updateViewStatus API error:', error);
      throw error;
    }
  }
}

