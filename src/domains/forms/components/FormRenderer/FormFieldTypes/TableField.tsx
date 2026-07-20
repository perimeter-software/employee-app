import React from 'react';
import { Label } from '@/components/ui/Label/Label';
import { FormField, FormFieldValue } from '@/domains/forms/types/form.types';
import {
  DynamicFormTable,
  type TableRow,
} from '@/domains/applicant-onboarding/components/sections/DynamicFormTable';

interface TableFieldProps {
  field: FormField;
  value: FormFieldValue;
  onChange: (value: TableRow[]) => void;
  error?: string;
}

// `table` field — reuses the canonical DynamicFormTable so the Client fill-on-
// behalf and applicant self-service surfaces produce the IDENTICAL array-of-row-
// objects value shape the shared validator + backend PDF stamper read.
export const TableField: React.FC<TableFieldProps> = ({ field, value, onChange, error }) => {
  const { name, required, readOnly } = field;

  return (
    <div className="space-y-1">
      <Label>
        {name}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      <DynamicFormTable
        columns={field.columns}
        value={value}
        readOnly={readOnly}
        onChange={onChange}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};
