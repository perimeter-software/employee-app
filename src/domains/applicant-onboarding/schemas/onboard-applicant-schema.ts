// Ported from stadium-people/src/data/onboardApplicant.js
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
