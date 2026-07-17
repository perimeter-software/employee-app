// Canonical, PURE, framework-agnostic dynamic-form field validation.
//
// Within employee-app this is the SINGLE validator, shared by both surfaces:
//   - forms-domain  (/forms Client fill-on-behalf) via useFormData + the submit route
//   - applicant-onboarding (Additional Forms) via AdditionalForms
// A byte-identical copy lives in the v4 repo (no shared package spans the two repos):
//   gignology-v4:  src/components/forms/formValidation.ts
//   employee-app:  src/lib/forms/formValidation.ts   (this file)
// Keep the two copies' logic in sync. No React/Next imports so it copy-pastes
// across both build systems.
//
// It is a SUPERSET of the v3 (stadium-people) Yup rules with v3's gaps fixed:
//   - options-membership enforced on radio too (v3 only checked Dropdown)
//   - a required single checkbox must actually be checked (=== true)
//   - required multi-select must have a non-empty array (v3's `!value` never
//     caught [])
//   - email / phone / ssn / zip / url formats, numeric min/max, currency >= 0,
//     strict numeric + date parsing
//   - 0 and false are NOT "missing" (fixes the `!value` bug both v4 apps had)
//
// Optional + empty fields are never format-checked (a blank optional email must
// not fail the email rule). Hidden / readOnly / display-only fields are skipped.

export interface FieldValidationMeta {
  pattern?: string;
  // min/max/minLength/maxLength are stored as STRINGS by the AI extractor.
  min?: string | number;
  max?: string | number;
  minLength?: string | number;
  maxLength?: string | number;
  format?: string;
}

export interface ValidatableField {
  id: string;
  name?: string;
  type: string;
  required?: boolean | string | number;
  hidden?: boolean;
  readOnly?: boolean;
  options?: string[];
  validation?: FieldValidationMeta | null;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

// `image` = an image embedded in the source form (a logo/diagram), not a fillable
// value — treat it as display-only like paragraph/heading/divider so a mis-extracted
// `required` flag on it can never block submission.
const DISPLAY_ONLY = new Set(["paragraph", "heading", "divider", "image"]);
// `dropdown` is normalized to `select` before this check runs.
const OPTION_TYPES = new Set(["select", "radio", "boolean"]);

// `required` arrives as a boolean today but coerce defensively — model/legacy
// drift can yield 'Yes' / 'true' / 1.
const coerceBool = (v: unknown): boolean =>
  v === true || v === 1 || v === "true" || v === "Yes" || v === "yes" || v === "1";

// Coerce the STRING-stored numeric bounds; treat '' / non-numeric as unset
// (absent), never as 0.
const toNum = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isNaN(n) ? undefined : n;
};

// Strip $, thousands separators and whitespace before parsing (en-US: the
// SSN/US-zip/US-phone rules confirm the locale).
const numericValue = (v: unknown): number => Number(String(v).replace(/[$,\s]/g, ""));

const normType = (t: string): string => (t === "dropdown" ? "select" : t);

// validation.format is model-authored and open-ended ('phone number', 'US SSN',
// 'zip code', '…etc'). Normalize case + synonyms to a known key; an unrecognized
// format falls through to a no-op rather than blocking a submit.
const normFormat = (f?: string): string | undefined => {
  if (!f) return undefined;
  const s = f.trim().toLowerCase();
  if (/e-?mail/.test(s)) return "email";
  if (/phone|tel|mobile/.test(s)) return "phone";
  if (/ssn|social/.test(s)) return "ssn";
  if (/zip|postal/.test(s)) return "zip";
  if (/url|link|website/.test(s)) return "url";
  if (/currency|money|dollar|amount/.test(s)) return "currency";
  if (/^date/.test(s)) return "date";
  if (/^time/.test(s)) return "time";
  if (/number|numeric|integer|decimal/.test(s)) return "number";
  return s;
};

// Extraction gives the CLASSIFICATION (format) but rarely the enforcing regex,
// so we supply the rules.
const FORMAT_RULES: Record<string, (v: string) => boolean> = {
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
  phone: (v) => {
    const d = v.replace(/\D/g, "");
    return d.length >= 10 && d.length <= 15;
  },
  ssn: (v) => /^\d{3}-?\d{2}-?\d{4}$/.test(v.trim()),
  zip: (v) => /^\d{5}(-\d{4})?$/.test(v.trim()),
  url: (v) => /^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(v.trim()),
};

const FORMAT_MSG: Record<string, string> = {
  email: "Please enter a valid email address",
  phone: "Please enter a valid phone number",
  ssn: "Please enter a valid 9-digit SSN",
  zip: "Please enter a valid ZIP code",
  url: "Please enter a valid URL",
};

const isEmptyScalar = (v: unknown): boolean => v === undefined || v === null || v === "";

// Walk sections[] -> rows[] -> columns[] (null-safe) into a flat field list.
export function flattenFields(form: unknown): ValidatableField[] {
  const out: ValidatableField[] = [];
  const sections = (form as { sections?: unknown[] } | null | undefined)?.sections;
  if (!Array.isArray(sections)) return out;
  for (const section of sections) {
    const rows = (section as { rows?: unknown[] } | null | undefined)?.rows;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const columns = (row as { columns?: unknown[] } | null | undefined)?.columns;
      if (!Array.isArray(columns)) continue;
      for (const col of columns) {
        if (col) out.push(col as ValidatableField);
      }
    }
  }
  return out;
}

/**
 * Validate `values` against `fields`. Errors are keyed by field id, first error
 * per field wins. Pass `{ isSubmit: false }` for per-field/onBlur checks that
 * skip the required-emptiness gate (format/membership still apply once a value
 * is present).
 */
export function validateFields(
  values: Record<string, unknown>,
  fields: ValidatableField[],
  opts: { isSubmit?: boolean } = {},
): ValidationResult {
  const errors: Record<string, string> = {};
  const isSubmit = opts.isSubmit !== false;

  for (const field of fields) {
    if (!field?.id) continue;
    const type = normType(field.type);
    if (DISPLAY_ONLY.has(type) || field.hidden || field.readOnly) continue;

    const label = field.name || "This field";
    const required = coerceBool(field.required);
    const value = values[field.id];
    const options = Array.isArray(field.options) ? field.options : [];
    const isMulti = type === "checkbox" && options.length > 0;
    const isSingleCheckbox = type === "checkbox" && options.length === 0;
    const isTable = type === "table";

    // Type-aware emptiness. 0 and false are legitimate values, NOT "missing".
    let empty: boolean;
    if (isMulti) empty = !Array.isArray(value) || value.length === 0;
    else if (isSingleCheckbox) empty = value !== true;
    else if (isTable)
      // A table value is an array of row objects keyed by column key; empty when
      // there are no rows, or every row's cells are all empty.
      empty =
        !Array.isArray(value) ||
        value.length === 0 ||
        (value as unknown[]).every(
          (r) =>
            !r ||
            typeof r !== "object" ||
            Object.values(r as Record<string, unknown>).every(isEmptyScalar),
        );
    else empty = isEmptyScalar(value);

    if (isSubmit && required && empty) {
      errors[field.id] = isSingleCheckbox ? `${label} must be checked` : `${label} is required`;
      continue;
    }
    // Optional + empty: nothing further to validate.
    if (empty) continue;
    // A table's value is an array of row objects — the scalar/format/options
    // rules below don't apply to it.
    if (isTable) continue;

    // Options membership (choice types). Trim-tolerant so a stored/prefilled
    // value with whitespace drift isn't wrongly rejected.
    if (options.length > 0 && (OPTION_TYPES.has(type) || isMulti)) {
      const inSet = (x: unknown) => options.some((o) => String(o).trim() === String(x).trim());
      const ok = isMulti ? (value as unknown[]).every(inSet) : inSet(value);
      if (!ok) {
        errors[field.id] = isMulti
          ? `Please choose valid options for ${label}`
          : `Please choose a valid option for ${label}`;
        continue;
      }
    }

    // Resolve an effective format: explicit validation.format wins, else infer
    // from the field type.
    const fmt =
      normFormat(field.validation?.format) ??
      (type === "email"
        ? "email"
        : type === "phone"
          ? "phone"
          : type === "number" || type === "currency"
            ? "number"
            : type === "date"
              ? "date"
              : type === "time"
                ? "time"
                : undefined);

    const strVal = typeof value === "string" ? value : String(value ?? "");

    if (fmt && FORMAT_RULES[fmt] && !FORMAT_RULES[fmt](strVal)) {
      errors[field.id] = FORMAT_MSG[fmt];
      continue;
    }

    if (fmt === "number" || fmt === "currency" || type === "number" || type === "currency") {
      const n = numericValue(value);
      if (Number.isNaN(n)) {
        errors[field.id] = "Please enter a valid number";
        continue;
      }
      if ((type === "currency" || fmt === "currency") && n < 0) {
        errors[field.id] = "Amount cannot be negative";
        continue;
      }
      const min = toNum(field.validation?.min);
      const max = toNum(field.validation?.max);
      if (min !== undefined && n < min) {
        errors[field.id] = `Value must be at least ${min}`;
        continue;
      }
      if (max !== undefined && n > max) {
        errors[field.id] = `Value must be at most ${max}`;
        continue;
      }
    }

    if (fmt === "date" || type === "date") {
      if (Number.isNaN(Date.parse(strVal))) {
        errors[field.id] = "Please enter a valid date";
        continue;
      }
    }

    if (fmt === "time" || type === "time") {
      if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(strVal.trim())) {
        errors[field.id] = "Please enter a valid time";
        continue;
      }
    }

    // Generic length bounds (string values only).
    if (typeof value === "string") {
      const minLen = toNum(field.validation?.minLength);
      const maxLen = toNum(field.validation?.maxLength);
      if (minLen !== undefined && value.length < minLen) {
        errors[field.id] = `Must be at least ${minLen} characters`;
        continue;
      }
      if (maxLen !== undefined && value.length > maxLen) {
        errors[field.id] = `Must be at most ${maxLen} characters`;
        continue;
      }
    }

    // Explicit model-authored regex (sparsely populated). A malformed AI regex
    // must skip, not throw or hang the submit.
    if (field.validation?.pattern && typeof value === "string") {
      try {
        if (!new RegExp(field.validation.pattern).test(value)) {
          errors[field.id] = `Invalid format for ${label}`;
          continue;
        }
      } catch {
        /* ignore malformed pattern */
      }
    }
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

/** Convenience: validate a whole form's values at submit time. */
export const validateFormValues = (
  form: unknown,
  values: Record<string, unknown>,
): ValidationResult => validateFields(values, flattenFields(form), { isSubmit: true });
