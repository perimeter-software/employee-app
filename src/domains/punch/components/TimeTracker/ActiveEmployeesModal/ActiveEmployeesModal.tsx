import React from 'react';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { formatPhoneNumber } from '@/lib/utils';
import type { ActiveEmployeeRow } from '@/domains/punch/types/active-employees.types';

interface ActiveEmployeesModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: ActiveEmployeeRow[];
  activeCount?: number;
  isLoading?: boolean;
}

export function ActiveEmployeesModal({
  isOpen,
  onClose,
  employees,
  activeCount,
  isLoading = false,
}: ActiveEmployeesModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl w-[calc(100vw-2rem)] sm:w-full max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Inner wrapper: controls height and flex so middle section scrolls */}
        <div className="flex flex-col min-h-0 flex-1 overflow-hidden rounded-lg">
          {/* Header */}
          <div className="flex flex-shrink-0 items-center px-6 py-4 border-b bg-background">
            <DialogTitle className="text-lg font-semibold">
              Currently Clocked In Employees ({activeCount ?? employees.length})
            </DialogTitle>
          </div>

          {/* Content - Scroll container must wrap table directly for sticky thead to work */}
          <div className="flex-1 min-h-0 flex flex-col px-6 py-4">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">
                <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mb-2"></div>
                <div>Loading active employees...</div>
              </div>
            ) : employees.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No employees currently clocked in
              </div>
            ) : (
              <div
                className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-auto rounded-lg border border-gray-200 bg-white"
                role="region"
                aria-label="Currently clocked in employees table"
              >
                <table className="w-full min-w-[600px] border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-gray-200 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
                      <th scope="col" className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-3 px-4">
                        Name
                      </th>
                      <th scope="col" className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-3 px-4">
                        Email
                      </th>
                      <th scope="col" className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-3 px-4">
                        Job
                      </th>
                      <th scope="col" className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-3 px-4 min-w-[200px] w-[280px]">
                        Shift
                      </th>
                      <th scope="col" className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-3 px-4 whitespace-nowrap">
                        Time In
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((employee) => {
                      const displayName = employee.employeeName || `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim() || '—';

                      return (
                        <tr
                          key={employee._id}
                          className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/80 transition-colors"
                        >
                          <td className="py-2.5 px-4">
                            <span className="font-medium text-sm text-gray-900" title={displayName}>
                              {displayName}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-sm text-gray-600">
                            <div className="truncate max-w-[200px]" title={employee.employeeEmail}>
                              {employee.employeeEmail}
                            </div>
                            {employee.phoneNumber && (
                              <div className="text-xs text-gray-500">{formatPhoneNumber(employee.phoneNumber)}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-sm text-gray-900">
                            {employee.jobTitle}
                          </td>
                          <td className="py-2.5 px-4 text-sm text-gray-900 min-w-[200px] w-[280px]">
                            <span className="line-clamp-2" title={employee.shiftName}>
                              {employee.shiftName || '—'}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <span className="text-sm font-semibold text-green-600">
                              {format(new Date(employee.timeIn), 'h:mm a')}
                            </span>
                            <div className="text-xs text-gray-500">
                              {format(new Date(employee.timeIn), 'MMM d, yyyy')}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
