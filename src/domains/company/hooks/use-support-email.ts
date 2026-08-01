import { usePrimaryCompany } from './use-primary-company';

// Used when the primary company has no supportEmail configured (missing, null
// or blank), and while the company record is still loading.
export const SUPPORT_EMAIL_FALLBACK = 'support@stadiumpeople.com';

/**
 * The address behind the app's "Help & Support" links: the primary company's
 * `supportEmail` when set, otherwise {@link SUPPORT_EMAIL_FALLBACK}.
 */
export const useSupportEmail = (): string => {
  const { data: company } = usePrimaryCompany();
  return company?.supportEmail?.trim() || SUPPORT_EMAIL_FALLBACK;
};
