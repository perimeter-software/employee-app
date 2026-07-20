import React from 'react';
import { Textarea } from '@/components/ui/Textarea/Textarea';
import { Label } from '@/components/ui/Label/Label';
import { FormField } from '@/domains/forms/types/form.types';

interface AddressFieldProps {
  field: FormField;
  value: string | undefined;
  onChange: (value: string) => void;
  error?: string;
}

// `address` is a free-text block stored as a single string — mirrors the
// applicant-onboarding renderer (a 2-row textarea) so both fill surfaces store
// the same shape the shared validator reads.
export const AddressField: React.FC<AddressFieldProps> = ({ field, value, onChange, error }) => {
  const { id, name, placeholder, required, readOnly } = field;

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {name}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      <Textarea
        id={id}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Street, City, State, ZIP'}
        disabled={readOnly}
        className={error ? 'border-red-500' : ''}
        rows={2}
      />
      {field.tooltip && <p className="text-xs text-gray-500">{field.tooltip}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};
