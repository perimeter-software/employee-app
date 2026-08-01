/**
 * Pick the email-based first-factor whose `safeIdentifier` matches the email
 * the user typed. Without this match, `factors.find(strategy === 'email_code')`
 * just returns whichever email Clerk happens to list first — so when an
 * account has multiple verified addresses, the verification code can land at
 * a different address than the user entered (e.g. always the primary, or the
 * most-recently-added). Falls back to the first matching factor if none align.
 */
export type EmailFactor = {
  strategy: string;
  emailAddressId: string;
  safeIdentifier?: string;
};

export function pickEmailFactor<T extends EmailFactor>(
  factors: ReadonlyArray<{
    strategy: string;
    safeIdentifier?: string;
    emailAddressId?: string;
  }>,
  strategy: 'email_code' | 'reset_password_email_code',
  typedEmail: string,
): T | undefined {
  const target = typedEmail.trim().toLowerCase();
  const sameStrategy = factors.filter((f) => f.strategy === strategy);
  return (
    (sameStrategy.find(
      (f) => f.safeIdentifier?.toLowerCase() === target,
    ) ?? sameStrategy[0]) as T | undefined
  );
}
