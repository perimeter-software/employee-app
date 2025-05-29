// domains/user/stores/user-store.ts
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { UserNoPassword } from "../types";
import { Punch, LeaveRequest } from "@/domains/punch/types";

const defaultUser: UserNoPassword = {
  _id: "",
  status: "",
  applicantId: "",
  firstName: "",
  lastName: "",
  emailAddress: "",
  userType: "User",
  employeeType: "",
  userId: "",
  profileImg: "",
  accrualRate: "",
  ptoBalance: 0,
  jobs: [],
  leaveRequests: [],
};

export interface UserState {
  user: UserNoPassword;
  isLoading: boolean;
  error: string | null;

  // Actions
  setUser: (user: UserNoPassword) => void;
  updateUser: (updates: Partial<UserNoPassword>) => void;
  addPunches: (jobId: string, punchesInput: Punch | Punch[]) => void;
  updatePunch: (jobId: string, updatedPunchData: Partial<Punch>) => void;
  removePunch: (jobId: string, punchId: string) => void;
  addLeaveRequests: (leaveRequests: LeaveRequest[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useUserStore = create<UserState>()(
  subscribeWithSelector(
    immer((set) => ({
      user: defaultUser,
      isLoading: false,
      error: null,

      setUser: (user) => set({ user, error: null }),

      updateUser: (updates) =>
        set((state) => {
          Object.assign(state.user, updates);
          state.error = null;
        }),

      addPunches: (jobId, punchesInput) =>
        set((state) => {
          const job = state.user.jobs.find(
            (j: { _id: string }) => j._id === jobId
          );
          if (job) {
            const newPunches = Array.isArray(punchesInput)
              ? punchesInput
              : [punchesInput];
            if (!Array.isArray(job.punches)) {
              job.punches = [];
            }
            job.punches.push(...newPunches);
          }
        }),

      updatePunch: (jobId, updatedPunchData) =>
        set((state) => {
          const job = state.user.jobs.find(
            (j: { _id: string }) => j._id === jobId
          );
          if (job?.punches) {
            const punchIndex = job.punches.findIndex(
              (p: Punch) => p._id === updatedPunchData._id
            );
            if (punchIndex !== -1) {
              Object.assign(job.punches[punchIndex], updatedPunchData);
            }
          }
        }),

      removePunch: (jobId, punchId) =>
        set((state) => {
          const job = state.user.jobs.find(
            (j: { _id: string }) => j._id === jobId
          );
          if (job?.punches) {
            job.punches = job.punches.filter((p: Punch) => p._id !== punchId);
          }
        }),

      addLeaveRequests: (leaveRequests) =>
        set((state) => {
          state.user.leaveRequests.push(...leaveRequests);
        }),

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error }),

      reset: () =>
        set({
          user: { ...defaultUser },
          isLoading: false,
          error: null,
        }),
    }))
  )
);

// Helper function for external use
export function getCurrentUser(): UserNoPassword {
  return useUserStore.getState().user;
}
