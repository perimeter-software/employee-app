import { baseInstance } from '@/lib/api/instance';
import type {
  DynamicForm,
  FormListItem,
  FormWithEmployeeData,
  FormResponseMetadata,
} from '../types/form.types';

export const formQueryKeys = {
  all: ['forms'] as const,
  lists: () => [...formQueryKeys.all, 'list'] as const,
  list: () => [...formQueryKeys.lists()] as const,
  details: () => [...formQueryKeys.all, 'detail'] as const,
  detail: (formId: string) => [...formQueryKeys.details(), formId] as const,
  withEmployee: (formId: string, employeeId: string) =>
    [...formQueryKeys.detail(formId), 'employee', employeeId] as const,
  employeesList: () => [...formQueryKeys.all, 'employees'] as const,
} as const;

export interface FormListResponse {
  forms: FormListItem[];
  count: number;
}

export interface EmployeeListItem {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export interface EmployeesListResponse {
  data: EmployeeListItem[];
  count: number;
}

export interface SaveDraftResponse {
  shortName: string;
  metadata: FormResponseMetadata;
}

export class FormService {
  static readonly ENDPOINTS = {
    GET_FORMS: () => `/forms`,
    GET_FORM: (formId: string) => `/forms/${formId}`,
    GET_FORM_WITH_EMPLOYEE: (formId: string, employeeId: string) =>
      `/forms/${formId}/employees/${employeeId}`,
    SAVE_DRAFT: (formId: string, employeeId: string) =>
      `/forms/${formId}/employees/${employeeId}/draft`,
    SUBMIT_FORM: (formId: string, employeeId: string) =>
      `/forms/${formId}/employees/${employeeId}/submit`,
    GET_EMPLOYEES_LIST: () => `/employees/list`,
  } as const;

  /**
   * Get all active forms for the current tenant
   */
  static async getForms(): Promise<FormListItem[]> {
    const response = await baseInstance.get<FormListItem[]>(
      FormService.ENDPOINTS.GET_FORMS()
    );
    if (!response.success || response.data === undefined) {
      throw new Error(response.message || 'Failed to load forms');
    }
    return response.data;
  }

  /**
   * Get a single form by ID
   */
  static async getForm(formId: string): Promise<DynamicForm> {
    const response = await baseInstance.get<DynamicForm>(
      FormService.ENDPOINTS.GET_FORM(formId)
    );
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to load form');
    }
    return response.data;
  }

  /**
   * Get form with employee data pre-filled
   */
  static async getFormWithEmployeeData(
    formId: string,
    employeeId: string
  ): Promise<FormWithEmployeeData> {
    const response = await baseInstance.get<FormWithEmployeeData>(
      FormService.ENDPOINTS.GET_FORM_WITH_EMPLOYEE(formId, employeeId)
    );
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to load form with employee data');
    }
    return response.data;
  }

  /**
   * Get list of employees (for client users, e.g. form filler)
   */
  static async getEmployeesList(): Promise<EmployeeListItem[]> {
    const response = await baseInstance.get<EmployeeListItem[]>(
      FormService.ENDPOINTS.GET_EMPLOYEES_LIST()
    );
    if (!response.success) {
      throw new Error(response.message || 'Failed to load employees');
    }
    return response.data ?? [];
  }

  /**
   * Save form as draft
   */
  static async saveDraft(
    formId: string,
    employeeId: string,
    formValues: Record<string, any>
  ): Promise<SaveDraftResponse> {
    const response = await baseInstance.post<SaveDraftResponse>(
      FormService.ENDPOINTS.SAVE_DRAFT(formId, employeeId),
      { formValues }
    );
    if (!response.success || !response.data) {
      const err = new Error(response.message || 'Failed to save draft') as Error & {
        errors?: Record<string, string>;
      };
      if (response.errors) err.errors = response.errors;
      throw err;
    }
    return response.data;
  }

  /**
   * Submit form
   */
  static async submitForm(
    formId: string,
    employeeId: string,
    formValues: Record<string, any>
  ): Promise<SaveDraftResponse> {
    const response = await baseInstance.post<SaveDraftResponse>(
      FormService.ENDPOINTS.SUBMIT_FORM(formId, employeeId),
      { formValues }
    );
    if (!response.success || !response.data) {
      const err = new Error(response.message || 'Failed to submit form') as Error & {
        errors?: Record<string, string>;
      };
      if (response.errors) err.errors = response.errors;
      throw err;
    }
    return response.data;
  }
}
