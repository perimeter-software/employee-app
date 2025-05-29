// domains/shared/stores/date-store.ts
import { create } from "zustand";
import { format, parseISO } from "date-fns";
import { calculateWeek, calculateMonth, WEEK_START_DAY } from "@/lib/utils";
import type { SelectedRange } from "../types";

const now = format(new Date(), "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");

export interface DateState {
  selectedWeek: SelectedRange & { clientWeek: string[] };
  selectedMonth: SelectedRange;

  // Actions
  setSelectedWeek: (week: SelectedRange & { clientWeek: string[] }) => void;
  setSelectedMonth: (month: SelectedRange) => void;
  goToPreviousWeek: () => void;
  goToNextWeek: () => void;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  goToCurrentWeek: () => void;
  goToCurrentMonth: () => void;
}

export const useDateStore = create<DateState>((set) => ({
  selectedWeek: calculateWeek(new Date(), WEEK_START_DAY),
  selectedMonth: calculateMonth(parseISO(now)),

  setSelectedWeek: (week) => set({ selectedWeek: week }),

  setSelectedMonth: (month) => set({ selectedMonth: month }),

  goToPreviousWeek: () =>
    set((state) => {
      const currentStart = state.selectedWeek.startDate;
      const previousWeekStart = new Date(currentStart);
      previousWeekStart.setDate(currentStart.getDate() - 7);
      return { selectedWeek: calculateWeek(previousWeekStart, WEEK_START_DAY) };
    }),

  goToNextWeek: () =>
    set((state) => {
      const currentStart = state.selectedWeek.startDate;
      const nextWeekStart = new Date(currentStart);
      nextWeekStart.setDate(currentStart.getDate() + 7);
      return { selectedWeek: calculateWeek(nextWeekStart, WEEK_START_DAY) };
    }),

  goToPreviousMonth: () =>
    set((state) => {
      const currentStart = state.selectedMonth.startDate;
      const previousMonth = new Date(currentStart);
      previousMonth.setMonth(currentStart.getMonth() - 1);
      return { selectedMonth: calculateMonth(previousMonth) };
    }),

  goToNextMonth: () =>
    set((state) => {
      const currentStart = state.selectedMonth.startDate;
      const nextMonth = new Date(currentStart);
      nextMonth.setMonth(currentStart.getMonth() + 1);
      return { selectedMonth: calculateMonth(nextMonth) };
    }),

  goToCurrentWeek: () =>
    set({
      selectedWeek: calculateWeek(new Date(), WEEK_START_DAY),
    }),

  goToCurrentMonth: () =>
    set({
      selectedMonth: calculateMonth(new Date()),
    }),
}));
