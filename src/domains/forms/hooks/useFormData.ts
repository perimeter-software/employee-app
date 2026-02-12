import { useState, useCallback, useEffect, useRef } from 'react';
import { FormField, ValidationResult } from '../types/form.types';
import { validateForm } from '../utils/formValidator';

export interface UseFormDataOptions {
  initialValues?: Record<string, any>;
  fields: FormField[];
  onValuesChange?: (values: Record<string, any>) => void;
}

export interface UseFormDataReturn {
  formValues: Record<string, any>;
  errors: Record<string, string>;
  isDirty: boolean;
  isValid: boolean;
  setFieldValue: (fieldId: string, value: any) => void;
  setFormValues: (values: Record<string, any>) => void;
  validateField: (fieldId: string) => void;
  validateAllFields: (isSubmit?: boolean) => ValidationResult;
  resetForm: () => void;
  resetDirty: () => void;
}

/**
 * Custom hook for managing form state
 */
export const useFormData = ({
  initialValues = {},
  fields,
  onValuesChange,
}: UseFormDataOptions): UseFormDataReturn => {
  const [formValues, setFormValuesState] = useState<Record<string, any>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [initialValuesState] = useState(initialValues);
  const prevInitialValuesRef = useRef(initialValues);

  // Update form values when initial values change (e.g. new employee selected)
  useEffect(() => {
    if (prevInitialValuesRef.current !== initialValues) {
      prevInitialValuesRef.current = initialValues;
      setFormValuesState(initialValues);
    }
  }, [initialValues]);

  /**
   * Set a single field value
   */
  const setFieldValue = useCallback(
    (fieldId: string, value: any) => {
      const newValues = { ...formValues, [fieldId]: value };
      setFormValuesState(newValues);
      setIsDirty(true);

      // Clear error for this field when user changes value
      if (errors[fieldId]) {
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[fieldId];
          return newErrors;
        });
      }

      // Notify parent of changes
      if (onValuesChange) {
        onValuesChange(newValues);
      }
    },
    [formValues, errors, onValuesChange]
  );

  /**
   * Set multiple form values at once
   */
  const setFormValues = useCallback(
    (values: Record<string, any>) => {
      setFormValuesState(values);
      setIsDirty(true);

      // Notify parent of changes
      if (onValuesChange) {
        onValuesChange(values);
      }
    },
    [onValuesChange]
  );

  /**
   * Validate a single field
   */
  const validateField = useCallback(
    (fieldId: string) => {
      const field = fields.find((f) => f.id === fieldId);
      if (!field) return;

      const result = validateForm(formValues, [field], false);
      if (result.errors[fieldId]) {
        setErrors((prev) => ({ ...prev, [fieldId]: result.errors[fieldId] }));
      } else {
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[fieldId];
          return newErrors;
        });
      }
    },
    [formValues, fields]
  );

  /**
   * Validate all fields
   */
  const validateAllFields = useCallback(
    (isSubmit: boolean = false): ValidationResult => {
      const result = validateForm(formValues, fields, isSubmit);
      setErrors(result.errors);
      return result;
    },
    [formValues, fields]
  );

  /**
   * Reset form to initial values
   */
  const resetForm = useCallback(() => {
    setFormValuesState(initialValuesState);
    setErrors({});
    setIsDirty(false);
  }, [initialValuesState]);

  /**
   * Reset dirty flag without changing values
   */
  const resetDirty = useCallback(() => {
    setIsDirty(false);
  }, []);

  // Check if form is currently valid (without enforcing required fields)
  const isValid = Object.keys(errors).length === 0;

  return {
    formValues,
    errors,
    isDirty,
    isValid,
    setFieldValue,
    setFormValues,
    validateField,
    validateAllFields,
    resetForm,
    resetDirty,
  };
};
