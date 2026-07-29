// Types for the self-service "Privacy & My Data" surface (Right to Erasure /
// Right to Access, Surface B). Shapes mirror the backend integration guide
// (right-to-erasure-frontend-guide.md §2) exactly.

export type ErasureStatus =
  | 'pending'
  | 'running'
  | 'scheduled'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'cancelled';

export type ErasureSource = 'admin' | 'self-service';

// ── Right to access: GET /me/data-export ────────────────────────────────────

/**
 * One source entry. `records` is present only on some entries — an array for
 * personalData, but an object (e.g. `{ documentCount, keys }`) for external
 * systems — so it's typed `unknown` and narrowed at the use site.
 */
export interface DataExportEntry {
  source: string;
  recordCount: number;
  records?: unknown;
}

export interface DataExport {
  generatedAt: string;
  subjectId: string;
  personalData: DataExportEntry[];
  /** Aggregate only — retained under statutory payroll/tax retention. */
  financialRecords: DataExportEntry[];
  /** Existence/counts only — never contents. */
  externalSystems: DataExportEntry[];
  /** Non-empty even on 200 → some sources could not be read. */
  errors: unknown[];
}

// ── Screen state: GET /me/erasure-requests/current (or literal null) ─────────

export interface CurrentErasureRequest {
  requestId: string;
  status: ErasureStatus;
  source: ErasureSource;
  executeAfter: string | null;
  coolingOffDays: number | null;
  createdAt: string;
  completedAt: string | null;
  cancelledBy: 'self' | 'admin' | null;
  canCancel: boolean;
  /** null when not scheduled. Drive the countdown from this. */
  secondsUntilExecution: number | null;
}

// ── Impact preview: GET /me/erasure-requests/preview ─────────────────────────

export interface ErasurePreviewTotals {
  piiRecords: number;
  financialRecords: number;
  externalSystems: number;
}

export interface ErasurePreview {
  totals: ErasurePreviewTotals;
}

// ── Create: POST /me/erasure-requests ────────────────────────────────────────

export interface CreateErasureRequestInput {
  reason?: string;
  /** Audit-only echo of the typed value; not validated by the server. */
  confirm?: string;
}

export interface CreateErasureResult {
  requestId: string;
  status: ErasureStatus;
  executeAfter: string | null;
  coolingOffDays: number | null;
  token: string;
  queued?: boolean;
  /** true → a request was already in flight; treat as success. */
  alreadyExisted?: boolean;
}

export interface CancelErasureResult {
  requestId: string;
  status: ErasureStatus;
}

export const isActive = (s?: ErasureStatus): boolean =>
  s === 'pending' || s === 'running' || s === 'scheduled';
