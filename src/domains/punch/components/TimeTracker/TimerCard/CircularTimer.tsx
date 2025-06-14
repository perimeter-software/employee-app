"use client";

import React from "react";

interface CircularTimerProps {
  time: string;
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
  // Simplified - only show countdown when shift is very close
  timeUntilShift?: number; // minutes until shift starts
}

export function CircularTimer({
  time,
  isActive,
  onClick,
  disabled,
  timeUntilShift,
}: CircularTimerProps) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = circumference;

  // Only show progress for countdown when shift starts very soon (within 15 minutes)
  let strokeDashoffset = circumference; // Default: no progress
  let progressColor = "#40C8FD"; // Your brand blue
  let showProgress = false;

  if (
    timeUntilShift !== undefined &&
    timeUntilShift <= 15 &&
    timeUntilShift > 0
  ) {
    // Show countdown progress only when shift is starting very soon
    const countdownProgress = ((15 - timeUntilShift) / 15) * 100;
    strokeDashoffset =
      circumference - (countdownProgress / 100) * circumference;
    progressColor = "#F59E0B"; // Orange/yellow for countdown
    showProgress = true;
  }

  // Format current time with AM/PM
  const formatCurrentTime = (timeString: string) => {
    if (isActive) {
      return timeString; // Return elapsed time as-is when active
    }

    // For inactive state, show current time with AM/PM
    const now = new Date();
    return now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Get status text based on state
  const getStatusText = () => {
    if (disabled) return "UNAVAILABLE";
    if (
      timeUntilShift !== undefined &&
      timeUntilShift <= 15 &&
      timeUntilShift > 0
    ) {
      return `SHIFT IN ${timeUntilShift}m`;
    }
    if (timeUntilShift === 0) return "SHIFT READY";
    return "CLOCK IN";
  };

  // Get status color
  const getStatusColor = () => {
    if (disabled) return "text-gray-400";
    if (
      timeUntilShift !== undefined &&
      timeUntilShift <= 15 &&
      timeUntilShift > 0
    ) {
      return "text-orange-600";
    }
    if (timeUntilShift === 0) return "text-green-600";
    return "text-gray-600";
  };

  return (
    <div className="text-center mb-6">
      <div
        className={`relative w-72 h-72 mx-auto transition-all duration-200 ${
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "cursor-pointer hover:scale-105"
        }`}
        onClick={disabled ? undefined : onClick}
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

          {/* Progress circle - only show for countdown */}
          {showProgress && (
            <circle
              cx="50"
              cy="50"
              r={radius}
              stroke={progressColor}
              strokeWidth="6"
              fill="none"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-1000 ease-in-out"
              strokeLinecap="round"
            />
          )}

          {/* Simple clock indicators - only show when not in countdown mode */}
          {!showProgress &&
            [0, 15, 30, 45].map((tick) => {
              const angle = (tick / 60) * 2 * Math.PI - Math.PI / 2;
              const x1 = 50 + (radius - 4) * Math.cos(angle);
              const y1 = 50 + (radius - 4) * Math.sin(angle);
              const x2 = 50 + (radius - 1) * Math.cos(angle);
              const y2 = 50 + (radius - 1) * Math.sin(angle);

              return (
                <line
                  key={tick}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#D1D5DB"
                  strokeWidth="2"
                  opacity="0.6"
                />
              );
            })}
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {/* Time display */}
          <div
            className={`text-3xl font-bold mb-2 ${
              disabled ? "text-gray-400" : "text-gray-900"
            }`}
          >
            {formatCurrentTime(time)}
          </div>

          {/* Action/Status text */}
          <div className={`text-lg font-semibold ${getStatusColor()}`}>
            {getStatusText()}
          </div>
        </div>

        {/* Pulse effect for very imminent shifts (within 5 minutes) */}
        {timeUntilShift !== undefined &&
          timeUntilShift <= 5 &&
          timeUntilShift > 0 && (
            <div className="absolute inset-0 rounded-full border-4 border-orange-400 animate-ping opacity-20" />
          )}

        {/* Ready indicator when shift time arrives */}
        {timeUntilShift === 0 && (
          <div className="absolute inset-0 rounded-full border-4 border-green-400 animate-pulse" />
        )}
      </div>

      {/* Additional info below the circle - only show if relevant */}
      {timeUntilShift !== undefined && timeUntilShift > 15 && (
        <div className="mt-2 text-center">
          <div className="text-sm text-gray-600">
            Shift starts in {Math.floor(timeUntilShift / 60)}h{" "}
            {timeUntilShift % 60}m
          </div>
        </div>
      )}
    </div>
  );
}
