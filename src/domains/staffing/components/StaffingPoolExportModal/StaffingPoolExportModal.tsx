'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';
import type { StaffingFilter } from '../StaffingPoolModal/StaffingPoolModal';

const IMAGE_SERVER = process.env.NEXT_PUBLIC_IMAGE_SERVER ?? '';

type ExportField = { name: string; label: string };

const EXPORT_FIELDS: ExportField[] = [
  { name: 'employeeID',        label: 'Employee ID' },
  { name: 'employmentStatus',  label: 'Employment Status' },
  { name: 'primaryPosition',   label: 'Position' },
  { name: 'address1',          label: 'Address 1' },
  { name: 'notes',             label: 'Notes' },
  { name: 'birthDate',         label: 'Birth Date' },
  { name: 'city',              label: 'City' },
  { name: 'firstName',         label: 'Employee First Name' },
  { name: 'lastName',          label: 'Employee Last Name' },
  { name: 'phone',             label: 'Employee Phone Number' },
  { name: 'email',             label: 'Employee Email Address' },
  { name: 'hireDate',          label: 'Hire Date' },
];

const INITIAL_FIELDS = EXPORT_FIELDS.reduce<Record<string, boolean>>(
  (acc, f) => ({ ...acc, [f.name]: true }),
  {}
);

function FieldToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <span
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </span>
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  );
}

type Props = {
  open: boolean;
  venueSlug: string;
  venueName: string;
  filterMode: StaffingFilter;
  onClose: () => void;
};

export const StaffingPoolExportModal = ({
  open,
  venueSlug,
  venueName,
  filterMode,
  onClose,
}: Props) => {
  const { data: company } = usePrimaryCompany();
  const [fields, setFields] = useState<Record<string, boolean>>(INITIAL_FIELDS);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (open) setFields(INITIAL_FIELDS);
  }, [open]);

  const allSelected = Object.values(fields).every(Boolean);

  const toggleField = (name: string, value: boolean) => {
    setFields((prev) => ({ ...prev, [name]: value }));
  };

  const toggleAll = (value: boolean) => {
    setFields(EXPORT_FIELDS.reduce<Record<string, boolean>>((acc, f) => ({ ...acc, [f.name]: value }), {}));
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/venues/${venueSlug}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filterMode, fields }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.message || 'Export failed.');
        return;
      }
      const exportUrl: string = json.data?.exportUrl ?? json.data?.data?.exportUrl ?? '';
      if (exportUrl) {
        const base = IMAGE_SERVER && company?.uploadPath
          ? `${IMAGE_SERVER}/${company.uploadPath}`
          : IMAGE_SERVER;
        window.open(`${base}${exportUrl}`, '_blank');
      }
      toast.success('Your CSV is being prepared — it will open in a new tab.');
      onClose();
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Split fields into 3 columns
  const cols = [
    EXPORT_FIELDS.slice(0, 4),
    EXPORT_FIELDS.slice(4, 8),
    EXPORT_FIELDS.slice(8, 12),
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export {venueName} Staffing Pool</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-slate-500 -mt-1">Select Export Fields</p>

        <div className="grid grid-cols-3 gap-x-6 gap-y-2.5">
          {cols.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-2.5">
              {col.map((f) => (
                <FieldToggle
                  key={f.name}
                  label={f.label}
                  checked={!!fields[f.name]}
                  onChange={(v) => toggleField(f.name, v)}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <FieldToggle
            label="Select All"
            checked={allSelected}
            onChange={toggleAll}
          />
          <Button
            onClick={handleExport}
            disabled={exporting}
            className="bg-blue-600 text-white hover:bg-blue-700 h-8 text-xs"
          >
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
