// domains/punch/stores/punch-loading-store.ts
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export interface PunchLoadingState {
  loadedPunchesDateRange: {
    start: Date | null;
    end: Date | null;
  };
  loadedPunchesInfo: {
    start: Date | null;
    end: Date | null;
    lastFetchTimestamp: number;
    fetchCount: number;
  };

  // Actions
  setLoadedPunchesDateRange: (range: {
    start: Date | null;
    end: Date | null;
  }) => void;
  updateLoadedPunchesInfo: (
    info: Partial<PunchLoadingState["loadedPunchesInfo"]>
  ) => void;
  incrementFetchCount: () => void;
  resetFetchCount: () => void;
}

export const usePunchLoadingStore = create<PunchLoadingState>()(
  immer((set) => ({
    loadedPunchesDateRange: { start: null, end: null },
    loadedPunchesInfo: {
      start: null,
      end: null,
      lastFetchTimestamp: 0,
      fetchCount: 0,
    },

    setLoadedPunchesDateRange: (range) =>
      set((state) => {
        state.loadedPunchesDateRange = range;
      }),

    updateLoadedPunchesInfo: (info) =>
      set((state) => {
        Object.assign(state.loadedPunchesInfo, info);
      }),

    incrementFetchCount: () =>
      set((state) => {
        state.loadedPunchesInfo.fetchCount += 1;
        state.loadedPunchesInfo.lastFetchTimestamp = Date.now();
      }),

    resetFetchCount: () =>
      set((state) => {
        state.loadedPunchesInfo.fetchCount = 0;
      }),
  }))
);

// Utility function to check if we should fetch new data
export function shouldFetchNewData(start: Date, end: Date): boolean {
  const { loadedPunchesInfo } = usePunchLoadingStore.getState();
  const now = Date.now();
  const timeSinceLastFetch = now - loadedPunchesInfo.lastFetchTimestamp;
  const FETCH_COOLDOWN = 250; // quarter second cooldown

  // Always fetch if there's no data or if the date range is different
  if (
    !loadedPunchesInfo.start ||
    !loadedPunchesInfo.end ||
    start < loadedPunchesInfo.start ||
    end > loadedPunchesInfo.end
  ) {
    return true;
  }

  // If we're within the same range but it's been more than the cooldown period, fetch again
  if (timeSinceLastFetch > FETCH_COOLDOWN) {
    return true;
  }

  // If we've fetched less than 5 times in the last minute, allow the fetch
  if (loadedPunchesInfo.fetchCount < 5 && timeSinceLastFetch < FETCH_COOLDOWN) {
    return true;
  }

  return false;
}
