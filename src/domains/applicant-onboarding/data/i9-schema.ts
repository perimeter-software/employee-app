import * as yup from 'yup';

const requireOneFieldForAuthorizedAlien = {
  name: 'requireOneFieldForAuthorizedAlien',
  test(
    this: yup.TestContext,
    value: Record<string, unknown> | null | undefined
  ): boolean | yup.ValidationError {
    if (value?.citizenshipStatus === 'Authorized Alien') {
      if (
        !value.alienRegistrationNumber &&
        !value.formI94AdmissionNumber &&
        !value.foreignPassportNumberAndCountryOfIssuance
      ) {
        return this.createError({
          message:
            'You must fill at least one of the following fields: Alien Registration Number, Form I-94 Admission Number, or Foreign Passport Number and Country of Issuance',
        });
      }
    }
    return true;
  },
};

export const i9Schema = yup
  .object()
  .shape({
    preparerOrTranslator: yup.string().required('Please choose Certification'),
    citizenshipStatus: yup.string().required('Please choose Citizenship status'),
    alienRegistrationNumber: yup
      .string()
      .default('')
      .when('citizenshipStatus', {
        is: (val: string) => val === 'Permanent Resident',
        then: (s) => s.required('Alien Registration Number is required'),
        otherwise: (s) => s.notRequired(),
      }),
    formI94AdmissionNumber: yup.string().default(''),
    foreignPassportNumberAndCountryOfIssuance: yup.string().default(''),
    expirationDate: yup
      .mixed<string | Date | null>()
      .default('')
      .when('citizenshipStatus', {
        is: (val: string) => val === 'Authorized Alien',
        then: () =>
          yup
            .date()
            .nullable()
            .transform((value, originalValue) => (originalValue === '' ? null : value))
            .required('Expiration Date is required')
            .min(new Date(), 'Expiration Date must be a future date'),
        otherwise: (s) => s.notRequired(),
      }),
    authorizedAlienCountry: yup
      .string()
      .default('')
      .when('citizenshipStatus', {
        is: (val: string) => val === 'Authorized Alien',
        then: (s) => s.required('Country is required for Authorized Aliens'),
        otherwise: (s) => s.notRequired(),
      }),
    processedDate: yup.mixed<string>(),
  })
  .test(requireOneFieldForAuthorizedAlien as Parameters<typeof yup.ObjectSchema.prototype.test>[0]);
