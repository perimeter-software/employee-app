import React from 'react';
import { Textarea } from '@/components/ui/Textarea/Textarea';
import { Label } from '@/components/ui/Label/Label';
import { FormField } from '@/domains/forms/types/form.types';

interface TextareaFieldProps {
  field: FormField;
  value: string | undefined;
  onChange: (value: string) => void;
  error?: string;
}

export const TextareaField: React.FC<TextareaFieldProps> = ({ field, value, onChange, error }) => {
  const { id, name, placeholder, required, readOnly } = field;

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {name}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      <Textarea
        id={id}
        value={value || ''}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={readOnly}
        className={error ? 'border-red-500' : ''}
        rows={4}
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
