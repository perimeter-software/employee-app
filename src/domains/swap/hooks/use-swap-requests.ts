import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  SwapRequestApi,
  swapRequestQueryKeys,
  type AcceptSwapRequestBody,
  type CreateSwapRequestPayload,
} from '@/domains/swap/services/swap-request-api';

const WILLING_PAGE_SIZE = 5;
const PICKUP_SEEKERS_PAGE_SIZE = 8;

const MODAL_LIST_STALE_MS = 60_000;

/**
 * Prefetch swap-modal lists so tab switches feel instant.
 * Pickup seekers are always scoped to `pickupSeekersInterestDate` (the row’s shift-day).
 * Willing swaps use the table week when `weekStart`/`weekEnd` are set.
 * Pickup opportunities are not prefetched here — that query can be heavy; it loads when the user opens the "Pick Up" tab.
 */
export function prefetchShiftSwapModalLists(
  queryClient: QueryClient,
  params: {
    jobSlug: string;
    shiftSlug: string;
    weekStart?: string;
    weekEnd?: string;
    /** YYYY-MM-DD — only `pickup_interest` rows tagged for this calendar day */
    pickupSeekersInterestDate?: string;
  }
): Promise<unknown[]> {
  const { jobSlug, shiftSlug, weekStart, weekEnd, pickupSeekersInterestDate } =
    params;
  const tasks: Promise<unknown>[] = [];

  if (weekStart && weekEnd) {
    tasks.push(
      queryClient.prefetchQuery({
        queryKey: swapRequestQueryKeys.willing(
          jobSlug,
          shiftSlug,
          1,
          weekStart,
          weekEnd
        ),
        queryFn: () =>
          SwapRequestApi.listWillingSwapCandidates({
            jobSlug,
            shiftSlug,
            page: 1,
            limit: WILLING_PAGE_SIZE,
            startDate: weekStart,
            endDate: weekEnd,
          }),
        staleTime: MODAL_LIST_STALE_MS,
      })
    );
  }

  const seekersDay = pickupSeekersInterestDate?.trim();
  if (seekersDay) {
    tasks.push(
      queryClient.prefetchQuery({
        queryKey: swapRequestQueryKeys.pickupSeekers(
          jobSlug,
          shiftSlug,
          1,
          seekersDay,
          seekersDay
        ),
        queryFn: () =>
          SwapRequestApi.listPickupInterestSeekers({
            jobSlug,
            shiftSlug,
            page: 1,
            limit: PICKUP_SEEKERS_PAGE_SIZE,
            startDate: seekersDay,
            endDate: seekersDay,
          }),
        staleTime: MODAL_LIST_STALE_MS,
      })
    );
  }

  if (tasks.length === 0) {
    return Promise.resolve([]);
  }
  return Promise.all(tasks);
}

export function useWillingSwapCandidatesQuery(params: {
  jobSlug: string;
  shiftSlug: string;
  page: number;
  startDate?: string;
  endDate?: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: swapRequestQueryKeys.willing(
      params.jobSlug,
      params.shiftSlug,
      params.page,
      params.startDate ?? '',
      params.endDate ?? ''
    ),
    queryFn: () =>
      SwapRequestApi.listWillingSwapCandidates({
        jobSlug: params.jobSlug,
        shiftSlug: params.shiftSlug,
        page: params.page,
        limit: WILLING_PAGE_SIZE,
        ...(params.startDate ? { startDate: params.startDate } : {}),
        ...(params.endDate ? { endDate: params.endDate } : {}),
      }),
    enabled:
      Boolean(
        params.enabled &&
          params.jobSlug &&
          params.shiftSlug &&
          params.startDate &&
          params.endDate
      ) && params.page >= 1,
    staleTime: MODAL_LIST_STALE_MS,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

/** `interestShiftDate` — YYYY-MM-DD; list is restricted to pickup_interest for that day only. */
export function usePickupInterestSeekersQuery(params: {
  jobSlug: string;
  shiftSlug: string;
  page: number;
  interestShiftDate?: string;
  enabled?: boolean;
}) {
  const day = params.interestShiftDate?.trim() ?? '';
  return useQuery({
    queryKey: swapRequestQueryKeys.pickupSeekers(
      params.jobSlug,
      params.shiftSlug,
      params.page,
      day,
      day
    ),
    queryFn: () =>
      SwapRequestApi.listPickupInterestSeekers({
        jobSlug: params.jobSlug,
        shiftSlug: params.shiftSlug,
        page: params.page,
        limit: PICKUP_SEEKERS_PAGE_SIZE,
        startDate: day,
        endDate: day,
      }),
    enabled:
      Boolean(
        params.enabled && params.jobSlug && params.shiftSlug && day
      ) && params.page >= 1,
    staleTime: MODAL_LIST_STALE_MS,
    placeholderData: (previousData) => previousData,
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
    staleTime: MODAL_LIST_STALE_MS,
    placeholderData: (previousData) => previousData,
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
