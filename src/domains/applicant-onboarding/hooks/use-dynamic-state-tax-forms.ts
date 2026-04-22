import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

// ── Field / form config types ────────────────────────────────────────────────

export type DslNode =
  | number
  | string
  | {
      op: string;
      args?: DslNode[];
      condition?: DslNode;
      then?: DslNode;
      else?: DslNode;
    };

export interface StateTaxFieldConfig {
  description?: string;
  dataType: 'string' | 'integer' | 'decimal' | 'boolean';
  format?: string;
  required?: boolean;
  readonly?: boolean;
  computed?: boolean;
  order?: number;
  minValue?: number;
  maxValue?: number;
  allowableValues?: string[];
  pattern?: string;
  conditionalOn?: { field: string; value: unknown };
  calculation?: { dsl?: DslNode; references?: string[] };
}

export interface StateTaxFormSection {
  title?: string;
  description?: string;
  fields: Record<string, StateTaxFieldConfig>;
}

export interface StateTaxFormWorksheet {
  title?: string;
  description?: string;
  lines: Record<string, StateTaxFieldConfig>;
}

export interface StateTaxFormMapping {
  from: { line: string };
  to: { field: string };
}

export interface StateTaxFormConfig {
  form: { name: string; description: string; code: string; revisionDate: string };
  sections: StateTaxFormSection[];
  worksheets: StateTaxFormWorksheet[];
  mappings: StateTaxFormMapping[];
  metadata: { pdfSource?: { relativePath: string }; [k: string]: unknown };
  stateType: string;
  stateCode: string;
  stateName: string;
  formCode: string;
  revisionDate: string;
}

// ── API ──────────────────────────────────────────────────────────────────────

interface RawStateTaxFields {
  metadata?: {
    name?: string;
    description?: string;
    code?: string;
    revisionDate?: string;
    pdfSource?: { relativePath: string };
    [k: string]: unknown;
  };
  sections?: StateTaxFormSection[];
  worksheets?: StateTaxFormWorksheet[];
  mappings?: StateTaxFormMapping[];
}

interface RawState {
  stateCode: string;
  stateName: string;
  type: string;
  stateTaxFields: RawStateTaxFields;
}

interface ApiResponse {
  states: RawState[];
}

async function fetchStateTaxForms(applicantId: string): Promise<ApiResponse | null> {
  const res = await axios.get(
    `/api/applicant-onboarding/applicants/${applicantId}/state-tax-forms`
  );
  return res.data?.data ?? res.data ?? null;
}

// ── Transform ────────────────────────────────────────────────────────────────

function transformFormConfigs(raw: ApiResponse | null): Record<string, StateTaxFormConfig> {
  if (!raw?.states) return {};
  const result: Record<string, StateTaxFormConfig> = {};
  raw.states.forEach(({ stateCode, stateName, type, stateTaxFields }) => {
    if (!stateTaxFields) return;
    const meta = stateTaxFields.metadata ?? {};
    result[stateCode] = {
      form: {
        name: meta.name ?? `${stateName} State Tax Form`,
        description: meta.description ?? `Complete the ${stateName} state tax withholding form`,
        code: meta.code ?? '',
        revisionDate: meta.revisionDate ?? '',
      },
      sections: stateTaxFields.sections ?? [],
      worksheets: stateTaxFields.worksheets ?? [],
      mappings: stateTaxFields.mappings ?? [],
      metadata: meta,
      stateType: type,
      stateCode,
      stateName,
      formCode: meta.code ?? '',
      revisionDate: meta.revisionDate ?? '',
    };
  });
  return result;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useDynamicStateTaxForms(
  applicantId: string | undefined,
  requiredStates: string[] = []
) {
  const sortedStates = useMemo(() => [...requiredStates].sort(), [requiredStates]);

  const { data: raw, isLoading } = useQuery({
    queryKey: ['stateTaxForms', applicantId, sortedStates],
    queryFn: () => fetchStateTaxForms(applicantId!),
    enabled: !!applicantId && requiredStates.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const formConfigs = useMemo(() => transformFormConfigs(raw ?? null), [raw]);

  const getFormConfig = useCallback(
    (stateCode: string) => formConfigs[stateCode] ?? null,
    [formConfigs]
  );

  const hasFormConfig = useCallback(
    (stateCode: string) => !!formConfigs[stateCode],
    [formConfigs]
  );

  return { formConfigs, isLoading, getFormConfig, hasFormConfig };
}
