import React from 'react';
import { Select } from '@/components/ui/Select/Select';
import { Label } from '@/components/ui/Label/Label';
import { FormField } from '@/domains/forms/types/form.types';

interface SelectFieldProps {
  field: FormField;
  value: string | undefined;
  onChange: (value: string) => void;
  error?: string;
}

export const SelectField: React.FC<SelectFieldProps> = ({ field, value, onChange, error }) => {
  const { id, name, options = [], required, readOnly } = field;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {name}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      <Select
        id={id}
        value={value || ''}
        onChange={handleChange}
        disabled={readOnly}
        className={error ? 'border-red-500' : ''}
      >
        <option value="">Select an option</option>
        {options.map((option, index) => (
          <option key={index} value={option}>
            {option}
          </option>
        ))}
      </Select>
      {field.tooltip && (
        <p className="text-xs text-gray-500">{field.tooltip}</p>
      )}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
};
