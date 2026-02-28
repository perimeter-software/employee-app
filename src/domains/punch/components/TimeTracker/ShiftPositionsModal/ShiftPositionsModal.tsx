import React, { useState, useMemo } from 'react';
import { format, parse, parseISO } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/ToggleGroup';
import type { Shift } from '@/domains/job/types/job.types';
import type { RosterApplicant, RosterEntry } from '@/domains/job/types/schedule.types';
import type { Applicant } from '@/domains/user/types/applicant.types';

/** Parse a time string (ISO, HH:mm, or HH:mm:ss) and format as US human-readable (e.g. "9:00 AM") */
function formatTimeSlotPart(timeStr: string): string {
  if (!timeStr?.trim()) return '—';
  const trimmed = timeStr.trim();
  const asDate = new Date(trimmed);
  if (!Number.isNaN(asDate.getTime())) {
    return format(asDate, 'h:mm a');
  }
  const ref = new Date(0);
  try {
    const parsed = trimmed.length > 5 ? parse(trimmed, 'HH:mm:ss', ref) : parse(trimmed, 'HH:mm', ref);
    return format(parsed, 'h:mm a');
  } catch {
    return trimmed;
  }
}

function formatTimeSlot(start: string, end: string): string {
  if (!start?.trim() && !end?.trim()) return '—';
  const startFormatted = formatTimeSlotPart(start || '');
  const endFormatted = formatTimeSlotPart(end || '');
  if (startFormatted === '—' && endFormatted === '—') return '—';
  if (startFormatted === '—' || endFormatted === '—') return startFormatted !== '—' ? startFormatted : endFormatted;
  return `${startFormatted} – ${endFormatted}`;
}

interface ShiftPositionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  shift: Shift | null;
  dateDetails: Record<string, { filled: number; unassigned?: number; totalRequested: number }>;
  shiftRoster: (RosterApplicant | Applicant)[];
  /** When set, only show positions for dates within this range (ISO strings) */
  dateRangeStart?: string;
  dateRangeEnd?: string;
}

type ViewMode = 'by-date' | 'all-employees';

export function ShiftPositionsModal({
  isOpen,
  onClose,
  shift,
  dateDetails,
  shiftRoster,
  dateRangeStart,
  dateRangeEnd,
}: ShiftPositionsModalProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('by-date');

  // Compare date keys (yyyy-MM-dd) so timezone doesn't exclude days at range boundaries
  const isDateInRange = useMemo(() => {
    if (!dateRangeStart || !dateRangeEnd) return () => true;
    const rangeStartKey = format(parseISO(dateRangeStart), 'yyyy-MM-dd');
    const rangeEndKey = format(parseISO(dateRangeEnd), 'yyyy-MM-dd');
    return (dateKey: string) => dateKey >= rangeStartKey && dateKey <= rangeEndKey;
  }, [dateRangeStart, dateRangeEnd]);

  // Create a map of employeeId to employee details from shiftRoster
  const employeeMap = useMemo(() => {
    const map = new Map<string, RosterApplicant | Applicant>();
    shiftRoster.forEach((employee) => {
      if (employee._id) {
        map.set(employee._id, employee);
      }
    });
    return map;
  }, [shiftRoster]);

  // Aggregate data by date with employee details – only dates within date range when provided
  const dataByDate = useMemo(() => {
    if (!shift?.defaultSchedule) return [];

    const perDayTotal = shift?.positions?.reduce((sum, pos) => {
      const num = parseInt(pos.numberPositions?.toString() || '0', 10);
      return sum + (isNaN(num) ? 0 : num);
    }, 0) ?? 0;

    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
    const dateMap = new Map<string, {
      date: string;
      filled: number;
      unassigned: number;
      totalRequested: number;
      employees: Array<{ id: string; name: string; email: string; timeSlot: string; assignedPosition: string }>;
    }>();

    daysOfWeek.forEach((dayOfWeek) => {
      const daySchedule = shift.defaultSchedule[dayOfWeek];
      if (daySchedule?.roster?.length > 0) {
        const timeSlot = formatTimeSlot(daySchedule.start || '', daySchedule.end || '');

        daySchedule.roster.forEach((entry: RosterEntry) => {
          if (entry.status === 'pending') return;
          if (entry.date && entry.employeeId && isDateInRange(entry.date)) {
            const employee = employeeMap.get(entry.employeeId);
            const employeeName = employee
              ? `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.email || '—'
              : 'Unknown Employee';
            const employeeEmail = employee?.email || '—';
            const assignedPosition = entry.assignedPosition?.trim() || 'Unassigned';

            if (!dateMap.has(entry.date)) {
              const details = dateDetails[entry.date] ?? { filled: 0, unassigned: 0, totalRequested: perDayTotal };
              dateMap.set(entry.date, {
                date: entry.date,
                filled: details.filled,
                unassigned: details.unassigned ?? 0,
                totalRequested: details.totalRequested,
                employees: [],
              });
            }

            dateMap.get(entry.date)!.employees.push({
              id: entry.employeeId,
              name: employeeName,
              email: employeeEmail,
              timeSlot,
              assignedPosition,
            });
          }
        });
      }
    });

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [shift, dateDetails, employeeMap, isDateInRange]);

  // Flatten all employees across all dates for "All Employees" view
  const allEmployees = useMemo(() => {
    const employees: Array<{ id: string; name: string; email: string; date: string; timeSlot: string; assignedPosition: string }> = [];
    dataByDate.forEach((dateData) => {
      dateData.employees.forEach((emp) => {
        employees.push({
          ...emp,
          date: dateData.date,
        });
      });
    });
    return employees.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  }, [dataByDate]);

  const totalRequestedPerDay = shift?.positions?.reduce((sum, pos) => {
    const num = parseInt(pos.numberPositions?.toString() || '0', 10);
    return sum + (isNaN(num) ? 0 : num);
  }, 0) || 0;

  const numDates = Object.keys(dateDetails).length;
  const totalSlots = totalRequestedPerDay * numDates;
  const totalFilled = Object.values(dateDetails).reduce((sum, d) => sum + d.filled, 0);
  const totalUnassigned = Object.values(dateDetails).reduce((sum, d) => sum + (d.unassigned ?? 0), 0);

  const dateRangeTitle = useMemo(() => {
    if (!dateRangeStart || !dateRangeEnd) return null;
    try {
      const start = parseISO(dateRangeStart);
      const end = parseISO(dateRangeEnd);
      return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
    } catch {
      return null;
    }
  }, [dateRangeStart, dateRangeEnd]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl w-[calc(100vw-2rem)] sm:w-full max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Inner wrapper: controls height and flex so middle section scrolls */}
        <div className="flex flex-col min-h-0 flex-1 overflow-hidden rounded-lg">
          {/* Header */}
          <div className="flex flex-col flex-shrink-0 gap-3 px-6 py-4 border-b bg-background">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg font-semibold">
                {shift?.shiftName || 'Shift'} – Position Details
                {dateRangeTitle && (
                  <span className="block text-sm font-normal text-muted-foreground mt-0.5">
                    {dateRangeTitle}
                  </span>
                )}
              </DialogTitle>
              <div className="text-sm text-gray-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                {totalRequestedPerDay === 0 ? (
                  <>
                    <span>No positions configured</span>
                    {totalUnassigned > 0 && (
                      <span className="text-amber-600 font-medium">
                        {totalUnassigned} unassigned
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span>
                      Total: <span className="font-semibold text-blue-600">{totalFilled}</span> / {totalSlots} filled
                    </span>
                    {totalUnassigned > 0 && (
                      <span className="text-amber-600 font-medium ml-2">
                        {totalUnassigned} unassigned
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* View Mode Toggle */}
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(value) => {
                if (value) setViewMode(value as ViewMode);
              }}
              className="justify-start"
            >
              <ToggleGroupItem value="by-date" className="text-xs">
                By Date
              </ToggleGroupItem>
              <ToggleGroupItem value="all-employees" className="text-xs">
                All Employees
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Content - Scroll container */}
          <div className="flex-1 min-h-0 flex flex-col px-6 py-4">
            {!shift ? (
              <div className="text-center py-8 text-gray-500">No shift data available</div>
            ) : dataByDate.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No scheduled employees for this shift
              </div>
            ) : (
              <div
                className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-auto rounded-lg border border-gray-200 bg-white"
                role="region"
                aria-label="Shift positions details"
              >
                {viewMode === 'by-date' ? (
                  // By Date View
                  <div className="divide-y divide-gray-200">
                    {dataByDate.map((dateData) => (
                      <div key={dateData.date} className="p-4">
                        {/* Date Header */}
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                          <h3 className="text-sm font-semibold text-gray-900">
                            {format(parseISO(dateData.date), 'EEEE, MMMM d, yyyy')}
                          </h3>
                          <div className="text-xs text-gray-600 flex flex-wrap items-center gap-x-2">
                            <span>
                              <span className="font-semibold text-green-600">{dateData.filled}</span> /{' '}
                              <span className="font-semibold">{dateData.totalRequested}</span> filled
                            </span>
                            {(dateData.totalRequested - dateData.filled) > 0 && (
                              <span className="text-red-600 ml-2">
                                ({dateData.totalRequested - dateData.filled} unfilled)
                              </span>
                            )}
                            {dateData.unassigned > 0 && (
                              <span className="text-amber-600 font-medium ml-2">
                                {dateData.unassigned} unassigned
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Employees for this date */}
                        {dateData.employees.length === 0 ? (
                          <div className="text-sm text-gray-500 italic">No employees scheduled</div>
                        ) : (
                          <table className="w-full">
                            <thead>
                              <tr className="text-left">
                                <th className="text-xs font-semibold text-gray-600 uppercase tracking-wider pb-2">
                                  Employee Name
                                </th>
                                <th className="text-xs font-semibold text-gray-600 uppercase tracking-wider pb-2">
                                  Email
                                </th>
                                <th className="text-xs font-semibold text-gray-600 uppercase tracking-wider pb-2">
                                  Position
                                </th>
                                <th className="text-xs font-semibold text-gray-600 uppercase tracking-wider pb-2">
                                  Time Slot
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {dateData.employees.map((employee, idx) => (
                                <tr
                                  key={`${employee.id}-${idx}`}
                                  className="border-t border-gray-100 first:border-t-0"
                                >
                                  <td className="py-2 pr-4">
                                    <span className="text-sm font-medium text-gray-900">
                                      {employee.name}
                                    </span>
                                  </td>
                                  <td className="py-2 pr-4">
                                    <span className="text-sm text-gray-600 truncate block max-w-[250px]">
                                      {employee.email}
                                    </span>
                                  </td>
                                  <td className="py-2 pr-4">
                                    <span className={employee.assignedPosition === 'Unassigned' ? 'text-amber-600 font-medium' : 'text-gray-900'}>
                                      {employee.assignedPosition}
                                    </span>
                                  </td>
                                  <td className="py-2">
                                    <span className="text-sm text-gray-900">{employee.timeSlot}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  // All Employees View (Flat list)
                  <table className="w-full min-w-[600px] border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-gray-200 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
                        <th
                          scope="col"
                          className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-3 px-4"
                        >
                          Date
                        </th>
                        <th
                          scope="col"
                          className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-3 px-4"
                        >
                          Employee Name
                        </th>
                        <th
                          scope="col"
                          className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-3 px-4"
                        >
                          Email
                        </th>
                        <th
                          scope="col"
                          className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-3 px-4"
                        >
                          Position
                        </th>
                        <th
                          scope="col"
                          className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-3 px-4 whitespace-nowrap"
                        >
                          Time Slot
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {allEmployees.map((employee, idx) => (
                        <tr
                          key={`${employee.id}-${employee.date}-${idx}`}
                          className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/80 transition-colors"
                        >
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <span className="text-sm font-medium text-gray-900">
                              {format(parseISO(employee.date), 'MMM d, yyyy')}
                            </span>
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="text-sm font-medium text-gray-900">
                              {employee.name}
                            </span>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="truncate max-w-[250px] text-sm text-gray-600" title={employee.email}>
                              {employee.email}
                            </div>
                          </td>
                          <td className="py-2.5 px-4">
                            <span className={employee.assignedPosition === 'Unassigned' ? 'text-sm text-amber-600 font-medium' : 'text-sm text-gray-900'}>
                              {employee.assignedPosition}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <span className="text-sm text-gray-900">{employee.timeSlot}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-shrink-0 justify-end gap-2 px-6 py-4 border-t bg-muted/50">
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
