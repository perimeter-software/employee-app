import { baseInstance } from '@/lib/api/instance';
import type {
  PickupInterestSeekersPage,
  PickupOpportunitiesResponse,
  ShiftDaySnapshot,
  SwapRequest,
  SwapRequestType,
  WillingSwapCandidatesPage,
} from '@/domains/swap/types';

export const swapRequestQueryKeys = {
  all: ['swap-requests'] as const,
  list: (startDate?: string, endDate?: string) =>
    [...swapRequestQueryKeys.all, 'list', startDate || '', endDate || ''] as const,
  willing: (jobSlug: string, shiftSlug: string, page: number) =>
    [...swapRequestQueryKeys.all, 'willing', jobSlug, shiftSlug, page] as const,
  pickupSeekers: (jobSlug: string, shiftSlug: string, page: number) =>
    [...swapRequestQueryKeys.all, 'pickup-seekers', jobSlug, shiftSlug, page] as const,
  pickupOpportunities: (
    jobSlug: string,
    shiftSlug: string,
    startDate: string,
    endDate: string
  ) =>
    [
      ...swapRequestQueryKeys.all,
      'pickup-opportunities',
      jobSlug,
      shiftSlug,
      startDate,
      endDate,
    ] as const,
} as const;

export type CreateSwapRequestPayload = {
  jobSlug: string;
  fromShiftSlug: string;
  fromShiftDate: string;
  type: SwapRequestType;
  toEmployeeId?: string | null;
  toShiftSlug?: string | null;
  toShiftDate?: string | null;
  acceptAny?: boolean;
  taggedOnly?: boolean;
  notes?: string;
  /** Consume an open giveaway and create a linked `pickup_interest` (server). */
  matchGiveawayId?: string;
};

export type AcceptSwapRequestBody = {
  toShiftSlug?: string | null;
  toShiftDate?: string | null;
  toShiftDay?: ShiftDaySnapshot;
  notes?: string;
};

export class SwapRequestApi {
  static readonly ENDPOINT = 'swap-requests' as const;

  static async listWillingSwapCandidates(params: {
    jobSlug: string;
    shiftSlug: string;
    page?: number;
    limit?: number;
  }): Promise<WillingSwapCandidatesPage> {
    const response = await baseInstance.get<WillingSwapCandidatesPage>(
      `${this.ENDPOINT}/willing`,
      {
        params: {
          jobSlug: params.jobSlug,
          shiftSlug: params.shiftSlug,
          page: params.page ?? 1,
          limit: params.limit ?? 5,
        },
      }
    );

    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to load willing swap list');
    }
    return response.data;
  }

  static async listPickupInterestSeekers(params: {
    jobSlug: string;
    shiftSlug: string;
    page?: number;
    limit?: number;
  }): Promise<PickupInterestSeekersPage> {
    const response = await baseInstance.get<PickupInterestSeekersPage>(
      `${this.ENDPOINT}/pickup-seekers`,
      {
        params: {
          jobSlug: params.jobSlug,
          shiftSlug: params.shiftSlug,
          page: params.page ?? 1,
          limit: params.limit ?? 8,
        },
      }
    );

    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to load pickup interest list');
    }
    return response.data;
  }

  static async listPickupOpportunities(params: {
    jobSlug: string;
    shiftSlug: string;
    startDate: string;
    endDate: string;
  }): Promise<PickupOpportunitiesResponse> {
    const response = await baseInstance.get<PickupOpportunitiesResponse>(
      `${this.ENDPOINT}/pickup-opportunities`,
      {
        params: {
          jobSlug: params.jobSlug,
          shiftSlug: params.shiftSlug,
          startDate: params.startDate,
          endDate: params.endDate,
        },
      }
    );

    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to load pickup opportunities');
    }
    return response.data;
  }

  static async listSwapRequests(params?: {
    employeeId?: string;
    status?: string;
  }): Promise<SwapRequest[]> {
    const response = await baseInstance.get<SwapRequest[]>(this.ENDPOINT, {
      params: {
        ...(params?.employeeId ? { employeeId: params.employeeId } : {}),
        ...(params?.status ? { status: params.status } : {}),
      },
    });

    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to load swap requests');
    }
    return response.data;
  }

  static async createSwapRequest(
    payload: CreateSwapRequestPayload
  ): Promise<SwapRequest> {
    const response = await baseInstance.post<SwapRequest>(this.ENDPOINT, payload);
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to create swap request');
    }
    return response.data;
  }

  static async acceptSwapRequest(
    id: string,
    body: AcceptSwapRequestBody
  ): Promise<SwapRequest> {
    const response = await baseInstance.patch<SwapRequest>(
      `${this.ENDPOINT}/${encodeURIComponent(id)}/accept`,
      body
    );
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to accept swap request');
    }
    return response.data;
  }

  static async claimGiveawayRequest(id: string): Promise<SwapRequest> {
    const response = await baseInstance.patch<SwapRequest>(
      `${this.ENDPOINT}/${encodeURIComponent(id)}/claim`,
      {}
    );
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to claim this shift offer');
    }
    return response.data;
  }

  static async withdrawSwapRequest(id: string): Promise<SwapRequest> {
    const response = await baseInstance.delete<SwapRequest>(
      `${this.ENDPOINT}/${encodeURIComponent(id)}`
    );
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to withdraw swap request');
    }
    return response.data;
  }
}
