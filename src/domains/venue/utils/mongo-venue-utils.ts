import type { AuthenticatedRequest } from '@/domains/user/types';

export function getApplicantId(user: AuthenticatedRequest['user']): string | null {
  if (user.applicantId) return String(user.applicantId);
  if (user.userId) return String(user.userId);
  if (user._id) return String(user._id);
  return null;
}
