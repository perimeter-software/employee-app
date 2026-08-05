import DOMPurify from 'dompurify';

/**
 * Rough visible-text length of an HTML string, ignoring markup. Used only to
 * decide whether content is long enough to warrant a "Show more" toggle —
 * not for display, so it doesn't need to be exact.
 */
function plainTextLength(html: string): number {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim().length;
}

export interface PreparedRichText {
  /** Sanitized HTML, safe to pass to dangerouslySetInnerHTML. */
  html: string;
  /** Whether the content is long enough to offer a "Show more" collapse toggle. */
  isLong: boolean;
}

/**
 * Prepares admin-authored rich text (Quill HTML, e.g. event/venue
 * descriptions) for safe rendering. Replaces the old pattern of stripping
 * tags down to plain text, which discarded headings, lists, links, images,
 * and inline styling entirely instead of just failing to render them.
 */
export function prepareRichText(
  html: string | null | undefined,
  lengthLimit = 400,
): PreparedRichText {
  if (!html) return { html: '', isLong: false };
  return {
    html: DOMPurify.sanitize(html),
    isLong: plainTextLength(html) > lengthLimit,
  };
}
