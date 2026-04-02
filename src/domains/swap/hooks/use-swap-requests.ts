import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  SwapRequestApi,
  swapRequestQueryKeys,
  type AcceptSwapRequestBody,
  type CreateSwapRequestPayload,
} from '@/domains/swap/services/swap-request-api';

const WILLING_PAGE_SIZE = 5;
const PICKUP_SEEKERS_PAGE_SIZE = 8;

export function useWillingSwapCandidatesQuery(params: {
  jobSlug: string;
  shiftSlug: string;
  page: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: swapRequestQueryKeys.willing(
      params.jobSlug,
      params.shiftSlug,
      params.page
    ),
    queryFn: () =>
      SwapRequestApi.listWillingSwapCandidates({
        jobSlug: params.jobSlug,
        shiftSlug: params.shiftSlug,
        page: params.page,
        limit: WILLING_PAGE_SIZE,
      }),
    enabled:
      Boolean(params.enabled && params.jobSlug && params.shiftSlug) &&
      params.page >= 1,
    staleTime: 20_000,
  });
}

export function usePickupInterestSeekersQuery(params: {
  jobSlug: string;
  shiftSlug: string;
  page: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: swapRequestQueryKeys.pickupSeekers(
      params.jobSlug,
      params.shiftSlug,
      params.page
    ),
    queryFn: () =>
      SwapRequestApi.listPickupInterestSeekers({
        jobSlug: params.jobSlug,
        shiftSlug: params.shiftSlug,
        page: params.page,
        limit: PICKUP_SEEKERS_PAGE_SIZE,
      }),
    enabled:
      Boolean(params.enabled && params.jobSlug && params.shiftSlug) &&
      params.page >= 1,
    staleTime: 20_000,
  });
}

export function usePickupOpportunitiesQuery(params: {
  jobSlug: string;
  shiftSlug: string;
  startDate: string;
  endDate: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: swapRequestQueryKeys.pickupOpportunities(
      params.jobSlug,
      params.shiftSlug,
      params.startDate,
      params.endDate
    ),
    queryFn: () =>
      SwapRequestApi.listPickupOpportunities({
        jobSlug: params.jobSlug,
        shiftSlug: params.shiftSlug,
        startDate: params.startDate,
        endDate: params.endDate,
      }),
    enabled: Boolean(
      params.enabled &&
        params.jobSlug &&
        params.shiftSlug &&
        params.startDate &&
        params.endDate
    ),
    staleTime: 20_000,
  });
}

export function useSwapRequestsQuery(params?: {
  employeeId?: string;
  startDate?: string;
  endDate?: string;
}) {
  return useQuery({
    queryKey: swapRequestQueryKeys.list(params?.startDate, params?.endDate),
    queryFn: async () => {
      const rows = await SwapRequestApi.listSwapRequests({
        employeeId: params?.employeeId,
      });
      if (!params?.startDate || !params?.endDate) return rows;
      const startMs = Date.parse(params.startDate);
      const endMs = Date.parse(params.endDate);
      return rows.filter((r) => {
        const fromYmd =
          r.fromShiftDate ||
          (r as { fromShiftDay?: { date?: string } }).fromShiftDay?.date;
        const toYmd = r.toShiftDate ?? undefined;
        const dates = [fromYmd, toYmd].filter(
          (x): x is string => typeof x === 'string' && x.length > 0
        );
        if (dates.length === 0) return true;
        return dates.some((ymd) => {
          const d = Date.parse(`${ymd}T00:00:00.000Z`);
          if (Number.isNaN(d)) return true;
          return d >= startMs && d <= endMs;
        });
      });
    },
    staleTime: 30_000,
  });
}

export function useCreateSwapRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateSwapRequestPayload) =>
      SwapRequestApi.createSwapRequest(payload),
    onSuccess: async () => {
      toast.success('Swap request submitted');
      await queryClient.invalidateQueries({ queryKey: swapRequestQueryKeys.all });
    },
    onError: (error: Error) => {
      toast.error('Could not submit swap request', {
        description: error.message || 'Please try again.',
      });
    },
  });
}

export function useAcceptSwapRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: AcceptSwapRequestBody }) =>
      SwapRequestApi.acceptSwapRequest(args.id, args.body),
    onSuccess: async () => {
      toast.success('Swap matched — pending admin approval');
      await queryClient.invalidateQueries({ queryKey: swapRequestQueryKeys.all });
    },
    onError: (error: Error) => {
      toast.error('Could not match swap', {
        description: error.message || 'Please try again.',
      });
    },
  });
}

export function useClaimGiveawayMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => SwapRequestApi.claimGiveawayRequest(id),
    onSuccess: async () => {
      toast.success('Offer accepted — pending admin approval');
      await queryClient.invalidateQueries({ queryKey: swapRequestQueryKeys.all });
    },
    onError: (error: Error) => {
      toast.error('Could not complete pickup', {
        description: error.message || 'Please try again.',
      });
    },
  });
}

export function useWithdrawSwapRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => SwapRequestApi.withdrawSwapRequest(id),
    onSuccess: async () => {
      toast.success('Swap request removed');
      await queryClient.invalidateQueries({ queryKey: swapRequestQueryKeys.all });
    },
    onError: (error: Error) => {
      toast.error('Could not remove request', {
        description: error.message || 'Please try again.',
      });
    },
  });
}
