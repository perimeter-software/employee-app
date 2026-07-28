'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Reads the deep-link query params a screen cares about and lets it strip them
 * once consumed, so the auto-opened modal doesn't reappear when the user
 * closes it, navigates away and comes back.
 *
 * Params not listed in `keys` are left untouched — /events uses `venue` as a
 * regular filter, for example, and that must survive the cleanup.
 */
export function useDeepLink<K extends string>(keys: readonly K[]) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const keyList = keys.join(',');

  const values = useMemo(() => {
    const out = {} as Record<K, string | null>;
    for (const key of keyList.split(',').filter(Boolean) as K[]) {
      out[key] = searchParams.get(key);
    }
    return out;
  }, [searchParams, keyList]);

  const clear = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    let changed = false;
    for (const key of keyList.split(',').filter(Boolean)) {
      if (next.has(key)) {
        next.delete(key);
        changed = true;
      }
    }
    if (!changed) return;
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, searchParams, keyList]);

  return { values, clear };
}
