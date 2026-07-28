'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/Card';
import { clsxm } from '@/lib/utils';

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  isLoading?: boolean;
  /** When set, the whole card becomes a link to this route. */
  href?: string;
}

export function StatCard({
  icon: Icon,
  label,
  value,
  isLoading,
  href,
}: StatCardProps) {
  const card = (
    <Card
      className={clsxm(
        'h-full',
        href &&
          'transition-colors hover:bg-gray-50 hover:border-appPrimary/30 active:bg-gray-100'
      )}
    >
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

  if (!href) return card;

  return (
    <Link
      href={href}
      aria-label={label}
      className="block h-full rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-appPrimary focus-visible:ring-offset-2"
    >
      {card}
    </Link>
  );
}
