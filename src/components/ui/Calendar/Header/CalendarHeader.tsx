export default function CalendarHeader({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="sticky top-16 z-50 flex lg:flex-row flex-col lg:items-center justify-between p-2 lg:p-4 gap-2 lg:gap-4 border-b bg-white shadow-sm">
      {children}
    </div>
  );
}
