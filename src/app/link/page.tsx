'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DEEP_LINK_FALLBACK,
  resolveNotificationDeepLink,
} from '@/lib/notifications/deep-links';

/**
 * Landing route for push-notification deep links opened from a cold start.
 *
 * The service worker can't import app modules, so it opens
 * `/link?to=<raw gignology:// link>` and this page resolves it with the shared
 * router table, then replaces itself so the deep link never lands in history.
 */
function LinkRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const target = resolveNotificationDeepLink(searchParams.get('to'));
    router.replace(target || DEEP_LINK_FALLBACK);
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-appPrimary border-t-transparent" />
      <span className="sr-only">Opening…</span>
    </div>
  );
}

export default function NotificationLinkPage() {
  return (
    <Suspense fallback={null}>
      <LinkRedirect />
    </Suspense>
  );
}
