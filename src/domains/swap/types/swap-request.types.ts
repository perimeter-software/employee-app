/**
 * Shift swap — `swap-requests` collection.
 * Stored shape uses flat shift fields: `fromShiftSlug` / `fromShiftDate`, `toShiftSlug` / `toShiftDate`.
 */

export type SwapRequestType = 'swap' | 'giveaway' | 'pickup_interest';

export type SwapRequestStatus =
  | 'pending_match'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'expired';

export type SwapResolution = 'approved' | 'rejected' | 'expired' | null;

/** Roster / overlap helpers still use a day snapshot (derived from job + date). */
export type ShiftDaySnapshot = {
  date: string;
  dayOfWeek: string;
  start: string;
  end: string;
};

/** API + Mongo document shape (flat). */
export type SwapRequest = {
  _id: string;
  jobSlug: string;
  type: SwapRequestType;
  status: SwapRequestStatus;
  fromEmployeeId: string;
  fromShiftSlug: string;
  fromShiftDate: string;
  toEmployeeId?: string | null;
  toShiftSlug?: string | null;
  toShiftDate?: string | null;
  acceptAny: boolean;
  taggedOnly: boolean;
  notes?: string;
  submittedAt: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolution?: SwapResolution;
};

/** Peer offering a swap (willing list). Includes display snapshot when job resolves schedule. */
export type WillingSwapCandidate = {
  swapRequestId: string;
  employeeId: string;
  displayName: string;
  initials: string;
  fromShiftSlug: string;
  fromShiftDate: string;
  /** Enriched from job schedule for UI (times). */
  fromShiftDay: ShiftDaySnapshot;
  submittedAt: string;
};

export type WillingSwapCandidatesPage = {
  items: WillingSwapCandidate[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

/** Coworkers who tagged extra-work interest on this job/shift (Option 2 list). */
export type PickupInterestSeekerRow = {
  swapRequestId: string;
  employeeId: string;
  displayName: string;
  initials: string;
  /** YYYY-MM-DD they want extra work. */
  interestShiftDate: string;
  preferenceNote: string | null;
  submittedAt: string;
};

export type PickupInterestSeekersPage = {
  items: PickupInterestSeekerRow[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

/** One shift-day in range for “Pick up more shifts” (Option 3). */
export type PickupOpportunityRow = {
  shiftDate: string;
  shiftDay: ShiftDaySnapshot;
  shiftName: string | null;
  availableNow: boolean;
  claimable: boolean;
  giveawayRequestId: string | null;
  offererDisplayName: string | null;
  /** True when a giveaway is directed to someone other than the viewer. */
  directedToOther: boolean;
  /** True when the viewer is already on the roster for this shift-day. */
  viewerAlreadyAssigned: boolean;
};

export type PickupOpportunitiesResponse = {
  items: PickupOpportunityRow[];
  /** Hours of notice required for this job (`additionalConfig.swapBeforeHours` or 48). */
  swapBeforeHours: number;
};
