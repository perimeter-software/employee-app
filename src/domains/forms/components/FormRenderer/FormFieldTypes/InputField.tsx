import React from 'react';
import { Input } from '@/components/ui/Input/Input';
import { Label } from '@/components/ui/Label/Label';
import { FormField } from '@/domains/forms/types/form.types';

interface InputFieldProps {
  field: FormField;
  value: string | number | undefined;
  onChange: (value: string | number) => void;
  error?: string;
}

export const InputField: React.FC<InputFieldProps> = ({ field, value, onChange, error }) => {
  const { id, name, placeholder, required, readOnly, type } = field;

  // Determine input type based on field type
  let inputType = 'text';
  if (type === 'email') inputType = 'email';
  else if (type === 'phone') inputType = 'tel';
  else if (type === 'number' || type === 'currency') inputType = 'number';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = e.target.value;
    
    // For number/currency fields, convert to number
    if ((type === 'number' || type === 'currency') && newValue !== '') {
      newValue = parseFloat(newValue);
    }
    
    onChange(newValue);
  };

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {name}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      <Input
        id={id}
        type={inputType}
        value={value || ''}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={readOnly}
        className={error ? 'border-red-500' : ''}
        step={type === 'currency' ? '0.01' : undefined}
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
