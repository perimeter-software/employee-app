'use client';

import { useQuery } from '@tanstack/react-query';
import { baseInstance } from '@/lib/api/instance';

export const fileUrlQueryKeys = {
  all: ['file-url'] as const,
  detail: (key?: string | null) => [...fileUrlQueryKeys.all, key] as const,
};

/**
 * Resolves an S3 object key to a presigned URL.
 *
 * Build `key` with the helpers in `image-url-utils` (`applicantFileKey`,
 * `userPhotoKey`) rather than by hand — the key must be bucket-relative.
 */
export async function fetchFileUrl(key: string): Promise<string | null> {
  const response = await baseInstance.get<{ presignedUrl?: string }>(
    '/upload/file-url',
    { params: { path: key } }
  );
  return response.data?.presignedUrl ?? null;
}

/**
 * Resolves an S3 object key to a presigned URL, or null while loading / when
 * no key is given. Pass a nullish key to disable the request.
 *
 * Presigned URLs expire, so the result is cached well inside the backend's
 * expiry window and refetched rather than held indefinitely.
 */
export function useFileUrl(key?: string | null) {
  const { data } = useQuery({
    queryKey: fileUrlQueryKeys.detail(key),
    queryFn: () => fetchFileUrl(key!),
    enabled: !!key,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return data ?? null;
}
