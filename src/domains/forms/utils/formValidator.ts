import { FormField, ValidationResult } from '../types/form.types';

/**
 * Validates form data against field definitions
 */
export const validateForm = (
  formValues: Record<string, any>,
  fields: FormField[],
  isSubmit: boolean = false
): ValidationResult => {
  const errors: Record<string, string> = {};

  fields.forEach((field) => {
    // Skip validation for hidden or display-only fields
    if (field.hidden || field.type === 'paragraph' || field.type === 'heading' || field.type === 'divider') {
      return;
    }

    const value = formValues[field.id];
    const isEmpty = value === undefined || value === null || value === '';

    // Required field validation (only for submit)
    if (isSubmit && field.required && isEmpty) {
      errors[field.id] = `${field.name} is required`;
      return;
    }

    // Skip further validation if empty and not required
    if (isEmpty) {
      return;
    }

    // Type-specific validation
    switch (field.type) {
      case 'email':
        if (!isValidEmail(value)) {
          errors[field.id] = 'Please enter a valid email address';
        }
        break;

      case 'phone':
        if (!isValidPhone(value)) {
          errors[field.id] = 'Please enter a valid phone number';
        }
        break;

      case 'number':
      case 'currency':
        if (isNaN(Number(value))) {
          errors[field.id] = 'Please enter a valid number';
        } else {
          // Min/max validation
          const numValue = Number(value);
          if (field.validation?.min !== undefined && numValue < field.validation.min) {
            errors[field.id] = `Value must be at least ${field.validation.min}`;
          }
          if (field.validation?.max !== undefined && numValue > field.validation.max) {
            errors[field.id] = `Value must be at most ${field.validation.max}`;
          }
        }
        break;

      case 'date':
        if (!isValidDate(value)) {
          errors[field.id] = 'Please enter a valid date';
        }
        break;
    }

    // String length validation
    if (typeof value === 'string') {
      if (field.validation?.minLength && value.length < field.validation.minLength) {
        errors[field.id] = `Minimum length is ${field.validation.minLength} characters`;
      }
      if (field.validation?.maxLength && value.length > field.validation.maxLength) {
        errors[field.id] = `Maximum length is ${field.validation.maxLength} characters`;
      }
    }

    // Pattern validation
    if (field.validation?.pattern && typeof value === 'string') {
      const regex = new RegExp(field.validation.pattern);
      if (!regex.test(value)) {
        errors[field.id] = `Invalid format for ${field.name}`;
      }
    }
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

/**
 * Validates email format
 */
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validates phone number format (flexible)
 */
const isValidPhone = (phone: string): boolean => {
  // Remove all non-digit characters
  const digitsOnly = phone.replace(/\D/g, '');
  // Check if it has 10-15 digits (international format)
  return digitsOnly.length >= 10 && digitsOnly.length <= 15;
};

/**
 * Validates date format
 */
const isValidDate = (dateString: string): boolean => {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
};

/**
 * Gets validation errors for specific fields
 */
export const getFieldErrors = (
  fieldIds: string[],
  allErrors: Record<string, string>
): Record<string, string> => {
  const fieldErrors: Record<string, string> = {};
  fieldIds.forEach((id) => {
    if (allErrors[id]) {
      fieldErrors[id] = allErrors[id];
    }
  });
  return fieldErrors;
};

/**
 * Checks if a specific field has errors
 */
export const hasFieldError = (fieldId: string, errors: Record<string, string>): boolean => {
  return !!errors[fieldId];
};
