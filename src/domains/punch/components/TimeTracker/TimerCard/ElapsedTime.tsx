'use client';

import React, { useState, useEffect } from 'react';

interface ElapsedTimeProps {
  startTime: string;
  endTime?: string;
  onClick?: () => void;
  // Shift information for accurate progress calculation
  shiftStartTime?: string;
  shiftEndTime?: string;
  shiftDurationMinutes?: number;
}

export function ElapsedTime({
  startTime,
  endTime,
  onClick,
  shiftStartTime,
  shiftEndTime,
  shiftDurationMinutes,
}: ElapsedTimeProps) {
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const punchStart = new Date(startTime);
      const now = endTime ? new Date(endTime) : new Date();
      const elapsedSeconds = Math.floor(
        (now.getTime() - punchStart.getTime()) / 1000
      );
      setElapsed(elapsedSeconds);

      // Calculate progress: from punch time to shift end time
      let progressPercentage = 0;

      if (shiftEndTime) {
        // Method 1: Use actual shift end time
        const shiftEnd = new Date(shiftEndTime);
        const totalWorkTime = shiftEnd.getTime() - punchStart.getTime();
        const currentWorkTime = now.getTime() - punchStart.getTime();

        if (totalWorkTime > 0) {
          progressPercentage = Math.max(
            0,
            (currentWorkTime / totalWorkTime) * 100
          );
        }
      } else if (shiftDurationMinutes) {
        // Method 2: Use shift duration from punch start
        const totalWorkSeconds = shiftDurationMinutes * 60;
        progressPercentage = Math.max(
          0,
          (elapsedSeconds / totalWorkSeconds) * 100
        );
      } else {
        // Method 3: Fallback - assume 8-hour shift from punch start
        const assumedWorkSeconds = 8 * 60 * 60; // 8 hours
        progressPercentage = Math.max(
          0,
          (elapsedSeconds / assumedWorkSeconds) * 100
        );
      }

      setProgress(progressPercentage);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, endTime, shiftEndTime, shiftDurationMinutes]);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;

  // Calculate SVG circle properties
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset =
    circumference - (Math.min(progress, 100) / 100) * circumference;

  // Determine progress color based on progress and overtime
  const getProgressColor = (progress: number) => {
    if (progress <= 100) {
      return '#40C8FD'; // Your brand blue for normal progress
    } else {
      return '#EF4444'; // Red for overtime
    }
  };

  const progressColor = getProgressColor(progress);
  const isOvertime = progress > 100;

  return (
    <div className="text-center mb-6">
      <div
        className={`relative w-72 h-72 mx-auto transition-all duration-200 hover:scale-105 ${
          onClick ? 'cursor-pointer' : ''
        }`}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={
          onClick
            ? `Click to clock out. ${Math.min(progress, 100).toFixed(
                1
              )}% of shift completed${isOvertime ? ' - OVERTIME' : ''}`
            : `${Math.min(progress, 100).toFixed(1)}% of shift completed${
                isOvertime ? ' - OVERTIME' : ''
              }`
        }
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
      >
        <svg
          className="w-full h-full transform -rotate-90"
          viewBox="0 0 100 100"
        >
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke="#E5E7EB"
            strokeWidth="6"
            fill="none"
            opacity="0.3"
          />

          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke={progressColor}
            strokeWidth="6"
            fill="none"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-500 ease-out"
            strokeLinecap="round"
            style={{
              filter: isOvertime
                ? 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.5))'
                : 'none',
            }}
          />

          {/* Add completion indicator at 100% */}
          {progress >= 100 && (
            <circle
              cx="50"
              cy="5" // Top of circle (12 o'clock position)
              r="3"
              fill={progressColor}
              className={isOvertime ? 'animate-pulse' : ''}
            />
          )}
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {/* Elapsed time */}
          <div className="text-3xl font-bold text-gray-900 mb-1">
            {hours.toString().padStart(2, '0')}:
            {minutes.toString().padStart(2, '0')}:
            {seconds.toString().padStart(2, '0')}
          </div>

          {/* Progress percentage */}
          <div
            className={`text-sm font-medium mb-2 ${
              isOvertime ? 'text-red-600' : 'text-gray-500'
            }`}
          >
            {isOvertime
              ? `+${(progress - 100).toFixed(1)}% Overtime`
              : `${progress.toFixed(1)}% Complete`}
          </div>

          {/* Action text */}
          <div className="text-lg font-semibold text-gray-600">
            {onClick ? 'CLOCK OUT' : 'ACTIVE'}
          </div>

          {/* Overtime indicator */}
          {isOvertime && (
            <div className="text-xs font-bold text-red-600 mt-1 animate-pulse">
              OVERTIME
            </div>
          )}
        </div>

        {/* Overtime glow effect */}
        {isOvertime && (
          <div
            className="absolute inset-0 rounded-full animate-pulse opacity-30"
            style={{
              background:
                'radial-gradient(circle, transparent 60%, rgba(239, 68, 68, 0.2) 70%, transparent 80%)',
            }}
          />
        )}
      </div>

      {/* Additional info below the circle */}
      <div className="mt-4 text-center">
        <div className="text-sm text-gray-600">
          {shiftStartTime && shiftEndTime && (
            <>
              Shift:{' '}
              {new Date(shiftStartTime).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })}{' '}
              -{' '}
              {new Date(shiftEndTime).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })}
            </>
          )}
          {shiftDurationMinutes && !shiftStartTime && (
            <>
              Expected Duration: {Math.floor(shiftDurationMinutes / 60)}h{' '}
              {shiftDurationMinutes % 60}m
            </>
          )}
        </div>
      </div>
    </div>
  );
}
