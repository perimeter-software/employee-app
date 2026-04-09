/**
 * `swap-requests`: job shift swaps (no `eventUrl`), event cover (`type: swap` + `eventUrl`),
 * event call-off (`type: call-off` + `eventUrl`).
 */
export const EVENT_COVER_STORAGE_COLLECTION = 'swap-requests' as const;
export const EVENT_COVER_JOB_SLUG = 'event-cover' as const;

/** Event “let someone cover” rows only. */
export const EVENT_COVER_DOC_FILTER = {
  type: 'swap',
  eventUrl: { $exists: true, $type: 'string', $ne: '' },
} as const;

export const EVENT_CALL_OFF_DOC_FILTER = {
  type: 'call-off',
  status: 'pending_approval',
} as const;
