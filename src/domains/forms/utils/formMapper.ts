import { FormField } from '../types/form.types';

// Type for user or applicant data
export interface EmployeeData {
  _id?: string;
  firstName?: string;
  lastName?: string;
  emailAddress?: string;
  email?: string;
  phoneNumber?: string;
  phone?: string;
  dateOfBirth?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  ssn?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  hireDate?: string;
  position?: string;
  department?: string;
  [key: string]: any;
}

/**
 * Maps employee data to form fields based on autoFillFrom attribute
 */
export const mapEmployeeToFormFields = (
  employee: EmployeeData | null,
  fields: FormField[]
): Record<string, any> => {
  if (!employee) return {};

  const mappedValues: Record<string, any> = {};

  // Field mapping configuration
  const fieldMappings: Record<string, (emp: EmployeeData) => any> = {
    firstName: (emp) => emp.firstName || '',
    lastName: (emp) => emp.lastName || '',
    fullName: (emp) => `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
    email: (emp) => emp.emailAddress || emp.email || '',
    emailAddress: (emp) => emp.emailAddress || emp.email || '',
    phone: (emp) => emp.phoneNumber || emp.phone || '',
    phoneNumber: (emp) => emp.phoneNumber || emp.phone || '',
    dateOfBirth: (emp) => emp.dateOfBirth || '',
    address: (emp) => emp.address || '',
    city: (emp) => emp.city || '',
    state: (emp) => emp.state || '',
    zipCode: (emp) => emp.zipCode || '',
    ssn: (emp) => emp.ssn || '',
    emergencyContactName: (emp) => emp.emergencyContactName || '',
    emergencyContactPhone: (emp) => emp.emergencyContactPhone || '',
    emergencyContactRelationship: (emp) => emp.emergencyContactRelationship || '',
    hireDate: (emp) => emp.hireDate || '',
    position: (emp) => emp.position || '',
    department: (emp) => emp.department || '',
  };

  fields.forEach((field) => {
    if (field.autoFillFrom) {
      const mappingFn = fieldMappings[field.autoFillFrom];
      if (mappingFn) {
        mappedValues[field.id] = mappingFn(employee);
      } else if (employee[field.autoFillFrom] !== undefined) {
        // Direct mapping if not in predefined mappings
        mappedValues[field.id] = employee[field.autoFillFrom];
      }
    }
  });

  return mappedValues;
};

/**
 * Extracts all fields from form sections
 */
export const getAllFieldsFromSections = (sections: any[]): FormField[] => {
  const fields: FormField[] = [];

  sections.forEach((section) => {
    section.rows?.forEach((row: any) => {
      row.columns?.forEach((field: FormField) => {
        fields.push(field);
      });
    });
  });

  return fields;
};

/**
 * Merges pre-filled values with existing draft/submitted values
 * Existing values take precedence over pre-filled values
 */
export const mergeFormValues = (
  preFilledValues: Record<string, any>,
  existingValues: Record<string, any>
): Record<string, any> => {
  return {
    ...preFilledValues,
    ...existingValues,
  };
};
