'use client';

import { useMutation } from '@tanstack/react-query';
import { baseInstance } from '@/lib/api/instance';

/**
 * Issues a short-lived QR clock-in code for the logged-in worker by calling
 * `POST /api/me/clock-in-qr`, which persists the OTP + expiry to the user
 * record and returns the `GIGQR1` payload the modal renders as a QR code.
 *
 * Called when the QR modal opens and again on every auto-refresh (the code is
 * only valid for 3 minutes).
 */

export interface ClockInQrData {
  payload: string;
  otp: string;
  issuedAt: string;
  expiresAt: string;
  eventId: string | null;
  geo: { lat: number; lng: number } | null;
}

export interface IssueClockInQrInput {
  eventId?: string;
  coordinates?: { latitude: number; longitude: number } | null;
}

export function useIssueClockInQr() {
  return useMutation<ClockInQrData, Error, IssueClockInQrInput>({
    mutationFn: async ({ eventId, coordinates }) => {
      const res = await baseInstance.post<ClockInQrData>('/me/clock-in-qr', {
        ...(eventId && { eventId }),
        ...(coordinates && { coordinates }),
      });
      if (!res.success || !res.data) {
        throw new Error('Failed to issue QR code');
      }
      return res.data;
    },
  });
}
