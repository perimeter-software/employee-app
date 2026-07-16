'use client';

import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Separator } from '@/components/ui/Separator';

// ---------- Types ----------

interface FormField {
  id: string;
  type: string;
  name?: string;
  placeholder?: string;
  options?: string[];
  required?: boolean;
  defaultValue?: string | boolean;
  readOnly?: boolean;
  hidden?: boolean;
  content?: string;
  level?: number;
  signatureType?: string;
  // Stored verbatim by the AI extractor (min/max/lengths come through as
  // strings); read by formValidation.ts at submit time.
  validation?: {
    pattern?: string;
    min?: string | number;
    max?: string | number;
    minLength?: string | number;
    maxLength?: string | number;
    format?: string;
  } | null;
}

interface FormRow {
  columns?: FormField[];
}

interface TextBlock {
  position?: string;
  title?: string;
  content?: string;
}

interface FormSection {
  title?: string;
  description?: string;
  textBlocks?: TextBlock[];
  rows?: FormRow[];
}

export interface DynamicFormData {
  title?: string;
  subtitle?: string;
  textBlocks?: TextBlock[];
  sections?: FormSection[];
}

interface FormRendererProps {
  formData: DynamicFormData;
  formValues: Record<string, unknown>;
  onInputChange: (id: string, value: unknown) => void;
  applicant?: Record<string, unknown>;
  /** Per-field validation errors keyed by field id (from validateFormValues). */
  errors?: Record<string, string>;
}

// ---------- Field rendering ----------

const renderField = (
  field: FormField,
  formValues: Record<string, unknown>,
  onInputChange: (id: string, value: unknown) => void
) => {
  const { id, type, name, placeholder, options, required, defaultValue, readOnly } = field;
  const value = formValues[id] ?? defaultValue ?? '';
  const label = name ? (required ? `${name} *` : name) : '';

  switch (type) {
    case 'input':
    case 'email':
    case 'phone':
    case 'number':
    case 'currency': {
      const inputType =
        type === 'email'
          ? 'email'
          : type === 'phone'
            ? 'tel'
            : type === 'number' || type === 'currency'
              ? 'number'
              : 'text';
      return (
        <div className="space-y-1">
          {label && <Label>{label}</Label>}
          <Input
            type={inputType}
            placeholder={placeholder}
            value={value as string}
            onChange={(e) => onInputChange(id, e.target.value)}
            disabled={readOnly}
          />
        </div>
      );
    }

    case 'signature':
      return (
        <div className="space-y-1">
          {label && <Label>{label}</Label>}
          <Input
            type="text"
            placeholder={placeholder ?? 'Type your full name as signature'}
            value={value as string}
            onChange={(e) => onInputChange(id, e.target.value)}
            disabled={readOnly}
          />
        </div>
      );

    case 'date':
      return (
        <div className="space-y-1">
          {label && <Label>{label}</Label>}
          <Input
            type="date"
            value={value as string}
            onChange={(e) => onInputChange(id, e.target.value)}
            disabled={readOnly}
          />
        </div>
      );

    case 'textarea':
      return (
        <div className="space-y-1">
          {label && <Label>{label}</Label>}
          <Textarea
            placeholder={placeholder}
            rows={4}
            value={value as string}
            onChange={(e) => onInputChange(id, e.target.value)}
            disabled={readOnly}
          />
        </div>
      );

    case 'select':
    case 'dropdown':
      return (
        <div className="space-y-1">
          {label && <Label>{label}</Label>}
          {readOnly ? (
            <Input value={value as string} disabled />
          ) : (
            <Select
              value={value as string}
              onValueChange={(v) => onInputChange(id, v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={`Select ${name ?? ''}`} displayText={(value as string) || undefined} />
              </SelectTrigger>
              <SelectContent>
                {options?.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      );

    case 'checkbox':
      // With options[] this is a multi-select storing a string[] (each selected
      // option's text); without options it's a single boolean acknowledgment.
      // Mirrors the v4 renderers so both apps store the same value shape and the
      // shared validator reads them identically.
      if (options && options.length > 0) {
        const arr = Array.isArray(formValues[id]) ? (formValues[id] as string[]) : [];
        return (
          <div className="space-y-1">
            {name && (
              <span className="text-sm font-medium text-gray-700">
                {name}{required ? ' *' : ''}
              </span>
            )}
            <div className="space-y-1">
              {options.map((opt) => (
                <label key={opt} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    checked={arr.includes(opt)}
                    onChange={(e) => {
                      const set = new Set(arr);
                      if (e.target.checked) set.add(opt);
                      else set.delete(opt);
                      onInputChange(id, Array.from(set));
                    }}
                    disabled={readOnly}
                  />
                  <span className="text-sm text-gray-700">{opt}</span>
                </label>
              ))}
            </div>
          </div>
        );
      }
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-blue-600"
            checked={value === true}
            onChange={(e) => onInputChange(id, e.target.checked)}
            disabled={readOnly}
          />
          <span className="text-sm text-gray-700">{name}{required ? ' *' : ''}</span>
        </label>
      );

    case 'radio':
    case 'boolean': {
      // `boolean` fields are authored in the v4 editor seeded with options
      // ["True","False"]; render as a radio pair so a required one is fillable
      // (previously fell through to null → unsubmittable). Same value shape as
      // radio (stores the selected option string).
      const radioOptions = options?.length ? options : type === 'boolean' ? ['True', 'False'] : [];
      return (
        <div className="space-y-1">
          {name && (
            <span className="text-sm font-medium text-gray-700">
              {name}{required ? ' *' : ''}
            </span>
          )}
          <div className="space-y-1">
            {radioOptions.map((opt) => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  className="h-4 w-4 text-blue-600"
                  value={opt}
                  checked={value === opt}
                  onChange={() => onInputChange(id, opt)}
                  disabled={readOnly}
                />
                <span className="text-sm text-gray-700">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      );
    }

    case 'paragraph':
      return <p className="text-sm text-gray-700">{field.content}</p>;

    case 'heading': {
      const level = field.level ?? 6;
      const sizeClass =
        level <= 1 ? 'text-2xl' :
        level === 2 ? 'text-xl' :
        level === 3 ? 'text-lg' :
        level === 4 ? 'text-base' :
        'text-sm';
      return <p className={`${sizeClass} font-bold text-gray-800`}>{field.content}</p>;
    }

    case 'divider':
      return <Separator />;

    default:
      return null;
  }
};

// ---------- TextBlock ----------

const TextBlock: React.FC<{ block: TextBlock }> = ({ block }) => (
  <div className="mb-3">
    {block.title && <p className="text-base font-semibold text-gray-800 mb-1">{block.title}</p>}
    {block.content && <p className="text-sm text-gray-700">{block.content}</p>}
  </div>
);

// ---------- Grid layout helpers ----------

const gridColsClass = (count: number) => {
  switch (count) {
    case 1: return 'grid-cols-1';
    case 2: return 'grid-cols-1 md:grid-cols-2';
    case 3: return 'grid-cols-1 md:grid-cols-3';
    case 4: return 'grid-cols-2 md:grid-cols-4';
    default: return 'grid-cols-1 md:grid-cols-2';
  }
};

// ---------- Main component ----------

const FormRenderer: React.FC<FormRendererProps> = ({
  formData,
  formValues,
  onInputChange,
  errors,
}) => {
  if (!formData) return null;

  return (
    <div className="space-y-6">
      {/* Top-level text blocks (position: top) */}
      {formData.textBlocks
        ?.filter((b) => b.position === 'top')
        .map((b, i) => (
          <TextBlock key={i} block={b} />
        ))}

      {formData.title && (
        <h2 className="text-xl font-bold text-gray-800">{formData.title}</h2>
      )}
      {formData.subtitle && (
        <p className="text-sm text-gray-600">{formData.subtitle}</p>
      )}

      {formData.sections?.map((section, si) => (
        <div key={si} className="space-y-4">
          {section.title && (
            <h3 className="text-base font-semibold text-gray-800">{section.title}</h3>
          )}
          {section.description && (
            <p className="text-sm text-gray-600">{section.description}</p>
          )}

          {section.textBlocks
            ?.filter((b) => b.position === 'before')
            .map((b, i) => (
              <TextBlock key={i} block={b} />
            ))}

          {section.rows?.map((row, ri) => {
            const visibleCols = row.columns?.filter((f) => !f.hidden) ?? [];
            const count = visibleCols.length;
            if (count === 0) return null;
            return (
              <div key={ri} className={`grid gap-4 ${gridColsClass(count)}`}>
                {visibleCols.map((field) => (
                  <div key={field.id}>
                    {renderField(field, formValues, onInputChange)}
                    {errors?.[field.id] && (
                      <p className="text-xs text-red-600 mt-1">{errors[field.id]}</p>
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          {section.textBlocks
            ?.filter((b) => b.position === 'after')
            .map((b, i) => (
              <TextBlock key={i} block={b} />
            ))}
        </div>
      ))}

      {/* Bottom text blocks */}
      {formData.textBlocks
        ?.filter((b) => b.position === 'bottom')
        .map((b, i) => (
          <TextBlock key={i} block={b} />
        ))}
    </div>
  );
};

export default FormRenderer;
