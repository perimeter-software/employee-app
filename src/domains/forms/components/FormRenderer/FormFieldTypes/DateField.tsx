import React from 'react';
import { Input } from '@/components/ui/Input/Input';
import { Label } from '@/components/ui/Label/Label';
import { FormField } from '@/domains/forms/types/form.types';

interface DateFieldProps {
  field: FormField;
  value: string | undefined;
  onChange: (value: string) => void;
  error?: string;
}

export const DateField: React.FC<DateFieldProps> = ({ field, value, onChange, error }) => {
  const { id, name, required, readOnly } = field;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  // Format date value for input (YYYY-MM-DD)
  const formatDateValue = (dateValue: string | Date | undefined): string => {
    if (!dateValue) return '';
    
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return '';
      
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      return `${year}-${month}-${day}`;
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {name}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      <Input
        id={id}
        type="date"
        value={formatDateValue(value)}
        onChange={handleChange}
        disabled={readOnly}
        className={error ? 'border-red-500' : ''}
      />
      {field.tooltip && (
        <p className="text-xs text-gray-500">{field.tooltip}</p>
      )}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
};
