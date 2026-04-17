import React from 'react';
import {
  FormSection as FormSectionType,
  FormField as FormFieldType,
  FormFieldValue,
} from '@/domains/forms/types/form.types';
import { FormField } from './FormField';

interface FormSectionProps {
  section: FormSectionType;
  formValues: Record<string, FormFieldValue>;
  errors: Record<string, string>;
  onFieldChange: (fieldId: string, value: FormFieldValue) => void;
}

export const FormSection: React.FC<FormSectionProps> = ({
  section,
  formValues,
  errors,
  onFieldChange,
}) => {
  return (
    <div className="space-y-6">
      {/* Section Header */}
      {section.title && (
        <div className="border-b border-gray-200 pb-3">
          <h3 className="text-lg font-semibold text-gray-900">{section.title}</h3>
          {section.description && (
            <p className="mt-1 text-sm text-gray-600">{section.description}</p>
          )}
        </div>
      )}

      {/* Text blocks before */}
      {section.textBlocks
        ?.filter((tb) => tb.position === 'before')
        .map((textBlock, index) => (
          <div key={`before-${index}`} className="text-gray-700">
            {textBlock.title && (
              <h4 className="font-medium mb-1">{textBlock.title}</h4>
            )}
            <p className="whitespace-pre-wrap">{textBlock.content}</p>
          </div>
        ))}

      {/* Form Rows - match stadium-people: each row is a grid with N columns (from row.columns) */}
      <div className="space-y-6">
        {section.rows?.map((row, rowIndex) => {
          // Normalize: ensure columns is always an array (API/DB may sometimes return single object)
          const rawColumns = row.columns;
          const columnsArray: FormFieldType[] = Array.isArray(rawColumns)
            ? rawColumns
            : rawColumns && typeof rawColumns === 'object' && 'id' in rawColumns
              ? [rawColumns as FormFieldType]
              : [];
          const visibleColumns = columnsArray.filter((field) => !field.hidden);
          if (visibleColumns.length === 0) return null;
          const columnCount = visibleColumns.length;
          // Responsive grid: show multiple columns from sm (640px) so layout matches stadium-people
          const gridCols =
            columnCount === 1
              ? 'grid-cols-1'
              : columnCount === 2
                ? 'grid-cols-1 sm:grid-cols-2'
                : columnCount === 3
                  ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';

          const rowKey =
            visibleColumns.map((f) => f.id || f.name).join('-') || `row-${rowIndex}`;

          return (
            <div
              key={`${section.title ?? 'section'}-${rowKey}`}
              className={`grid ${gridCols} gap-4`}
            >
              {visibleColumns.map((field) => (
                <div key={field.id} className="min-w-0">
                  <FormField
                    field={field}
                    value={formValues[field.id]}
                    onChange={(value) => onFieldChange(field.id, value)}
                    error={errors[field.id]}
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Text blocks after */}
      {section.textBlocks
        ?.filter((tb) => tb.position === 'after')
        .map((textBlock, index) => (
          <div key={`after-${index}`} className="text-gray-700">
            {textBlock.title && (
              <h4 className="font-medium mb-1">{textBlock.title}</h4>
            )}
            <p className="whitespace-pre-wrap">{textBlock.content}</p>
          </div>
        ))}
    </div>
  );
};
