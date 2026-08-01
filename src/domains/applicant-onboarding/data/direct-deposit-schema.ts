import * as yup from 'yup';

function validateRoutingNumber(value: string | undefined | null): boolean {
  if (value == null || value === '') return true;
  if (!/^\d{9}$/.test(value)) return false;
  const weights = [3, 7, 1, 3, 7, 1, 3, 7];
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += parseInt(value[i], 10) * weights[i];
  }
  const remainder = sum % 10;
  const checkDigit = remainder === 0 ? 0 : 10 - remainder;
  return parseInt(value[8], 10) === checkDigit;
}

export const directDepositSchema = yup.object({
  paymentType: yup.string().default('').required('Please select a payment type'),
  bankName1: yup.string().when('paymentType', {
    is: (val: string) => val === 'DirectDeposit',
    then: (s) => s.required('Bank One bank name is required'),
    otherwise: (s) => s.default('').notRequired(),
  }),
  routing1: yup.string().when('paymentType', {
    is: (val: string) => val === 'DirectDeposit',
    then: (s) =>
      s
        .required('Bank One routing # is required')
        .test('valid-routing', 'Bank One routing # is invalid', validateRoutingNumber),
    otherwise: (s) => s.default('').notRequired(),
  }),
  account1: yup.string().when('paymentType', {
    is: (val: string) => val === 'DirectDeposit',
    then: (s) => s.required('Bank One account # is required'),
    otherwise: (s) => s.default('').notRequired(),
  }),
  accountType1: yup.string().when('paymentType', {
    is: (val: string) => val === 'DirectDeposit',
    then: (s) => s.required('Bank One account type is required'),
    otherwise: (s) => s.default('').notRequired(),
  }),
  amountPercentage1: yup.string().when('paymentType', {
    is: (val: string) => val === 'DirectDeposit',
    then: (s) =>
      s
        .required('Bank One amount % is required')
        .test('pct1-totals-100', 'Amount % 1 should total 100', function (value) {
          const { amountPercentage2 } = this.parent as { amountPercentage2?: string };
          if (amountPercentage2) return true;
          return parseInt(value ?? '0', 10) === 100;
        }),
    otherwise: (s) => s.default('').notRequired(),
  }),
  bankName2: yup.string().default(''),
  routing2: yup.string().when('bankName2', {
    is: (val: string) => !!val?.length,
    then: (s) =>
      s
        .required('Bank Two routing # is required')
        .test('valid-routing2', 'Bank Two routing # is invalid', validateRoutingNumber),
    otherwise: (s) => s.default('').notRequired(),
  }),
  account2: yup.string().when(['bankName2', 'routing2'], {
    is: (b: string, r: string) => !!b?.length || !!r?.length,
    then: (s) => s.required('Bank Two account # is required'),
    otherwise: (s) => s.default('').notRequired(),
  }),
  accountType2: yup.string().when(['bankName2', 'routing2', 'account2'], {
    is: (b: string, r: string, a: string) => !!b?.length || !!r?.length || !!a?.length,
    then: (s) => s.required('Bank Two account type is required'),
    otherwise: (s) => s.default('').notRequired(),
  }),
  amountPercentage2: yup
    .string()
    .when(['bankName2', 'routing2', 'account2', 'accountType2'], {
      is: (b: string, r: string, a: string, t: string) =>
        !!b?.length || !!r?.length || !!a?.length || !!t?.length,
      then: (s) => s.required('Bank Two amount % is required'),
      otherwise: (s) => s.default('').notRequired(),
    })
    .test('pct2-totals-100', 'Combined amount % must total 100', function (value) {
      const { amountPercentage1 } = this.parent as { amountPercentage1?: string };
      if (value) {
        const total = parseInt(amountPercentage1 ?? '0', 10) + parseInt(value, 10);
        return total === 100;
      }
      return true;
    }),
  date: yup.string().default(() => new Date().toISOString().slice(0, 10)),
});

export type DirectDepositFormValues = yup.InferType<typeof directDepositSchema>;
