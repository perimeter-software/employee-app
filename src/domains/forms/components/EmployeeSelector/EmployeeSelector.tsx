import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select/Select';
import { Label } from '@/components/ui/Label/Label';
import { useEmployeesList } from '@/domains/forms/hooks/use-employees-list';

interface EmployeeSelectorProps {
  selectedEmployeeId: string | null;
  onEmployeeSelect: (employeeId: string) => void;
  disabled?: boolean;
}

export const EmployeeSelector: React.FC<EmployeeSelectorProps> = ({
  selectedEmployeeId,
  onEmployeeSelect,
  disabled = false,
}) => {
  const { data: employees = [], isLoading, isError, error } = useEmployeesList();

  const errorMessage =
    isError && error instanceof Error ? error.message : isError ? 'Failed to load employees' : null;

  const selectedEmployee = employees.find((e) => e._id === selectedEmployeeId);
  const displayText = selectedEmployee
    ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}${selectedEmployee.email ? ` (${selectedEmployee.email})` : ''}`
    : undefined;

  return (
    <div className="space-y-2">
      <Label htmlFor="employee-selector">
        Select Employee
        <span className="text-red-500 ml-1">*</span>
      </Label>

      {errorMessage ? (
        <div className="text-sm text-red-500 bg-red-50 p-3 rounded-md">
          {errorMessage}
        </div>
      ) : (
        <Select
          value={selectedEmployeeId || ''}
          onValueChange={(value) => value && onEmployeeSelect(value)}
        >
          <SelectTrigger
            id="employee-selector"
            disabled={disabled || isLoading}
            className="w-full"
          >
            <SelectValue
              placeholder={isLoading ? 'Loading employees...' : 'Choose an employee'}
              displayText={displayText}
            />
          </SelectTrigger>
          <SelectContent>
            {employees.map((employee) => (
              <SelectItem key={employee._id} value={employee._id}>
                {employee.firstName} {employee.lastName}
                {employee.email ? ` (${employee.email})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {!errorMessage && employees.length === 0 && !isLoading && (
        <p className="text-sm text-gray-500">
          No employees available. Please contact your administrator.
        </p>
      )}
    </div>
  );
};
