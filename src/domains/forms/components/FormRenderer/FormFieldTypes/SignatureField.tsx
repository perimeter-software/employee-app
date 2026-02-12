import React from 'react';
import { Label } from '@/components/ui/Label/Label';
import { FormField } from '@/domains/forms/types/form.types';

interface SignatureFieldProps {
  field: FormField;
  value: string | undefined;
  onChange: (value: string) => void;
  error?: string;
}

export const SignatureField: React.FC<SignatureFieldProps> = ({ field, value, onChange, error }) => {
  const { id, name, required } = field;

  // For now, we'll use a simple text input for signature
  // In a full implementation, you might want a canvas-based signature pad
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {name}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      <div className="border-2 border-gray-300 rounded-md p-4 bg-gray-50">
        {value ? (
          <div className="space-y-2">
            <div className="font-signature text-2xl text-gray-700">{value}</div>
            <button
              type="button"
              onClick={() => onChange('')}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Clear signature
            </button>
          </div>
        ) : (
          <input
            id={id}
            type="text"
            value=""
            onChange={handleChange}
            placeholder="Type your full name to sign"
            className="w-full border-none bg-transparent focus:outline-none focus:ring-0 placeholder-gray-400"
          />
        )}
      </div>
      {field.tooltip && (
        <p className="text-xs text-gray-500">{field.tooltip}</p>
      )}
      <p className="text-xs text-gray-500">
        By typing your name, you are electronically signing this form.
      </p>
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
};
