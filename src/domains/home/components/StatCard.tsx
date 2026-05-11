'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  isLoading?: boolean;
}

export function StatCard({ icon: Icon, label, value, isLoading }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <Icon className="w-5 h-5 text-appPrimary mb-2" />
        {isLoading ? (
          <div className="h-7 w-8 bg-gray-200 rounded animate-pulse mb-1" />
        ) : (
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        )}
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}
