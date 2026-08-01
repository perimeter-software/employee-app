import React from 'react';
import { Label } from '@/components/ui/Label/Label';
import { FormField } from '@/domains/forms/types/form.types';

interface BooleanFieldProps {
  field: FormField;
  value: string | undefined;
  onChange: (value: string) => void;
  error?: string;
}

// `boolean` fields are authored in the v4 editor seeded with options
// ["True","False"] and stored as the selected option STRING (same value shape as
// radio). Rendered as a radio pair so a required one is fillable — mirrors the
// applicant-onboarding renderer so both fill surfaces produce the same value.
export const BooleanField: React.FC<BooleanFieldProps> = ({ field, value, onChange, error }) => {
  const { id, name, required, readOnly } = field;
  const options = field.options?.length ? field.options : ['True', 'False'];

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
              type="radio"
              name={id}
              checked={value === option}
              onChange={() => onChange(option)}
              disabled={readOnly}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
            />
            <Label htmlFor={`${id}-${index}`} className="font-normal">
              {option}
            </Label>
          </div>
        ))}
      </div>
      {field.tooltip && <p className="text-xs text-gray-500">{field.tooltip}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};
