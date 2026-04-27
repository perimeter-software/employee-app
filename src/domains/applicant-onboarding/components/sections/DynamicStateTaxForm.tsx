'use client';

import { useCallback, useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { FileText } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import { useNewApplicantContext } from '../../state/new-applicant-context';
import type { StateTaxFormConfig, StateTaxFieldConfig, DslNode } from '../../hooks/use-dynamic-state-tax-forms';

const IMAGE_SERVER = process.env.NEXT_PUBLIC_IMAGE_SERVER ?? '';

// ── Helpers ────────────────────────────────────────────────────────────────

function getStateTypeLabel(stateType: string) {
  switch (stateType) {
    case 'residence': return 'Residence State';
    case 'job': return 'Work State';
    case 'residence_and_job': return 'Residence & Work State';
    default: return 'Work State';
  }
}

function parseNumericValue(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const num = parseFloat(value.replace(/[$,\s]/g, ''));
    return Number.isNaN(num) ? 0 : num;
  }
  return 0;
}

function formatDecimal(num: number): number {
  return Number.isNaN(num) ? 0 : Number(num);
}

function evaluateDsl(node: DslNode | undefined | null, valuesByKey: Record<string, unknown>): number | boolean | undefined {
  if (node === null || node === undefined) return undefined;
  if (typeof node === 'number') return node;
  if (typeof node === 'string') return parseNumericValue(valuesByKey[node]);
  if (typeof node !== 'object') return undefined;

  const { op, args = [] } = node as { op: string; args?: DslNode[]; condition?: DslNode; then?: DslNode; else?: DslNode };
  switch (op) {
    case 'add': return args.reduce<number>((s, a) => s + ((evaluateDsl(a, valuesByKey) as number) || 0), 0);
    case 'sub': return ((evaluateDsl(args[0], valuesByKey) as number) || 0) - ((evaluateDsl(args[1], valuesByKey) as number) || 0);
    case 'mul': return args.reduce<number>((p, a) => p * ((evaluateDsl(a, valuesByKey) as number) || 0), 1);
    case 'div': {
      const denom = (evaluateDsl(args[1], valuesByKey) as number) || 0;
      if (denom === 0) return 0;
      return ((evaluateDsl(args[0], valuesByKey) as number) || 0) / denom;
    }
    case 'max': return Math.max((evaluateDsl(args[0], valuesByKey) as number) || 0, (evaluateDsl(args[1], valuesByKey) as number) || 0);
    case 'min': return Math.min((evaluateDsl(args[0], valuesByKey) as number) || 0, (evaluateDsl(args[1], valuesByKey) as number) || 0);
    case 'floor': return Math.floor((evaluateDsl(args[0], valuesByKey) as number) || 0);
    case 'ceil': return Math.ceil((evaluateDsl(args[0], valuesByKey) as number) || 0);
    case 'round': return Math.round((evaluateDsl(args[0], valuesByKey) as number) || 0);
    case 'mod': {
      const denom = (evaluateDsl(args[1], valuesByKey) as number) || 0;
      if (denom === 0) return 0;
      return ((evaluateDsl(args[0], valuesByKey) as number) || 0) % denom;
    }
    case 'gt': return ((evaluateDsl(args[0], valuesByKey) as number) || 0) > ((evaluateDsl(args[1], valuesByKey) as number) || 0);
    case 'lt': return ((evaluateDsl(args[0], valuesByKey) as number) || 0) < ((evaluateDsl(args[1], valuesByKey) as number) || 0);
    case 'if': {
      const cond = (node as { condition?: DslNode }).condition;
      return evaluateDsl(cond, valuesByKey) ? evaluateDsl((node as { then?: DslNode }).then, valuesByKey) : evaluateDsl((node as { else?: DslNode }).else, valuesByKey);
    }
    default: return undefined;
  }
}

function buildDefaultValues(
  formConfig: StateTaxFormConfig | null,
  existingData: Record<string, unknown>
): Record<string, unknown> {
  if (!formConfig) return {};
  const defaults: Record<string, unknown> = {};

  formConfig.sections.forEach((section) => {
    if (!section.fields) return;
    Object.entries(section.fields).forEach(([key, cfg]) => {
      if (!cfg) return;
      defaults[key] = existingData[key] !== undefined
        ? existingData[key]
        : cfg.dataType === 'boolean' ? false : '';
    });
  });

  formConfig.worksheets.forEach((worksheet) => {
    if (!worksheet.lines) return;
    Object.entries(worksheet.lines).forEach(([key, cfg]) => {
      if (!cfg) return;
      defaults[key] = existingData[key] !== undefined
        ? existingData[key]
        : cfg.dataType === 'boolean' ? false : '';
    });
  });

  return defaults;
}

// ── Sub-components ─────────────────────────────────────────────────────────

const FieldRow: React.FC<{
  label: string;
  fieldNumber?: number;
  children: React.ReactNode;
  fullWidth?: boolean;
}> = ({ label, fieldNumber, children, fullWidth }) => (
  <div className={`grid items-start gap-4 py-1 ${fullWidth ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-[1fr_12rem]'}`}>
    <p className="text-sm font-medium leading-snug">
      {fieldNumber != null ? `${fieldNumber}. ` : ''}{label}
    </p>
    {children}
  </div>
);

const CurrencyInput: React.FC<{
  value: unknown;
  onChange: (v: number | '') => void;
  onBlur?: () => void;
  disabled?: boolean;
}> = ({ value, onChange, onBlur, disabled }) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
    <Input
      type="number"
      min={0}
      step={0.01}
      value={value === '' || value == null ? '' : (value as number)}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      onBlur={onBlur}
      disabled={disabled}
      className="pl-7 text-right"
    />
  </div>
);

const PdfModal: React.FC<{
  open: boolean;
  onClose: () => void;
  pdfUrl: string;
  title: string;
}> = ({ open, onClose, pdfUrl, title }) => (
  <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
    <DialogContent className="max-w-4xl w-[80vw]">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <div className="w-full">
        <object data={pdfUrl} type="application/pdf" className="h-[70vh] w-full">
          <p className="text-sm text-gray-600">
            Unable to display PDF.{' '}
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
              Download instead.
            </a>
          </p>
        </object>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  stateCode: string;
  stateName: string;
  formConfig: StateTaxFormConfig | null;
  isFormLoading?: boolean;
}

const DynamicStateTaxForm: React.FC<Props> = ({
  stateCode,
  stateName,
  formConfig,
  isFormLoading = false,
}) => {
  const {
    applicant,
    updateApplicantAction,
    updateButtons,
    updateCurrentFormState,
    submitRef,
  } = useNewApplicantContext();

  const existingData = (
    (applicant?.stateTaxForm as Record<string, Record<string, unknown>> | undefined)?.[stateCode]
  ) ?? {};

  const defaultValues = buildDefaultValues(formConfig, existingData);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { isDirty, isSubmitSuccessful },
  } = useForm({ mode: 'onBlur', defaultValues });

  // ── Conditional visibility ────────────────────────────────────────────────

  const isFieldVisible = useCallback((cfg: StateTaxFieldConfig) => {
    if (!cfg.conditionalOn) return true;
    const { field, value } = cfg.conditionalOn;
    return watch(field) === value;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch]);

  // ── Calculation: worksheets ───────────────────────────────────────────────

  const worksheetCalcLines = (formConfig?.worksheets ?? []).flatMap((w) => {
    if (!w?.lines) return [];
    return Object.entries(w.lines)
      .filter(([, cfg]) => cfg?.calculation)
      .map(([key, cfg]) => ({ key, cfg }));
  });

  const worksheetRefKeys = Array.from(
    new Set(worksheetCalcLines.flatMap(({ cfg }) => cfg.calculation?.references ?? []))
  );

  const watchedWorksheetRefs = useWatch({ control, name: worksheetRefKeys });

  useEffect(() => {
    if (!worksheetCalcLines.length) return;
    const valuesByKey: Record<string, unknown> = {};
    worksheetRefKeys.forEach((name, i) => {
      valuesByKey[name] = Array.isArray(watchedWorksheetRefs) ? watchedWorksheetRefs[i] : undefined;
    });

    worksheetCalcLines.forEach(({ key, cfg }) => {
      const result = cfg.calculation?.dsl ? evaluateDsl(cfg.calculation.dsl, valuesByKey) : undefined;
      if (result !== undefined && !Number.isNaN(result)) {
        const formatted = cfg.dataType === 'integer' ? Math.round(result as number) : formatDecimal(result as number);
        setValue(key, formatted, { shouldValidate: false, shouldDirty: true });
      }
    });

    const mappings = formConfig?.mappings ?? [];
    mappings.forEach((map) => {
      const lineKey = map?.from?.line;
      const targetField = map?.to?.field;
      if (!lineKey || !targetField) return;
      const idx = worksheetRefKeys.indexOf(lineKey);
      const lineVal = idx >= 0 && Array.isArray(watchedWorksheetRefs) ? watchedWorksheetRefs[idx] : undefined;
      if (lineVal !== undefined && lineVal !== null && lineVal !== '') {
        setValue(targetField, parseNumericValue(lineVal), { shouldValidate: false, shouldDirty: true });
        setValue('worksheetCompleted', true, { shouldValidate: false, shouldDirty: true });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(watchedWorksheetRefs)]);

  // ── Calculation: sections ─────────────────────────────────────────────────

  const sectionCalcFields = (formConfig?.sections ?? []).flatMap((section) => {
    if (!section?.fields) return [];
    return Object.entries(section.fields)
      .filter(([, cfg]) => cfg?.calculation)
      .map(([key, cfg]) => ({ key, cfg }));
  });

  const sectionRefKeys = Array.from(
    new Set(sectionCalcFields.flatMap(({ cfg }) => cfg.calculation?.references ?? []))
  );

  const watchedSectionRefs = useWatch({ control, name: sectionRefKeys });

  useEffect(() => {
    if (!sectionCalcFields.length) return;
    const valuesByKey: Record<string, unknown> = {};
    sectionRefKeys.forEach((name, i) => {
      valuesByKey[name] = Array.isArray(watchedSectionRefs) ? watchedSectionRefs[i] : undefined;
    });
    sectionCalcFields.forEach(({ key, cfg }) => {
      const result = cfg.calculation?.dsl ? evaluateDsl(cfg.calculation.dsl, valuesByKey) : undefined;
      if (result !== undefined && !Number.isNaN(result)) {
        const formatted = cfg.dataType === 'integer' ? Math.round(result as number) : formatDecimal(result as number);
        setValue(key, formatted, { shouldValidate: false, shouldDirty: true });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(watchedSectionRefs)]);

  // ── Reset on stateCode/formConfig change ──────────────────────────────────

  useEffect(() => {
    reset(buildDefaultValues(formConfig, existingData));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateCode, formConfig]);

  // ── Button state ──────────────────────────────────────────────────────────

  useEffect(() => {
    updateCurrentFormState({ isDirty });
  }, [isDirty, updateCurrentFormState]);

  useEffect(() => {
    updateButtons({
      previous: { show: true, disabled: false },
      next: { show: true, disabled: false },
      submit: { show: true, disabled: !isDirty && !isSubmitSuccessful },
    });
  }, [isDirty, isSubmitSuccessful, updateButtons]);

  // ── Submit ────────────────────────────────────────────────────────────────

  const onSubmit = useCallback(async (data: Record<string, unknown>) => {
    if (!applicant?._id) return;
    const existing = (applicant.stateTaxForm as Record<string, unknown> | undefined) ?? {};
    await updateApplicantAction(applicant._id, {
      stateTaxForm: {
        ...existing,
        [stateCode]: { ...data, stateType: formConfig?.stateType },
      },
    });
    reset(data, { keepValues: true });
  }, [applicant?._id, applicant?.stateTaxForm, stateCode, formConfig?.stateType, updateApplicantAction, reset]);

  useEffect(() => {
    submitRef.current = handleSubmit(onSubmit, () => {
      toast.error('Please complete all required fields before saving.');
    });
    return () => { submitRef.current = null; };
  }, [handleSubmit, onSubmit, submitRef]);

  // ── PDF modal ─────────────────────────────────────────────────────────────

  const [showPdf, setShowPdf] = useState(false);
  const pdfRelPath = formConfig?.metadata?.pdfSource?.relativePath;
  const pdfUrl = pdfRelPath ? `${IMAGE_SERVER}/common${pdfRelPath}` : '';

  // ── Field renderer ────────────────────────────────────────────────────────

  const renderField = (fieldName: string, cfg: StateTaxFieldConfig, fieldIndex: number) => {
    if (!cfg) return null;
    if (!isFieldVisible(cfg)) return null;

    const isCalculated = !!(cfg.calculation || cfg.readonly || cfg.computed);
    const fieldNum = fieldIndex + 1;

    switch (cfg.dataType) {
      case 'string':
        if (cfg.allowableValues) {
          return (
            <div key={fieldName} className="space-y-3 py-2">
              <p className="text-sm font-medium leading-snug">{fieldNum}. {cfg.description || fieldName}</p>
              <Controller
                name={fieldName}
                control={control}
                render={({ field }) => (
                  <div className="flex flex-wrap gap-x-8 gap-y-3">
                    {cfg.allowableValues!.map((val, i) => (
                      <label key={val} className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                        <input
                          type="radio"
                          name={fieldName}
                          value={val}
                          checked={field.value === val}
                          onChange={() => field.onChange(val)}
                          className="shrink-0"
                        />
                        {String.fromCharCode(65 + i)}. {val}
                      </label>
                    ))}
                  </div>
                )}
              />
            </div>
          );
        }
        return (
          <FieldRow key={fieldName} label={cfg.description || fieldName} fieldNumber={fieldNum}>
            <Controller
              name={fieldName}
              control={control}
              render={({ field }) => (
                <Input
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  value={(field.value as string) ?? ''}
                  disabled={isCalculated}
                  className="text-right"
                />
              )}
            />
          </FieldRow>
        );

      case 'integer':
      case 'decimal':
        if (cfg.format === 'currency') {
          return (
            <FieldRow key={fieldName} label={cfg.description || fieldName} fieldNumber={fieldNum}>
              <Controller
                name={fieldName}
                control={control}
                render={({ field }) => (
                  <CurrencyInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} disabled={isCalculated} />
                )}
              />
            </FieldRow>
          );
        }
        return (
          <FieldRow key={fieldName} label={cfg.description || fieldName} fieldNumber={fieldNum}>
            <Controller
              name={fieldName}
              control={control}
              render={({ field }) => (
                <Input
                  type="number"
                  min={cfg.minValue ?? 0}
                  max={cfg.maxValue}
                  step={cfg.dataType === 'decimal' ? 0.01 : 1}
                  value={field.value === '' || field.value == null ? '' : (field.value as number)}
                  onChange={(e) => field.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                  onBlur={field.onBlur}
                  disabled={isCalculated}
                  className="text-right"
                />
              )}
            />
          </FieldRow>
        );

      case 'boolean':
        return (
          <div key={fieldName} className="flex items-start gap-3 py-2">
            <Controller
              name={fieldName}
              control={control}
              render={({ field }) => (
                <input
                  type="checkbox"
                  id={fieldName}
                  checked={!!field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                  className="mt-0.5 shrink-0"
                />
              )}
            />
            <label htmlFor={fieldName} className="cursor-pointer text-sm font-medium leading-snug">
              {fieldNum}. {cfg.description || fieldName}
            </label>
          </div>
        );

      default:
        return (
          <FieldRow key={fieldName} label={cfg.description || fieldName} fieldNumber={fieldNum}>
            <Controller
              name={fieldName}
              control={control}
              render={({ field }) => (
                <Input
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  value={(field.value as string) ?? ''}
                  className="text-right"
                />
              )}
            />
          </FieldRow>
        );
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (isFormLoading) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
        <p className="text-sm font-medium">Loading {stateName} tax form…</p>
        <p className="text-xs text-gray-500">Please wait while we load the form configuration.</p>
      </div>
    );
  }

  if (!formConfig) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-center">
        <p className="font-medium text-red-600">Form configuration not available</p>
        <p className="text-sm text-gray-500">
          Unable to load the {stateName} tax form configuration. Please contact support.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-1 text-center">
        <div className="flex items-center justify-center gap-2">
          <h3 className="text-lg font-semibold">
            {formConfig.form.name || `${stateName} State Tax Form`}
          </h3>
          {pdfUrl && (
            <Button variant="outline" size="sm" onClick={() => setShowPdf(true)}>
              <FileText className="mr-1 h-4 w-4" />
              View PDF
            </Button>
          )}
        </div>
        {formConfig.formCode && (
          <p className="text-sm text-gray-500">
            Form {formConfig.formCode}
            {formConfig.revisionDate ? ` • Revised ${formConfig.revisionDate}` : ''}
          </p>
        )}
        <p className="text-sm text-gray-600">
          {formConfig.form.description || `Complete the ${stateName} state tax withholding form`}
        </p>
        {formConfig.stateType && (
          <p className="text-sm font-semibold text-blue-700">
            ({getStateTypeLabel(formConfig.stateType)})
          </p>
        )}
      </div>

      <form id="current-form" key={stateCode} onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Sections */}
        {formConfig.sections.map((section, si) => (
          <div key={section.title ?? `section-${si}`} className="space-y-1">
            <div className="mb-3">
              <h4 className="text-sm font-bold text-blue-700">{section.title ?? `Section ${si + 1}`}</h4>
              {section.description && (
                <p className="mt-0.5 text-xs italic text-gray-500">{section.description}</p>
              )}
            </div>
            {section.fields && (
              <div className="divide-y divide-gray-100">
                {Object.entries(section.fields)
                  .sort(([, a], [, b]) => (a?.order ?? 9999) - (b?.order ?? 9999))
                  .map(([name, cfg], i) => renderField(name, cfg, i))}
              </div>
            )}
          </div>
        ))}

        {/* Worksheets */}
        {formConfig.worksheets.map((worksheet, wi) => (
          <div key={worksheet.title ?? `worksheet-${wi}`} className="space-y-1">
            <div className="mb-3">
              <h4 className="text-sm font-bold text-blue-700">{worksheet.title ?? `Worksheet ${wi + 1}`}</h4>
              {worksheet.description && (
                <p className="mt-0.5 text-xs italic text-gray-500">{worksheet.description}</p>
              )}
            </div>
            {worksheet.lines && (
              <div className="divide-y divide-gray-100">
                {Object.entries(worksheet.lines)
                  .sort(([, a], [, b]) => (a?.order ?? 9999) - (b?.order ?? 9999))
                  .map(([name, cfg], i) => renderField(name, cfg, i))}
              </div>
            )}
          </div>
        ))}
      </form>

      {pdfUrl && showPdf && (
        <PdfModal
          open={showPdf}
          onClose={() => setShowPdf(false)}
          pdfUrl={pdfUrl}
          title={formConfig.form.name || `${stateName} State Tax Form`}
        />
      )}
    </div>
  );
};

export default DynamicStateTaxForm;
