'use client';

import { RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export function RequestsTab() {
  return (
    <Card>
      <CardContent className="py-16 flex flex-col items-center text-center">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <RefreshCw className="w-6 h-6 text-gray-400" />
        </div>
        <p className="text-sm font-semibold text-gray-700">No shift requests</p>
        <p className="text-xs text-gray-400 mt-1 mb-6">
          Swap requests, time-off, and pending approvals show here.
        </p>
        <Button className="bg-appPrimary hover:bg-appPrimary/90 text-white text-sm">
          + New request
        </Button>
      </CardContent>
    </Card>
  );
}
