import React from 'react';
import { Label } from '@/components/ui/Label/Label';
import { FormField } from '@/domains/forms/types/form.types';

interface CheckboxFieldProps {
  field: FormField;
  value: boolean | string[] | undefined;
  onChange: (value: boolean | string[]) => void;
  error?: string;
}

export const CheckboxField: React.FC<CheckboxFieldProps> = ({ field, value, onChange, error }) => {
  const { id, name, options = [], required, readOnly } = field;

  // If no options, treat as single checkbox
  if (options.length === 0) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.checked);
    };

    return (
      <div className="space-y-1">
        <div className="flex items-center space-x-2">
          <input
            id={id}
            type="checkbox"
            checked={!!value}
            onChange={handleChange}
            disabled={readOnly}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <Label htmlFor={id} className="font-normal">
            {name}
            {required && <span className="text-red-500 ml-1">*</span>}
          </Label>
        </div>
        {field.tooltip && (
          <p className="text-xs text-gray-500 ml-6">{field.tooltip}</p>
        )}
        {error && (
          <p className="text-xs text-red-500 ml-6">{error}</p>
        )}
      </div>
    );
  }

  // Multiple checkboxes
  const selectedValues = Array.isArray(value) ? value : [];

  const handleChange = (option: string, checked: boolean) => {
    let newValues = [...selectedValues];
    if (checked) {
      if (!newValues.includes(option)) {
        newValues.push(option);
      }
    } else {
      newValues = newValues.filter((v) => v !== option);
    }
    onChange(newValues);
  };

  return (
    <div className="space-y-2">
      <Label>
        {name}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      <div className="space-y-2">
        {options.map((option, index) => (
          <div key={index} className="flex items-center space-x-2">
            <input
              id={`${id}-${index}`}
              type="checkbox"
              checked={selectedValues.includes(option)}
              onChange={(e) => handleChange(option, e.target.checked)}
              disabled={readOnly}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <Label htmlFor={`${id}-${index}`} className="font-normal">
              {option}
            </Label>
          </div>
        ))}
      </div>
      {field.tooltip && (
        <p className="text-xs text-gray-500">{field.tooltip}</p>
      )}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
};
