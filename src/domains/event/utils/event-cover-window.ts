/**
 * Event start between 2h and 48h from now (aligned with server `assertEventCoverTimeWindow`).
 */
export function isEventCoverWindowOpen(eventStartIso: string | undefined): boolean {
  if (!eventStartIso) return false;
  const start = new Date(eventStartIso).getTime();
  if (Number.isNaN(start)) return false;
  const hours = (start - Date.now()) / (1000 * 60 * 60);
  return hours > 2 && hours <= 48;
}
