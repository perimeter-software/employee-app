import { useDateStore } from "../stores";
import { useMemo } from "react";
import { format, isSameWeek, isSameMonth } from "date-fns";

export function useDateNavigation() {
  const {
    selectedWeek,
    selectedMonth,
    goToPreviousWeek,
    goToNextWeek,
    goToPreviousMonth,
    goToNextMonth,
    goToCurrentWeek,
    goToCurrentMonth,
  } = useDateStore();

  return useMemo(
    () => ({
      // Week navigation
      selectedWeek,
      goToPreviousWeek,
      goToNextWeek,
      goToCurrentWeek,
      isCurrentWeek: isSameWeek(selectedWeek.startDate, new Date()),
      weekLabel: `${format(selectedWeek.startDate, "MMM d")} - ${format(
        selectedWeek.endDate,
        "MMM d, yyyy"
      )}`,

      // Month navigation
      selectedMonth,
      goToPreviousMonth,
      goToNextMonth,
      goToCurrentMonth,
      isCurrentMonth: isSameMonth(selectedMonth.startDate, new Date()),
      monthLabel: format(selectedMonth.startDate, "MMMM yyyy"),

      // Date range utilities
      dateRange: {
        week: selectedWeek,
        month: selectedMonth,
      },
    }),
    [
      selectedWeek,
      selectedMonth,
      goToPreviousWeek,
      goToNextWeek,
      goToPreviousMonth,
      goToNextMonth,
      goToCurrentWeek,
      goToCurrentMonth,
    ]
  );
}
