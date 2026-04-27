import * as yup from 'yup';

export const w4Schema = yup.object({
  formYear: yup.string().default('2026'),
  filingStatus: yup.string().required('Filing status is required'),
  multipleJobs: yup.string().oneOf(['Yes', 'No']).default('No'),
  numberOfChildren: yup.number().min(0).max(25).default(0),
  otherDependents: yup.number().min(0).max(25).default(0),
  otherIncome: yup.number().min(0).default(0),
  deductions: yup.number().min(0).default(0),
  extraWithholding: yup.number().min(0).default(0),
  exemptFromWithholding: yup.string().oneOf(['Yes', 'No']).default('No'),
});

export type W4FormValues = yup.InferType<typeof w4Schema>;
