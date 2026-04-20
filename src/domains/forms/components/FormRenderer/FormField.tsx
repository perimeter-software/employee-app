import React from 'react';
import { FormField as FormFieldType, FormFieldValue } from '@/domains/forms/types/form.types';
import { InputField } from './FormFieldTypes/InputField';
import { TextareaField } from './FormFieldTypes/TextareaField';
import { SelectField } from './FormFieldTypes/SelectField';
import { DateField } from './FormFieldTypes/DateField';
import { CheckboxField } from './FormFieldTypes/CheckboxField';
import { RadioField } from './FormFieldTypes/RadioField';
import { SignatureField } from './FormFieldTypes/SignatureField';

interface FormFieldProps {
  field: FormFieldType;
  value: FormFieldValue;
  onChange: (value: FormFieldValue) => void;
  error?: string;
}

export const FormField: React.FC<FormFieldProps> = ({ field, value, onChange, error }) => {
  // Don't render hidden fields
  if (field.hidden) {
    return null;
  }

  // Render display-only elements
  if (field.type === 'paragraph') {
    return (
      <div className="py-2">
        <p className="text-gray-700 whitespace-pre-wrap">{field.content}</p>
      </div>
    );
  }

  if (field.type === 'heading') {
    const HeadingTag = `h${field.level || 3}` as keyof JSX.IntrinsicElements;
    return (
      <div className="py-2">
        <HeadingTag className="font-semibold text-gray-900">
          {field.content || field.name}
        </HeadingTag>
      </div>
    );
  }

  if (field.type === 'divider') {
    return <hr className="my-4 border-gray-300" />;
  }

  // Render input fields based on type
  switch (field.type) {
    case 'input':
    case 'email':
    case 'phone':
    case 'number':
    case 'currency':
      return <InputField field={field} value={value} onChange={onChange} error={error} />;

    case 'textarea':
      return <TextareaField field={field} value={value} onChange={onChange} error={error} />;

    case 'select':
    case 'dropdown':
      return <SelectField field={field} value={value} onChange={onChange} error={error} />;

    case 'date':
    case 'time':
      return <DateField field={field} value={value} onChange={onChange} error={error} />;

    case 'checkbox':
      return <CheckboxField field={field} value={value} onChange={onChange} error={error} />;

    case 'radio':
      return <RadioField field={field} value={value} onChange={onChange} error={error} />;

    case 'signature':
      return <SignatureField field={field} value={value} onChange={onChange} error={error} />;

    case 'file':
      // TODO: Implement file upload field
      return (
        <div className="text-gray-500 italic">
          File upload field not yet implemented
        </div>
      );

    default:
      return (
        <div className="text-gray-500 italic">
          Unknown field type: {field.type}
        </div>
      );
  }
};
