'use client';

import { Card, CardContent } from '@/components/ui/Card';

export function ShiftCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3 animate-pulse">
          <div className="shrink-0 w-11 h-14 rounded-lg bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-gray-200 rounded w-16" />
            <div className="h-4 bg-gray-200 rounded w-40" />
            <div className="h-3 bg-gray-200 rounded w-32" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
