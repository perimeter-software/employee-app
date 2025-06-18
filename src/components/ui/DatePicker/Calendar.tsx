'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CustomComponents, DayPicker } from 'react-day-picker';

import { clsxm } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/Button';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={clsxm('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
        month: 'space-y-4',
        caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-medium',
        nav: 'space-x-1 flex items-center',
        nav_button: clsxm(
          buttonVariants({ variant: 'outline', size: 'xs' }),
          'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100'
        ),
        nav_button_previous: 'absolute left-1',
        nav_button_next: 'absolute right-1',
        table: 'w-full border-collapse space-y-1',
        head_row: 'flex',
        head_cell: 'text-gray-500 rounded-md w-8 font-normal text-xs',
        row: 'flex w-full mt-2',
        cell: clsxm(
          'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
          '[&:has([aria-selected])]:bg-blue-50 [&:has([aria-selected].day-outside)]:bg-blue-50/50',
          props.mode === 'range'
            ? '[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md'
            : '[&:has([aria-selected])]:rounded-md'
        ),
        day: clsxm(
          buttonVariants({ variant: 'ghost', size: 'xs' }),
          'h-8 w-8 p-0 font-normal aria-selected:opacity-100'
        ),
        day_range_start: 'day-range-start',
        day_range_end: 'day-range-end',
        day_selected:
          'bg-blue-600 text-white hover:bg-blue-700 hover:text-white focus:bg-blue-600 focus:text-white',
        day_today: 'bg-blue-50 text-gray-900 font-semibold',
        day_outside:
          'day-outside text-gray-400 aria-selected:bg-blue-50/50 aria-selected:text-gray-400',
        day_disabled: 'text-gray-300 opacity-50 cursor-not-allowed',
        day_range_middle:
          'aria-selected:bg-blue-50 aria-selected:text-blue-900',
        day_hidden: 'invisible',
        ...classNames,
      }}
      components={
        {
          PreviousMonthButton: ({
            className,
            ...props
          }: {
            className?: string;
          } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
            <button className={className} {...props}>
              <ChevronLeft className="h-4 w-4" />
            </button>
          ),
          NextMonthButton: ({
            className,
            ...props
          }: {
            className?: string;
          } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
            <button className={className} {...props}>
              <ChevronRight className="h-4 w-4" />
            </button>
          ),
        } as Partial<CustomComponents>
      }
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
