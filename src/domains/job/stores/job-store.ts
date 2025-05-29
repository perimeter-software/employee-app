// domains/job/stores/job-store.ts
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { GignologyJob, Shift } from "../types";

export interface JobState {
  jobs: GignologyJob[];
  activeJobs: GignologyJob[];
  selectedJob: GignologyJob | null;
  selectedShift: Shift | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setJobs: (jobs: GignologyJob[]) => void;
  setActiveJobs: (jobs: GignologyJob[]) => void;
  addJob: (job: GignologyJob) => void;
  updateJob: (id: string, updates: Partial<GignologyJob>) => void;
  removeJob: (id: string) => void;
  setSelectedJob: (job: GignologyJob | null) => void;
  setSelectedShift: (shift: Shift | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearSelections: () => void;
  reset: () => void;
}

export const useJobStore = create<JobState>()(
  subscribeWithSelector(
    immer((set) => ({
      jobs: [],
      activeJobs: [],
      selectedJob: null,
      selectedShift: null,
      isLoading: false,
      error: null,

      setJobs: (jobs) =>
        set((state) => {
          state.jobs = jobs;
          state.error = null;
        }),

      setActiveJobs: (jobs) =>
        set((state) => {
          state.activeJobs = jobs;
          state.error = null;
        }),

      addJob: (job) =>
        set((state) => {
          state.jobs.push(job);

          // Add to active jobs if it's active
          if (job.status === "active") {
            state.activeJobs.push(job);
          }
        }),

      updateJob: (id, updates) =>
        set((state) => {
          // Update in main jobs array
          const jobIndex = state.jobs.findIndex(
            (j: GignologyJob) => j._id === id
          );
          if (jobIndex !== -1) {
            Object.assign(state.jobs[jobIndex], updates);
          }

          // Update in active jobs array
          const activeJobIndex = state.activeJobs.findIndex(
            (j: GignologyJob) => j._id === id
          );
          if (activeJobIndex !== -1) {
            Object.assign(state.activeJobs[activeJobIndex], updates);

            // Remove from active jobs if status changed to inactive
            if (updates.status && updates.status !== "active") {
              state.activeJobs.splice(activeJobIndex, 1);
            }
          } else if (updates.status === "active") {
            // Add to active jobs if status changed to active
            const updatedJob = state.jobs.find(
              (j: GignologyJob) => j._id === id
            );
            if (updatedJob) {
              state.activeJobs.push(updatedJob);
            }
          }

          // Update selected job if it's the same one
          if (state.selectedJob?._id === id) {
            Object.assign(state.selectedJob, updates);
          }
        }),

      removeJob: (id) =>
        set((state) => {
          state.jobs = state.jobs.filter((j: GignologyJob) => j._id !== id);
          state.activeJobs = state.activeJobs.filter(
            (j: GignologyJob) => j._id !== id
          );

          // Clear selected job if it was removed
          if (state.selectedJob?._id === id) {
            state.selectedJob = null;
          }
        }),

      setSelectedJob: (job) =>
        set((state) => {
          state.selectedJob = job;
        }),

      setSelectedShift: (shift) =>
        set((state) => {
          state.selectedShift = shift;
        }),

      setLoading: (loading) =>
        set((state) => {
          state.isLoading = loading;
        }),

      setError: (error) =>
        set((state) => {
          state.error = error;
        }),

      clearSelections: () =>
        set((state) => {
          state.selectedJob = null;
          state.selectedShift = null;
        }),

      reset: () =>
        set((state) => {
          state.jobs = [];
          state.activeJobs = [];
          state.selectedJob = null;
          state.selectedShift = null;
          state.isLoading = false;
          state.error = null;
        }),
    }))
  )
);
