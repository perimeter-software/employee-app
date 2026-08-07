'use client';

import { Button } from '@/components/ui/Button';
import { ArrowDown } from 'lucide-react';

type Props = {
  onContactManager: () => void;
  /**
   * Whether the "Call off" / "Let someone cover for me" buttons are rendered
   * below this notice (they are window-gated, so inside 2h they are not).
   * When they are, the notice points at them — otherwise this amber block is
   * the first thing on screen and the other two options read as afterthoughts.
   */
  hasOtherOptions?: boolean;
};

/**
 * Shown when the enrollment check refuses self-removal because the event is
 * < 48h away (`type: 'Roster'`, `allowed: 'Roster'`, `status: 'Warning'`).
 *
 * Copy is kept verbatim from the v3 app (gig-react-cli2 `RequestModal`, the
 * `isLeaveEvent` branch). v4 rendered the raw backend string here with no
 * action, which is what left employees with nothing to do inside 48h.
 */
export function EventUnder48Notice({
  onContactManager,
  hasOtherOptions = false,
}: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-semibold text-amber-900">Attention!</p>
      <p className="text-sm leading-relaxed text-amber-800">
        You may not remove this event within 48 hours. To leave a call off note,
        please click on CONTACT MANAGER. This will send a note to your event
        manager and save it in your record.
      </p>
      <p className="text-xs leading-relaxed text-amber-700">
        Event call-offs and no-shows are tracked in your employment record and
        may affect future scheduling priority.
      </p>
      <Button
        type="button"
        variant="outline-danger"
        size="sm"
        fullWidth
        onClick={onContactManager}
      >
        Contact Manager
      </Button>

      {hasOtherOptions && (
        <div className="flex items-start gap-1.5 border-t border-amber-200 pt-2.5">
          <ArrowDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
          <p className="text-xs leading-relaxed text-amber-800">
            You can also submit a{' '}
            <span className="font-medium">call-off request</span> for your
            manager to approve, or ask a coworker to{' '}
            <span className="font-medium">cover for you.</span>
          </p>
        </div>
      )}
    </div>
  );
}
