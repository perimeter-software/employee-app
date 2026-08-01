'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { baseInstance } from '@/lib/api/instance';

export type StaffingEmployee = {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  employmentStatus?: string;
  loginVerified?: string;
  profileImg?: string;
  userId?: string;
};

type Props = {
  employee: StaffingEmployee;
  venueSlug: string;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

const EMPLOYMENT_STATUSES = ['Active', 'Inactive', 'Terminated'] as const;

const ReadOnlyField = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-xs text-slate-500 mb-0.5">{label}</p>
    <p className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
      {value || '—'}
    </p>
  </div>
);

export const EmployeeViewModal = ({ employee, venueSlug, open, onClose, onSaved }: Props) => {
  const [employmentStatus, setEmploymentStatus] = useState(
    employee.employmentStatus && EMPLOYMENT_STATUSES.includes(employee.employmentStatus as typeof EMPLOYMENT_STATUSES[number])
      ? employee.employmentStatus
      : EMPLOYMENT_STATUSES[0]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = employmentStatus !== employee.employmentStatus;

  const handleSave = async () => {
    if (!isDirty) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    const res = await baseInstance.patch<{ success: boolean; message?: string }>(
      `venues/${venueSlug}/employees/${employee._id}`,
      { employmentStatus }
    );
    setSaving(false);
    if (!res.success) {
      setError((res as { message?: string }).message ?? 'Failed to save.');
      return;
    }
    onSaved?.();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Employee</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <ReadOnlyField label="First Name" value={employee.firstName} />
          <ReadOnlyField label="Last Name" value={employee.lastName} />
          <ReadOnlyField label="Email" value={employee.email ?? ''} />
          <ReadOnlyField label="Phone" value={employee.phone ?? ''} />
        </div>

        <div className="pt-1">
          <p className="text-xs text-slate-500 mb-0.5">Employment Status</p>
          <select
            value={employmentStatus}
            onChange={(e) => setEmploymentStatus(e.target.value)}
            className="w-full text-sm text-slate-800 bg-white border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-appPrimary/30"
            aria-label="Employment Status"
          >
            {EMPLOYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
