// domains/punch/stores/punch-viewer-store.ts
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { PunchWithJobInfo } from "../types";
import { Shift } from "@/domains/job/types/job.types";
import { GignologyJob } from "@/domains/job";

export interface PunchViewerState {
  allPunches: PunchWithJobInfo[];
  queue: PunchWithJobInfo[];
  current: PunchWithJobInfo | null;
  selectedJob: GignologyJob | null;
  selectedShift: Shift | null;
  isViewerOpen: boolean;
  fromDashboard: boolean;

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

      setPunches: (punches) =>
        set((state) => {
          state.allPunches = punches;
          state.queue = punches;
          state.current = punches.length > 0 ? punches[0] : null;
          state.isViewerOpen = punches.length > 0;
          state.fromDashboard = true;
        }),

      addPunch: (punch) =>
        set((state) => {
          state.allPunches.push(punch);
          state.queue.push(punch);
          if (!state.current) state.current = punch;
          state.isViewerOpen = true;
          state.fromDashboard = false;
        }),

      removeCurrentPunch: () =>
        set((state) => {
          state.current = null;
        }),

      setSelectedJob: (job) =>
        set((state) => {
          state.selectedJob = job;
        }),

      removeSelectedJob: () =>
        set((state) => {
          state.selectedJob = null;
        }),

      setSelectedShift: (shift) =>
        set((state) => {
          state.selectedShift = shift;
        }),

      removeSelectedShift: () =>
        set((state) => {
          state.selectedShift = null;
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
        }),

      closeViewer: () =>
        set((state) => {
          state.isViewerOpen = false;
          state.fromDashboard = false;
        }),

      openViewer: () =>
        set((state) => {
          state.isViewerOpen = true;
          if (!state.current && state.queue.length > 0) {
            state.current = state.queue[0];
          }
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
        })),
    }))
  )
);
