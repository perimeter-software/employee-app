import { ObjectId } from 'mongodb';

// Field Types
export type FieldType =
  | 'input'
  | 'textarea'
  | 'select'
  | 'dropdown'
  | 'checkbox'
  | 'radio'
  | 'date'
  | 'time'
  | 'email'
  | 'phone'
  | 'number'
  | 'currency'
  | 'signature'
  | 'file'
  | 'paragraph'
  | 'heading'
  | 'divider';

// Field Validation
export interface FieldValidation {
  pattern?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  format?: string;
}

// Form Field
export interface FormField {
  id: string;
  name: string;
  type: FieldType;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  options?: string[];
  validation?: FieldValidation;
  tooltip?: string;
  readOnly?: boolean;
  hidden?: boolean;
  autoFillFrom?: string; // Maps to employee record field
  conditionalDisplay?: string;
  // Additional properties from stadium-people
  content?: string; // For paragraph/heading types
  level?: number; // For heading types
  position?: {
    page?: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rotation?: number;
    confidence?: number;
  };
}

// Form Row
export interface FormRow {
  columns: FormField[];
}

// Text Block
export interface TextBlock {
  position: 'top' | 'bottom' | 'before' | 'after';
  type?: string;
  title?: string;
  content: string;
}

// Form Section
export interface FormSection {
  title: string;
  description?: string;
  rows: FormRow[];
  textBlocks?: TextBlock[];
}

// Form Data Structure
export interface FormDataStructure {
  form: {
    title: string;
    subtitle?: string;
    sections: FormSection[];
    textBlocks?: TextBlock[];
    footer?: string;
    metadata?: {
      source?: string;
      date?: string;
      reference?: string;
      pages?: number;
    };
  };
}

// Form Metadata
export interface FormMetadata {
  visibility: 'ClientsOnly' | 'Both' | 'AdminsOnly';
  status: 'Active' | 'Inactive';
  audience?: string;
  onboarding?: 'Yes' | 'No';
  minOnboardingStage?: 'New' | 'ATC' | 'Screened' | 'Pre-Hire';
  required?: 'Yes' | 'No';
}

// Dynamic Form (Database Document)
export interface DynamicForm {
  _id: ObjectId | string;
  name: string;
  shortName: string;
  originalFilename?: string;
  filePath?: string;
  formData: FormDataStructure;
  images?: {
    paths?: string[];
    count?: number;
    sourceType?: 'converted_pdf' | 'direct_image';
  };
  metadata: FormMetadata;
  tenant: string;
  companyId?: ObjectId | string;
  createdAt: Date;
  updatedAt: Date;
}

// Form Response Status
export type FormResponseStatus = 'draft' | 'submitted';

// Form Response Metadata
export interface FormResponseMetadata {
  status: FormResponseStatus;
  lastSavedAt: Date;
  submittedAt?: Date;
  completedBy?: string;
  completedById?: string;
}

// Value type for a single form field (used in form state and field components)
export type FormFieldValue = string | number | boolean | string[] | undefined;

// Form Response (stored in user.dynamicForms)
export interface FormResponse {
  [fieldId: string]: FormFieldValue | FormResponseMetadata;
  _metadata: FormResponseMetadata;
}

// User Dynamic Forms (subset of user document)
export interface UserDynamicForms {
  [shortName: string]: FormResponse;
}

// API Response Types
export interface FormListItem {
  _id: string;
  name: string;
  shortName: string;
  title: string;
  subtitle?: string;
  metadata: FormMetadata;
}

export interface FormWithEmployeeData {
  form: DynamicForm;
  preFilledValues: Record<string, any>;
  existingResponse?: FormResponse;
  employee: {
    _id: string;
    firstName: string;
    lastName: string;
    emailAddress?: string;
  };
}

// Validation Result
export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

// Form Submission Data
export interface FormSubmissionData {
  formValues: Record<string, any>;
  metadata: Partial<FormResponseMetadata>;
}
