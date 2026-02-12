import React from 'react';
import { FormDataStructure, FormFieldValue } from '@/domains/forms/types/form.types';
import { FormSection } from './FormSection';

interface FormRendererProps {
  formData: FormDataStructure;
  formValues: Record<string, FormFieldValue>;
  errors: Record<string, string>;
  onFieldChange: (fieldId: string, value: FormFieldValue) => void;
}

export const FormRenderer: React.FC<FormRendererProps> = ({
  formData,
  formValues,
  errors,
  onFieldChange,
}) => {
  const { form } = formData;

  if (!form) {
    return (
      <div className="text-center text-gray-500 py-8">
        No form data available
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Text blocks at top */}
      {form.textBlocks
        ?.filter((tb) => tb.position === 'top')
        .map((textBlock, index) => (
          <div key={`top-${index}`} className="text-gray-700 bg-blue-50 p-4 rounded-md">
            {textBlock.title && (
              <h4 className="font-medium mb-2">{textBlock.title}</h4>
            )}
            <p className="whitespace-pre-wrap">{textBlock.content}</p>
          </div>
        ))}

      {/* Form Title */}
      {form.title && (
        <div className="text-center border-b border-gray-200 pb-4">
          <h2 className="text-2xl font-bold text-gray-900">{form.title}</h2>
          {form.subtitle && (
            <p className="mt-2 text-gray-600">{form.subtitle}</p>
          )}
        </div>
      )}

      {/* Form Metadata */}
      {form.metadata && (
        <div className="bg-gray-50 p-4 rounded-md text-sm text-gray-600">
          {form.metadata.source && <div>Source: {form.metadata.source}</div>}
          {form.metadata.date && <div>Date: {form.metadata.date}</div>}
          {form.metadata.reference && <div>Reference: {form.metadata.reference}</div>}
        </div>
      )}

      {/* Form Sections */}
      {form.sections?.map((section, index) => (
        <div key={index} className="bg-white p-6 rounded-lg border border-gray-200">
          <FormSection
            section={section}
            formValues={formValues}
            errors={errors}
            onFieldChange={onFieldChange}
          />
        </div>
      ))}

      {/* Text blocks at bottom */}
      {form.textBlocks
        ?.filter((tb) => tb.position === 'bottom')
        .map((textBlock, index) => (
          <div key={`bottom-${index}`} className="text-gray-700 bg-gray-50 p-4 rounded-md">
            {textBlock.title && (
              <h4 className="font-medium mb-2">{textBlock.title}</h4>
            )}
            <p className="whitespace-pre-wrap">{textBlock.content}</p>
          </div>
        ))}

      {/* Form Footer */}
      {form.footer && (
        <div className="text-center text-sm text-gray-500 border-t border-gray-200 pt-4">
          {form.footer}
        </div>
      )}
    </div>
  );
};
