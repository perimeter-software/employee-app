import { baseInstance } from '@/lib/api/instance';

export type CallOffShiftParams = {
  jobId: string;
  shiftSlug: string;
  date: string;
  dayKey: string;
  /** Required reason for calling off (e.g. illness, emergency). */
  reason: string;
};

export type CallOffShiftResponse =
  | { success: true; message: string }
  | { success?: false; error: string; message: string };

/** Service for calling off an approved date-specific shift. Uses PATCH /api/shift-requests. */
export class CallOffService {
  static readonly ENDPOINT = 'shift-requests' as const;

  /**
   * Call off an approved date-specific shift.
   * Calls PATCH /api/shift-requests with jobId, shiftSlug, date, dayKey.
   */
  static async callOffShift(
    params: CallOffShiftParams
  ): Promise<CallOffShiftResponse> {
    try {
      const body = {
        jobId: params.jobId,
        shiftSlug: params.shiftSlug,
        date: params.date,
        dayKey: params.dayKey,
        reason: params.reason.trim(),
      };

      const response = await baseInstance.patch<{ message?: string }>(
        CallOffService.ENDPOINT,
        body
      );

      if (!response.success) {
        throw new Error(
          response.message || 'Failed to call off shift'
        );
      }

      return {
        success: true,
        message: response.message ?? 'Shift called off successfully.',
      };
    } catch (error) {
      console.error('❌ callOffShift API error:', error);
      throw error;
    }
  }
}

/**
 * Call off an approved date-specific shift.
 * Calls PATCH /api/shift-requests with jobId, shiftSlug, date, dayKey.
 */
export async function callOffShift(
  params: CallOffShiftParams
): Promise<CallOffShiftResponse> {
  return CallOffService.callOffShift(params);
}
