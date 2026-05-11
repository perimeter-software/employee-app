'use client';

import { useMemo } from 'react';
import { TimerCard } from '@/domains/punch/components/TimeTracker/TimerCard/TimerCard';
import { useFindPunches } from '@/domains/punch/hooks';
import type { GignologyUser } from '@/domains/user/types';
import type { PunchWithJobInfo } from '@/domains/punch/types';

interface ShiftsTabProps {
  userData: GignologyUser;
  openPunches: PunchWithJobInfo[] | undefined;
  hasShiftJobs: boolean;
  isBlockedByJobPunch: boolean;
  hasActiveEventClockIn: boolean;
}

function formatClockInTime(timeIn: string): string {
  return new Date(timeIn).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
}

export function ShiftsTab({
  userData,
  openPunches,
  hasShiftJobs,
  isBlockedByJobPunch,
  hasActiveEventClockIn,
}: ShiftsTabProps) {
  const todayRange = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }, []);

  const jobIds = useMemo(
    () => userData?.jobs?.map((j) => j._id) || [],
    [userData?.jobs]
  );

  const { data: todayPunches } = useFindPunches({
    userId: userData._id || '',
    jobIds,
    startDate: todayRange.startDate,
    endDate: todayRange.endDate,
  });

  const clockedInTime = useMemo(() => {
    const activePunch = openPunches?.find((p) => !p.timeOut);
    return activePunch ? formatClockInTime(activePunch.timeIn) : null;
  }, [openPunches]);

  const todayTotalMinutes = useMemo(() => {
    if (!todayPunches?.length) return 0;
    const now = new Date();
    return todayPunches.reduce((acc, punch) => {
      const start = new Date(punch.timeIn);
      const end = punch.timeOut ? new Date(punch.timeOut) : now;
      return acc + (end.getTime() - start.getTime()) / (1000 * 60);
    }, 0);
  }, [todayPunches]);

  return (
    <div className="space-y-4">
      <TimerCard
        userData={userData}
        openPunches={openPunches}
        hasRosterEvents={false}
        hasShiftJobs={hasShiftJobs}
        isBlockedByJobPunch={isBlockedByJobPunch}
        hasActiveEventClockIn={hasActiveEventClockIn}
      />

      {/* Today stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {clockedInTime ?? '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Clocked in</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-sm font-semibold text-amber-500">0m</p>
          <p className="text-xs text-gray-500 mt-1">Break time</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-sm font-semibold text-green-600">
            {formatDuration(todayTotalMinutes)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Today total</p>
        </div>
      </div>
    </div>
  );
}
