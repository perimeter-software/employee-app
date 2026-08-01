// Ported from stadium-people/src/data/onboardApplicant.js and src/data/applicant.js
import * as yup from 'yup';
import { STATE_CODES } from '../utils/state-codes';

const NAME_REGEX = /^[A-Za-z\s.,\-()]*$/;
const PO_BOX_REGEX = /\b(P(?:\.|\s*)O(?:\.|\s*)\s*Box|PMB|Private\s*Mail\s*Box)\b/i;

export const onboardApplicantSchema = yup.object().shape({
  firstName: yup
    .string()
    .required('First name is required')
    .matches(NAME_REGEX, 'First Name contains invalid characters.'),
  lastName: yup
    .string()
    .required('Last name is required')
    .matches(NAME_REGEX, 'Last Name contains invalid characters.'),
  middleInitial: yup.string().default(''),
  city: yup.string().default('').required('City is required'),
  altPhone: yup
    .string()
    .default('')
    .test({
      name: 'test-altPhone-length',
      test: (value, ctx) => {
        const len = (value ?? '').replace(/\D/g, '').length;
        if (len === 10 || len === 0) return true;
        return ctx.createError({ message: 'Alternative Phone number must be 10 digits' });
      },
    }),
  phone: yup
    .string()
    .default('')
    .required('Mobile number is required')
    .test({
      name: 'test-phone-length',
      test: (value, ctx) => {
        const len = (value ?? '').replace(/\D/g, '').length;
        if (len === 10) return true;
        return ctx.createError({ message: 'Phone number must be 10 digits' });
      },
    }),
  state: yup
    .string()
    .trim()
    .default('')
    .test({
      name: 'state-exists',
      test: (value, ctx) => {
        if (!value) return true;
        if (STATE_CODES.includes(value.toUpperCase())) return true;
        return ctx.createError({ message: 'Insert a valid state' });
      },
    }),
  address1: yup
    .string()
    .default('')
    .required('Address is required')
    .test({
      name: 'no-po-box',
      test: (value, ctx) => {
        if (!value) return true;
        if (PO_BOX_REGEX.test(value.trim())) {
          return ctx.createError({
            message: 'PO Box addresses are not allowed. Please provide a physical address.',
          });
        }
        return true;
      },
    }),
  zip: yup
    .string()
    .default('')
    .required('Zip code is required')
    .test({
      name: 'test-zip-format',
      test: (value, ctx) => {
        const parsed = (value ?? '').replace(/\D/g, '');
        if (parsed.length === 5 || parsed.length === 9) return true;
        return ctx.createError({ message: 'Zip should only be a 5 or 9 digit format' });
      },
    }),
  applicationDate: yup.string().default(''),
  availability: yup.mixed().nullable(),
});

export interface OnboardApplicantValues {
  firstName: string;
  lastName: string;
  middleInitial: string;
  city: string;
  altPhone: string;
  phone: string;
  state: string;
  address1: string;
  zip: string;
  applicationDate: string;
  availability: string | null;
}

// ── Job Application schema (ported from stadium-people/src/data/applicant.js) ─

function phoneTest(fieldLabel: string) {
  return yup.string().default('').test({
    name: `test-${fieldLabel}-length`,
    test: (value, ctx) => {
      const len = (value ?? '').replace(/\D/g, '').length;
      if (len === 10 || len === 0) return true;
      return ctx.createError({ message: `${fieldLabel} must be 10 digits` });
    },
  });
}

export const jobApplicationSchema = yup.object().shape({
  firstName: yup
    .string()
    .required('First name is required')
    .matches(NAME_REGEX, 'First Name contains invalid characters.'),
  lastName: yup
    .string()
    .required('Last name is required')
    .matches(NAME_REGEX, 'Last Name contains invalid characters.'),
  maidenName: yup
    .string()
    .default('')
    .matches(NAME_REGEX, { message: 'Maiden Name contains invalid characters.', excludeEmptyString: true }),
  middleInitial: yup.string().default(''),
  applicationDate: yup.string().default(''),
  birthDate: yup
    .string()
    .required('Birth date is required')
    .test({
      name: 'valid-date',
      test: (value, ctx) => {
        if (!value) return ctx.createError({ message: 'Birth date is required' });
        const d = new Date(value);
        if (isNaN(d.getTime())) return ctx.createError({ message: 'Invalid birth date' });
        return true;
      },
    })
    .default(''),
  socialSecurity: yup
    .string()
    .default('')
    .required('Social Security is required')
    .test({
      name: 'test-socialSecurity-length',
      test: (value, ctx) => {
        const len = (value ?? '').replace(/\D/g, '').length;
        if (len === 9) return true;
        return ctx.createError({ message: 'Social Security number must be 9 digits' });
      },
    }),
  phone: yup
    .string()
    .default('')
    .required('Mobile number is required')
    .test({
      name: 'test-phone-length',
      test: (value, ctx) => {
        const len = (value ?? '').replace(/\D/g, '').length;
        if (len === 10) return true;
        return ctx.createError({ message: 'Phone number must be 10 digits' });
      },
    }),
  altPhone: phoneTest('Alternative Phone number'),
  emergencyContactName: yup.string().default(''),
  emergencyContactNumber: yup
    .string()
    .default('')
    .required('Emergency Contact Number is required')
    .test({
      name: 'test-emergencyContactNumber-length',
      test: (value, ctx) => {
        const len = (value ?? '').replace(/\D/g, '').length;
        if (len === 10 || len === 0) return true;
        return ctx.createError({ message: 'Emergency Contact number must be 10 digits' });
      },
    }),
  address1: yup
    .string()
    .default('')
    .required('Address is required')
    .test({
      name: 'no-po-box',
      test: (value, ctx) => {
        if (!value) return true;
        if (PO_BOX_REGEX.test(value.trim()))
          return ctx.createError({
            message: 'PO Box addresses are not allowed. Please provide a physical address.',
          });
        return true;
      },
    }),
  city: yup.string().default('').required('City is required'),
  state: yup
    .string()
    .trim()
    .default('')
    .test({
      name: 'state-exists',
      test: (value, ctx) => {
        if (!value || !STATE_CODES.includes(value.toUpperCase()))
          return ctx.createError({ message: 'Insert a valid state' });
        return true;
      },
    }),
  zip: yup
    .string()
    .default('')
    .required('Zip code is required')
    .test({
      name: 'test-zip-format',
      test: (value, ctx) => {
        const parsed = (value ?? '').replace(/\D/g, '');
        if (parsed.length === 5 || parsed.length === 9) return true;
        return ctx.createError({ message: 'Zip should only be a 5 or 9 digit format' });
      },
    }),
  driverLicense: yup.string().default(''),
  criminalHistoryDisclosure: yup.string().default(''),
});
