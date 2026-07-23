// Types for the self-service "Privacy & My Data" surface (Right to Erasure,
// Surface B). The erasure request/certificate shape is intentionally identical
// to gignology-v4's admin types — per the plan, both apps talk to the same
// `erasure-requests` collection on gig-v4-backend.

export type ErasureStatus =
  | 'pending'
  | 'running'
  | 'scheduled'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'cancelled'
  | 'dry_run_completed';

export type ErasureSource = 'admin' | 'self-service';

export interface ErasureRequest {
  id: string;
  subjectId: string;
  subjectToken: string;
  status: ErasureStatus;
  source: ErasureSource;
  reason: string;
  executeAfter?: string | null;
  coolingOffDays?: number;
  cancelledBy?: { actor: 'self' | 'admin'; at: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateErasureRequestInput {
  reason?: string;
  /** UX guard — the typed-to-confirm value; identity always comes from the token. */
  confirm?: string;
}

/** One plain-language section of the "what we store about you" view. */
export interface DataAccessSection {
  key: string;
  title: string;
  /** Why we hold this data. */
  purpose: string;
  /** Human-readable items (label + value/summary). */
  items: { label: string; value: string }[];
}

export interface DataAccessSummary {
  subjectId: string;
  generatedAt: string;
  sections: DataAccessSection[];
}

export const TERMINAL_STATUSES: ReadonlySet<ErasureStatus> = new Set<ErasureStatus>([
  'completed',
  'completed_with_errors',
  'failed',
  'cancelled',
  'dry_run_completed',
]);

export const isTerminal = (s?: ErasureStatus): boolean => !!s && TERMINAL_STATUSES.has(s);

export const isActive = (s?: ErasureStatus): boolean =>
  s === 'pending' || s === 'running' || s === 'scheduled';
