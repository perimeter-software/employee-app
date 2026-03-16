export interface TopicRecord {
  topicParent: string;
  topic: string;
  action: 'add' | 'delete';
}

/**
 * Sanitizes a string for use as a Firebase topic name.
 * Firebase topics may only contain letters, numbers, hyphens, and underscores.
 */
function sanitize(str: string): string {
  return str.replace(/[^a-zA-Z0-9\-_]/g, '-');
}

/**
 * Returns the three Firebase venue topics that should be subscribed to or
 * unsubscribed from when an applicant's venue status changes.
 * Mirrors the backend getVenueTopics utility exactly.
 */
export function getVenueTopics(venueSlug: string, status: string): TopicRecord[] {
  return [
    {
      topicParent: venueSlug,
      topic: venueSlug,
      action: status === 'Delete' || status === 'Locked' ? 'delete' : 'add',
    },
    {
      topicParent: venueSlug,
      topic: sanitize(`${venueSlug}-staffingpool`),
      action: status === 'StaffingPool' ? 'add' : 'delete',
    },
    {
      topicParent: venueSlug,
      topic: sanitize(`${venueSlug}-pending`),
      action: status === 'Pending' ? 'add' : 'delete',
    },
  ];
}

/**
 * Returns the Firebase event topic to unsubscribe from when an applicant
 * is removed from an event.
 */
export function getEventTopics(eventId: string): TopicRecord[] {
  return [{ topicParent: eventId, topic: eventId, action: 'delete' }];
}
