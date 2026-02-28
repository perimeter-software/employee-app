import CalendarHeader from './Header/CalendarHeader';
import CalendarBody from './Body/CalendarBody';
import CalendarHeaderDate from './Header/Date/CalendarHeaderDate';
import CalendarHeaderActions from './Header/Actions/CalendarHeaderActions';
import CalendarHeaderActionsMode from './Header/Actions/CalendarHeaderActionsMode';

export default function Calendar({
  hideTotalColumn = false,
  hideHeaderActions = false,
  hideHeaderDate = false,
}: {
  hideTotalColumn?: boolean;
  hideHeaderActions?: boolean;
  hideHeaderDate?: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      {!hideHeaderDate && !hideHeaderActions && (
      <CalendarHeader>
        {!hideHeaderDate && <CalendarHeaderDate />}
        {!hideHeaderActions && (
        <CalendarHeaderActions>
          <CalendarHeaderActionsMode />
        </CalendarHeaderActions>
        )}
      </CalendarHeader>
      )}
      <div className="flex-1 min-h-0">
        <CalendarBody
          hideTotalColumn={hideTotalColumn}
          hideHeaderActions={hideHeaderActions}
          hideHeaderDate={hideHeaderDate}
        />
      </div>
    </div>
  );
}
