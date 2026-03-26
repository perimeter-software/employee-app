export type SwapRequestType = 'swap' | 'giveaway' | 'pickup';

export type SwapRequestStatus =
  | 'draft'
  | 'pending_match'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'withdrawn';

export type SwapRequestResolution = {
  reason?: string;
  notes?: string;
};

export type SwapRequest = {
  _id: string;
  tenantId: string;
  type: SwapRequestType;
  status: SwapRequestStatus;
  fromEmployeeId: string;
  fromShiftDayId?: string;
  toEmployeeId?: string;
  toShiftDayId?: string;
  acceptAny?: boolean;
  taggedOnly?: boolean;
  notes?: string;
  submittedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: SwapRequestResolution;
};
