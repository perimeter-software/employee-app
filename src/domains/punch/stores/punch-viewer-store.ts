// domains/punch/stores/punch-viewer-store.ts
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { PunchWithJobInfo } from '../types';
import { Shift } from '@/domains/job/types/job.types';
import { GignologyJob } from '@/domains/job';

export interface PunchViewerState {
  allPunches: PunchWithJobInfo[];
  queue: PunchWithJobInfo[];
  current: PunchWithJobInfo | null;
  selectedJob: GignologyJob | null;
  selectedShift: Shift | null;
  isViewerOpen: boolean;
  fromDashboard: boolean;
  lastUpdated: number; // Track when the store was last updated

  // Actions
  setPunches: (punches: PunchWithJobInfo[]) => void;
  addPunch: (punch: PunchWithJobInfo) => void;
  removeCurrentPunch: () => void;
  setSelectedJob: (job: GignologyJob) => void;
  removeSelectedJob: () => void;
  setSelectedShift: (shift: Shift) => void;
  removeSelectedShift: () => void;
  updatePunch: (_id: string, updatedPunch: Partial<PunchWithJobInfo>) => void;
  removePunch: (_id: string) => void;
  next: () => void;
  closeViewer: () => void;
  openViewer: () => void;
  clear: () => void;
  initializeFromServerData: (
    openPunches: PunchWithJobInfo[],
    userData: { jobs?: GignologyJob[] }
  ) => void;
}

export const usePunchViewerStore = create<PunchViewerState>()(
  subscribeWithSelector(
    immer((set) => ({
      allPunches: [],
      queue: [],
      current: null,
      selectedJob: null,
      selectedShift: null,
      isViewerOpen: false,
      fromDashboard: false,
      lastUpdated: Date.now(), // Track when the store was last updated

      setPunches: (punches) =>
        set((state) => {
          state.allPunches = punches;
          state.queue = punches;
          state.current = punches.length > 0 ? punches[0] : null;
          state.isViewerOpen = punches.length > 0;
          state.fromDashboard = true;
          state.lastUpdated = Date.now();
        }),

      addPunch: (punch) =>
        set((state) => {
          state.allPunches.push(punch);
          state.queue.push(punch);
          if (!state.current) state.current = punch;
          state.isViewerOpen = true;
          state.fromDashboard = false;
          state.lastUpdated = Date.now();
        }),

      removeCurrentPunch: () =>
        set((state) => {
          state.current = null;
          state.lastUpdated = Date.now();
        }),

      setSelectedJob: (job) =>
        set((state) => {
          state.selectedJob = job;
          state.lastUpdated = Date.now();
        }),

      removeSelectedJob: () =>
        set((state) => {
          state.selectedJob = null;
          state.lastUpdated = Date.now();
        }),

      setSelectedShift: (shift) =>
        set((state) => {
          state.selectedShift = shift;
          state.lastUpdated = Date.now();
        }),

      removeSelectedShift: () =>
        set((state) => {
          state.selectedShift = null;
          state.lastUpdated = Date.now();
        }),

      updatePunch: (_id, updatedPunch) =>
        set((state) => {
          const updateInArray = (arr: PunchWithJobInfo[]) => {
            const index = arr.findIndex((p) => p._id === _id);
            if (index !== -1) Object.assign(arr[index], updatedPunch);
          };

          updateInArray(state.allPunches);
          updateInArray(state.queue);

          if (state.current?._id === _id) {
            Object.assign(state.current, updatedPunch);
          }
          state.lastUpdated = Date.now();
        }),

      removePunch: (_id) =>
        set((state) => {
          state.allPunches = state.allPunches.filter(
            (p: PunchWithJobInfo) => p._id !== _id
          );
          state.queue = state.queue.filter(
            (p: PunchWithJobInfo) => p._id !== _id
          );

          if (state.current?._id === _id) {
            state.current = state.queue.length > 0 ? state.queue[0] : null;
          }

          state.isViewerOpen = state.queue.length > 0;
          state.fromDashboard = false;
          state.lastUpdated = Date.now();
        }),

      next: () =>
        set((state) => {
          if (state.queue.length > 1) {
            state.queue.shift();
            state.current = state.queue[0];
            state.isViewerOpen = true;
            state.fromDashboard = false;
          } else {
            state.queue = [];
            state.current = null;
            state.isViewerOpen = false;
            state.fromDashboard = false;
          }
          state.lastUpdated = Date.now();
        }),

      closeViewer: () =>
        set((state) => {
          state.isViewerOpen = false;
          state.fromDashboard = false;
          state.lastUpdated = Date.now();
        }),

      openViewer: () =>
        set((state) => {
          state.isViewerOpen = true;
          if (!state.current && state.queue.length > 0) {
            state.current = state.queue[0];
          }
          state.lastUpdated = Date.now();
        }),

      clear: () =>
        set(() => ({
          allPunches: [],
          queue: [],
          current: null,
          selectedJob: null,
          selectedShift: null,
          isViewerOpen: false,
          fromDashboard: false,
          lastUpdated: Date.now(),
        })),

      // NEW: Initialize from server data
      initializeFromServerData: (openPunches, userData) =>
        set((state) => {
          const currentOpenPunch = openPunches.find((punch) => !punch.timeOut);

          if (currentOpenPunch && userData.jobs) {
            // Find the job for the open punch
            const punchJob = userData.jobs.find(
              (job: GignologyJob) => job._id === currentOpenPunch.jobId
            );

            if (punchJob) {
              state.selectedJob = punchJob;

              // Find the shift for the open punch
              if (currentOpenPunch.shiftSlug && punchJob.shifts) {
                const punchShift = punchJob.shifts.find(
                  (shift: Shift) => shift.slug === currentOpenPunch.shiftSlug
                );
                if (punchShift) {
                  state.selectedShift = punchShift;
                }
              }
            }
          }

          state.allPunches = openPunches;
          state.current = currentOpenPunch || null;
          state.lastUpdated = Date.now();
        }),
    }))
  )
);
