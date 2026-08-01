/**
 * Push-notification deep links.
 *
 * The backend sends the same `data.link` payload it has always sent to the
 * React Native app (`gig-react-cli2`), using that app's custom scheme:
 *
 *   gignology://home
 *   gignology://venues
 *   gignology://venues/<venueSlug>/details
 *   gignology://venues/<venueSlug>/staffingpool
 *   gignology://events
 *   gignology://events/<eventId>/details
 *   gignology://events/<eventId>/roster
 *   gignology://employees/<employeeId>/details
 *   gignology://employees/<employeeId>/notes
 *   gignology://notifications
 *   gignology://notifications/<notificationId>/details
 *   gignology://settings
 *   gignology://settings/profile
 *   gignology://settings/ear
 *
 * This module maps those to employee-app URLs. It is the single source of
 * truth: the service worker hands the raw link to /link, which resolves it
 * here, so there is never a second copy of the routing table to keep in sync.
 */

/** Where a link lands when we can't map it (or the screen doesn't exist here). */
export const DEEP_LINK_FALLBACK = '/home';

/** Query param each target screen reads to auto-open its detail view. */
export const DEEP_LINK_PARAMS = {
  /** /events — opens the event detail modal for this id. */
  eventId: 'eventId',
  /** /venues — opens the venue detail modal for this slug. */
  venueSlug: 'venue',
  /** /notifications — opens the notification detail modal for this id. */
  notificationId: 'id',
  /** Secondary view on the selected entity: `roster` | `staffingpool`. */
  view: 'view',
} as const;

/**
 * Splits any link form into path segments, dropping the scheme, the query
 * string and the hash. Handles both `gignology://venues/x/details` (where the
 * first segment is the URL "host") and plain `/venues/x/details`.
 */
function toSegments(link: string): string[] {
  const withoutScheme = link.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const withoutQuery = withoutScheme.split(/[?#]/)[0];
  return withoutQuery
    .split('/')
    .map((s) => decodeURIComponent(s.trim()))
    .filter(Boolean);
}

function withParams(path: string, params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value);
  }
  const query = qs.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Resolves a notification deep link to an in-app path.
 *
 * Always returns a same-origin path (never an absolute URL), so a malformed or
 * hostile `link` in a push payload can't turn into an open redirect.
 */
export function resolveNotificationDeepLink(link: string | undefined | null): string {
  if (!link || typeof link !== 'string') return DEEP_LINK_FALLBACK;

  const [tab, ...rest] = toSegments(link);
  if (!tab) return DEEP_LINK_FALLBACK;

  switch (tab.toLowerCase()) {
    case 'home':
    case 'dashboard':
      return '/home';

    case 'venues': {
      // venues | venues/<slug> | venues/<slug>/details | venues/<slug>/staffingpool
      const [slug, leaf] = rest;
      if (!slug) return '/venues';
      return withParams('/venues', {
        [DEEP_LINK_PARAMS.venueSlug]: slug,
        [DEEP_LINK_PARAMS.view]:
          leaf?.toLowerCase() === 'staffingpool' ? 'staffingpool' : undefined,
      });
    }

    case 'events': {
      // events | events/<id> | events/<id>/details | events/<id>/roster
      const [eventId, leaf] = rest;
      if (!eventId) return '/events';
      return withParams('/events', {
        [DEEP_LINK_PARAMS.eventId]: eventId,
        [DEEP_LINK_PARAMS.view]:
          leaf?.toLowerCase() === 'roster' ? 'roster' : undefined,
      });
    }

    case 'notifications': {
      // notifications | notifications/<id>/details
      const [notificationId] = rest;
      return withParams('/notifications', {
        [DEEP_LINK_PARAMS.notificationId]: notificationId,
      });
    }

    case 'settings': {
      const [leaf] = rest;
      // "EAR" is the mobile app's Employee Attendance Report, which lives on
      // the Time & Attendance screen here.
      if (leaf?.toLowerCase() === 'ear') return '/time';
      return '/profile';
    }

    case 'profile':
      return '/profile';

    // Admin-only screens in the mobile app. The employee portal has no
    // equivalent, so these land on Home rather than a 404.
    case 'employees':
    case 'partners':
    case 'customers':
    case 'jobs':
      return DEEP_LINK_FALLBACK;

    default:
      return DEEP_LINK_FALLBACK;
  }
}

/**
 * Pulls the deep link out of an FCM payload's `data` object. The mobile app
 * reads `data.link`; web push senders sometimes use `click_action` or
 * `fcmOptions.link` instead, so all three are accepted.
 */
export function readDeepLink(
  data: Record<string, unknown> | undefined | null
): string | undefined {
  if (!data) return undefined;
  const candidates = [data.link, data.click_action, data.deepLink, data.url];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return undefined;
}
