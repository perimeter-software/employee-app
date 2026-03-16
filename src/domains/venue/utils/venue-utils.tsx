import React from 'react';
import { Badge } from '@/components/ui/Badge';

export const DESCRIPTION_LIMIT = 400;

export function stripHtml(html?: string): string {
  return (html ?? '').replace(/<[^>]*>/g, '').trim();
}

export function venueBadge(status: string) {
  switch (status) {
    case 'StaffingPool':
      return (
        <Badge variant="outline" className="border-emerald-500 text-emerald-700 shrink-0">
          Staffing Pool
        </Badge>
      );
    case 'Pending':
      return (
        <Badge variant="outline" className="border-amber-400 text-amber-700 shrink-0">
          Pending
        </Badge>
      );
    default:
      return null;
  }
}
