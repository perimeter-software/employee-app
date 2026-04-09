import 'server-only';

import { NextResponse } from 'next/server';
import type { Db, Document } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';
import type {
  ShiftDaySnapshot,
  SwapRequestStatus,
  SwapRequestType,
  SwapResolution,
} from '@/domains/swap/types';
import {
  applyGiveawayToRoster,
  applySwapToRosters,
  assigneeHasScheduleConflictForShiftDay,
  findJobByJobSlug,
  rosterEntryMatches,
  toDayKey,
  validateGiveawayOverlap,
  validateSwapOverlap,
} from '@/domains/swap/utils/swap-roster-utils';
import {
  buildShiftDaySnapshotFromJob,
  dayKeyFromYmd,
  enrichShiftDayFromSchedule,
  getFromShiftDate,
  getFromShiftSlug,
  getToShiftDate,
  getToShiftSlug,
  normalizeResolutionForApi,
  resolveFromShiftDaySnapshot,
  resolveToShiftDaySnapshot,
  type SwapRequestStoredDoc,
} from '@/domains/swap/utils/swap-request-doc-utils';
import type { GignologyJob } from '@/domains/job/types/job.types';
import type { RosterEntry } from '@/domains/job/types/schedule.types';
import {
  notifyGiveawayClaimedByPeer,
  notifyPickupSeekersOfOpenGiveaway,
  notifySwapAcceptedByPeer,
  notifySwapApprovedByAdmin,
  notifySwapRejectedByAdmin,
  notifySwapRequestCreated,
} from '@/domains/swap/services/swap-notifications';

const COLLECTION = 'swap-requests' as const;
const MAX_NOTES_LENGTH = 5000;
const ADMIN_USER_TYPES = new Set(['Admin', 'Master']);

export class SwapRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number = 400
  ) {
    super(message);
    this.name = 'SwapRequestError';
  }
}

type SwapRequestDoc = {
  _id: ObjectId;
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
  submittedAt: Date;
  resolvedAt?: Date | null;
  resolvedBy?: string | null;
  resolution?: SwapResolution | '' | null;
};

export type CreateSwapRequestInput = {
  jobSlug: string;
  type: SwapRequestType;
  fromShiftSlug: string;
  fromShiftDate: string;
  toEmployeeId?: string | null;
  toShiftSlug?: string | null;
  toShiftDate?: string | null;
  acceptAny?: boolean;
  taggedOnly?: boolean;
  notes?: string;
  /** Legacy JSON body */
  shiftSlug?: string;
  fromShiftDay?: ShiftDaySnapshot;
  toShiftDay?: ShiftDaySnapshot | null;
  /**
   * With `type: 'pickup_interest'`, consume this open giveaway (`pending_match`) and
   * insert a full `pickup_interest` row (`pending_approval`, `to*` = giver / slot).
   */
  matchGiveawayId?: string;
};

export type AcceptSwapRequestInput = {
  toShiftDay?: ShiftDaySnapshot;
  toShiftSlug?: string | null;
  toShiftDate?: string | null;
  /** Appended to existing request notes when accepting (optional). */
  notes?: string;
};

export type RejectSwapRequestInput = {
  reason?: string;
};

export type ListSwapRequestsQuery = {
  employeeId?: string | null;
  status?: string | null;
};

/** Event cover rows in `swap-requests` carry non-empty `eventUrl`; job swaps omit it. */
function isEventCoverSwapRow(doc: unknown): boolean {
  const o = doc as { eventUrl?: unknown };
  return typeof o.eventUrl === 'string' && o.eventUrl.trim() !== '';
}

function mergeExcludeEventCoverRows(
  base: Record<string, unknown>
): Record<string, unknown> {
  const notCover = {
    $or: [
      { eventUrl: { $exists: false } },
      { eventUrl: null },
      { eventUrl: '' },
    ],
  };
  if (Object.keys(base).length === 0) {
    return notCover;
  }
  return { $and: [base, notCover] };
}

function getEmployeeIdFromUser(user: AuthenticatedRequest['user']): string {
  if (user.applicantId) return String(user.applicantId);
  if (user.userId) return String(user.userId);
  if (user._id) return String(user._id);
  return '';
}

export function isSwapRequestAdmin(user: AuthenticatedRequest['user']): boolean {
  return ADMIN_USER_TYPES.has(String(user.userType));
}

function assertNotClient(user: AuthenticatedRequest['user']): void {
  if (user.userType === 'Client') {
    throw new SwapRequestError(
      'unauthorized',
      'Access denied. Employee account required.',
      403
    );
  }
}

function assertShiftDayNotPast(dateStr: string): void {
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (dateStr < ymd) {
    throw new SwapRequestError(
      'past-shift-day',
      'Swap is not available for past shift-days.',
      400
    );
  }
}

function assertSwapLeadTimeAtLeastHours(
  shiftStartIso: string,
  minLeadHours: number
): void {
  const startMs = Date.parse(shiftStartIso);
  if (Number.isNaN(startMs)) return;
  const nowMs = Date.now();
  const hoursUntilShift = (startMs - nowMs) / (1000 * 60 * 60);
  if (hoursUntilShift < minLeadHours) {
    throw new SwapRequestError(
      'swap-window-closed',
      `Swap is only available ${minLeadHours}+ hours before shift start.`,
      400
    );
  }
}

function normalizeNotes(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  if (t.length > MAX_NOTES_LENGTH) {
    throw new SwapRequestError(
      'notes-too-long',
      `Notes must be at most ${MAX_NOTES_LENGTH} characters.`,
      400
    );
  }
  return t;
}

function parseObjectId(id: string): ObjectId {
  if (!id || !ObjectId.isValid(id)) {
    throw new SwapRequestError('invalid-id', 'Invalid swap request id.', 400);
  }
  return new ObjectId(id);
}

export function swapRequestErrorResponse(error: unknown): NextResponse {
  if (error instanceof SwapRequestError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.httpStatus }
    );
  }
  if (error instanceof Error && error.message.startsWith('overlap:')) {
    return NextResponse.json(
      { error: 'overlap', message: error.message },
      { status: 400 }
    );
  }
  console.error('[swap-request-service]', error);
  return NextResponse.json(
    {
      error: 'internal-error',
      message: 'Internal server error',
      details: error instanceof Error ? error.message : String(error),
    },
    { status: 500 }
  );
}

function toPublic(doc: SwapRequestDoc | SwapRequestStoredDoc | null): object | null {
  if (!doc || typeof doc !== 'object') return null;
  const stored = doc as SwapRequestStoredDoc;
  const j = convertToJSON(doc as unknown as Document) as Record<string, unknown>;
  const resolution = normalizeResolutionForApi(
    j.resolution != null ? String(j.resolution) : ''
  );
  const rawAcceptAny = Boolean(j.acceptAny);
  const toIdRaw = j.toEmployeeId;
  const hasNamedPeer =
    toIdRaw != null && String(toIdRaw).trim() !== '';
  /** Matched swaps must not stay `acceptAny` (legacy rows + accept path bug). */
  const acceptAny =
    j.type === 'swap' ? rawAcceptAny && !hasNamedPeer : rawAcceptAny;

  return {
    _id: j._id,
    type: j.type,
    jobSlug: j.jobSlug,
    status: j.status,
    fromEmployeeId: j.fromEmployeeId,
    fromShiftSlug: getFromShiftSlug(stored),
    fromShiftDate: getFromShiftDate(stored),
    toEmployeeId: j.toEmployeeId ?? null,
    toShiftSlug: getToShiftSlug(stored),
    toShiftDate: getToShiftDate(stored),
    acceptAny,
    taggedOnly: Boolean(j.taggedOnly),
    ...(j.notes != null && j.notes !== '' ? { notes: j.notes } : {}),
    submittedAt: j.submittedAt,
    resolvedAt: j.resolvedAt ?? null,
    resolvedBy: j.resolvedBy ?? null,
    resolution,
  };
}

function assertInitiatorOnRoster(
  job: GignologyJob,
  shiftSlug: string,
  fromEmployeeId: string,
  from: ShiftDaySnapshot
): void {
  const shift = job.shifts?.find((s) => s.slug === shiftSlug);
  const dk = toDayKey(from.dayOfWeek);
  if (!shift?.defaultSchedule || !dk) {
    throw new SwapRequestError('invalid-shift', 'Shift or schedule not found.', 400);
  }
  const roster = shift.defaultSchedule[dk]?.roster;
  if (!Array.isArray(roster)) {
    throw new SwapRequestError('invalid-roster', 'No roster for this day.', 400);
  }
  const ok = roster.some((e) =>
    rosterEntryMatches(e as string | RosterEntry, fromEmployeeId, from.date)
  );
  if (!ok) {
    throw new SwapRequestError(
      'not-on-roster',
      'You are not assigned to this shift-day.',
      400
    );
  }
}

function initialStatus(
  type: SwapRequestType,
  taggedOnly: boolean,
  giveawayRecipientId: string | null
): SwapRequestStatus {
  if (type === 'pickup_interest' && taggedOnly === false) {
    return 'pending_approval';
  }
  if (type === 'giveaway' && giveawayRecipientId) {
    return 'pending_approval';
  }
  return 'pending_match';
}

/**
 * Pick Up + `matchGiveawayId` (Available now): inserts `pickup_interest` / `pending_approval`
 * with `from*` = claimant, `to*` = giveaway offerer, same shift slug+date on both sides;
 * then closes the open giveaway so it no longer appears as available.
 */
async function createPickupInterestFromMatchedGiveaway(
  db: Db,
  user: AuthenticatedRequest['user'],
  input: CreateSwapRequestInput,
  matchGiveawayId: string
): Promise<object | null> {
  assertNotClient(user);

  const claimantId = getEmployeeIdFromUser(user);
  if (!claimantId) {
    throw new SwapRequestError(
      'missing-identifiers',
      'Missing employee identifier.',
      400
    );
  }

  const jobSlug = input.jobSlug?.trim();
  const fromShiftSlug = (
    input.fromShiftSlug?.trim() ||
    input.shiftSlug?.trim() ||
    ''
  ).trim();
  const fromShiftDate = (
    input.fromShiftDate?.trim() ||
    input.fromShiftDay?.date?.trim() ||
    ''
  ).trim();

  if (!jobSlug || !fromShiftSlug || !fromShiftDate) {
    throw new SwapRequestError(
      'missing-job-shift',
      'jobSlug, fromShiftSlug, and fromShiftDate are required.',
      400
    );
  }

  assertShiftDayNotPast(fromShiftDate);

  const job = await findJobByJobSlug(db, jobSlug);
  if (!job) {
    throw new SwapRequestError('job-not-found', 'Job not found.', 404);
  }

  let fromSnap: ShiftDaySnapshot | null = null;
  if (input.fromShiftDay?.date && input.fromShiftDay?.dayOfWeek) {
    fromSnap = enrichShiftDayFromSchedule(job, fromShiftSlug, input.fromShiftDay);
  } else {
    fromSnap = buildShiftDaySnapshotFromJob(job, fromShiftSlug, fromShiftDate);
  }
  if (!fromSnap) {
    throw new SwapRequestError(
      'invalid-from-shift',
      'Could not resolve shift-day from schedule.',
      400
    );
  }

  const configuredSwapHours = Number(job.additionalConfig?.swapBeforeHours);
  const minSwapLeadHours =
    Number.isFinite(configuredSwapHours) && configuredSwapHours >= 0
      ? configuredSwapHours
      : 48;
  assertSwapLeadTimeAtLeastHours(fromSnap.start, minSwapLeadHours);

  const col = db.collection<SwapRequestDoc>(COLLECTION);
  const gid = parseObjectId(matchGiveawayId);
  const giveaway = await col.findOne({ _id: gid });

  if (
    !giveaway ||
    giveaway.type !== 'giveaway' ||
    giveaway.status !== 'pending_match'
  ) {
    throw new SwapRequestError(
      'giveaway-unavailable',
      'That shift offer is no longer available.',
      400
    );
  }

  const gStored = giveaway as unknown as SwapRequestStoredDoc;
  const gSlug = getFromShiftSlug(gStored);
  const gDate = getFromShiftDate(gStored);
  if (
    giveaway.jobSlug !== jobSlug ||
    gSlug !== fromShiftSlug ||
    gDate !== fromShiftDate
  ) {
    throw new SwapRequestError(
      'giveaway-mismatch',
      'This offer does not match the selected shift-day.',
      400
    );
  }

  const giverId = String(giveaway.fromEmployeeId);
  if (giverId === String(claimantId)) {
    throw new SwapRequestError(
      'invalid-target',
      'You cannot accept your own offer.',
      400
    );
  }

  const directedTo =
    giveaway.toEmployeeId != null && String(giveaway.toEmployeeId).trim() !== ''
      ? String(giveaway.toEmployeeId)
      : null;
  if (directedTo && directedTo !== String(claimantId)) {
    throw new SwapRequestError(
      'unauthorized',
      'This offer is assigned to someone else.',
      403
    );
  }

  const dupPickup = await col.findOne({
    jobSlug,
    fromEmployeeId: claimantId,
    fromShiftSlug,
    fromShiftDate,
    type: 'pickup_interest',
    status: { $in: ['pending_match', 'pending_approval'] },
  });
  if (dupPickup) {
    throw new SwapRequestError(
      'duplicate-pickup-interest',
      'You already have an open pickup interest for this shift-day.',
      400
    );
  }

  assertInitiatorOnRoster(job, fromShiftSlug, giverId, fromSnap);

  try {
    validateGiveawayOverlap(job, fromShiftSlug, claimantId, fromSnap);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('overlap:')) {
      throw new SwapRequestError(
        'overlap',
        e.message.replace(/^overlap:\s*/i, '').trim(),
        400
      );
    }
    throw e;
  }

  const supersedeNote =
    '[withdrawn: open offer matched — replaced by employee pickup request]';
  const prevNotes =
    giveaway.notes != null && String(giveaway.notes).trim() !== ''
      ? String(giveaway.notes).trim()
      : '';
  const gNotes = prevNotes ? `${prevNotes}\n${supersedeNote}` : supersedeNote;

  const closed = await col.findOneAndUpdate(
    {
      _id: gid,
      type: 'giveaway',
      status: 'pending_match',
    },
    {
      $set: {
        status: 'rejected',
        resolution: 'rejected',
        resolvedAt: new Date(),
        resolvedBy: claimantId,
        notes: gNotes,
      },
    },
    { returnDocument: 'after' }
  );

  if (!closed) {
    throw new SwapRequestError(
      'giveaway-unavailable',
      'That shift offer was already taken.',
      409
    );
  }

  const notes = normalizeNotes(input.notes);
  /** Claimant = from*, original offerer = to*; same slug/date on both sides for this slot. */
  const doc: SwapRequestDoc = {
    _id: new ObjectId(),
    jobSlug,
    type: 'pickup_interest',
    status: 'pending_approval',
    fromEmployeeId: claimantId,
    fromShiftSlug,
    fromShiftDate,
    toEmployeeId: giverId,
    toShiftSlug: fromShiftSlug,
    toShiftDate: fromShiftDate,
    acceptAny: false,
    taggedOnly: true,
    ...(notes ? { notes } : {}),
    submittedAt: new Date(),
    resolvedAt: null,
    resolvedBy: null,
    resolution: null,
  };

  await col.insertOne(doc);

  await notifyGiveawayClaimedByPeer(db, {
    type: 'giveaway',
    status: 'pending_approval',
    jobSlug,
    fromEmployeeId: giverId,
    fromShiftSlug,
    fromShiftDate,
    toEmployeeId: claimantId,
  });

  const created = await col.findOne({ _id: doc._id });
  return toPublic(created);
}

export async function createSwapRequest(
  db: Db,
  user: AuthenticatedRequest['user'],
  input: CreateSwapRequestInput
): Promise<object | null> {
  assertNotClient(user);

  const fromEmployeeId = getEmployeeIdFromUser(user);
  if (!fromEmployeeId) {
    throw new SwapRequestError(
      'missing-identifiers',
      'Missing employee identifier.',
      400
    );
  }

  const jobSlug = input.jobSlug?.trim();
  const fromShiftSlug = (
    input.fromShiftSlug?.trim() ||
    input.shiftSlug?.trim() ||
    ''
  ).trim();
  const fromShiftDate = (
    input.fromShiftDate?.trim() ||
    input.fromShiftDay?.date?.trim() ||
    ''
  ).trim();

  if (!jobSlug || !fromShiftSlug || !fromShiftDate) {
    throw new SwapRequestError(
      'missing-job-shift',
      'jobSlug, fromShiftSlug, and fromShiftDate are required.',
      400
    );
  }

  const type = input.type;
  if (!['swap', 'giveaway', 'pickup_interest'].includes(type)) {
    throw new SwapRequestError('invalid-type', 'Invalid type.', 400);
  }

  const matchGiveawayId = input.matchGiveawayId?.trim();
  if (matchGiveawayId) {
    if (type !== 'pickup_interest') {
      throw new SwapRequestError(
        'invalid-input',
        'matchGiveawayId may only be used with type pickup_interest.',
        400
      );
    }
    return createPickupInterestFromMatchedGiveaway(
      db,
      user,
      input,
      matchGiveawayId
    );
  }

  assertShiftDayNotPast(fromShiftDate);

  const job = await findJobByJobSlug(db, jobSlug);
  if (!job) {
    throw new SwapRequestError('job-not-found', 'Job not found.', 404);
  }

  let fromSnap: ShiftDaySnapshot | null = null;
  if (input.fromShiftDay?.date && input.fromShiftDay?.dayOfWeek) {
    fromSnap = enrichShiftDayFromSchedule(job, fromShiftSlug, input.fromShiftDay);
  } else {
    fromSnap = buildShiftDaySnapshotFromJob(job, fromShiftSlug, fromShiftDate);
  }
  if (!fromSnap) {
    throw new SwapRequestError(
      'invalid-from-shift',
      'Could not resolve initiator shift-day from schedule.',
      400
    );
  }
  const configuredSwapHours = Number(job.additionalConfig?.swapBeforeHours);
  const minSwapLeadHours =
    Number.isFinite(configuredSwapHours) && configuredSwapHours >= 0
      ? configuredSwapHours
      : 48;

  const col = db.collection<SwapRequestDoc>(COLLECTION);
  const priorEndedForThisShiftDay = await col.findOne({
    jobSlug,
    fromEmployeeId,
    fromShiftSlug,
    fromShiftDate,
    status: { $in: ['rejected', 'expired'] },
  });

  if (!priorEndedForThisShiftDay) {
    assertSwapLeadTimeAtLeastHours(fromSnap.start, minSwapLeadHours);
  }

  if (type === 'pickup_interest') {
    const dupPickup = await col.findOne({
      jobSlug,
      fromEmployeeId,
      fromShiftSlug,
      fromShiftDate,
      type: 'pickup_interest',
      status: { $in: ['pending_match', 'pending_approval'] },
    });
    if (dupPickup) {
      throw new SwapRequestError(
        'duplicate-pickup-interest',
        'You already have an open pickup interest for this shift-day.',
        400
      );
    }
    try {
      validateGiveawayOverlap(job, fromShiftSlug, fromEmployeeId, fromSnap);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('overlap:')) {
        throw new SwapRequestError(
          'overlap',
          e.message.replace(/^overlap:\s*/i, '').trim(),
          400
        );
      }
      throw e;
    }
  }

  if (type === 'giveaway') {
    const dupGiveaway = await col.findOne({
      jobSlug,
      fromEmployeeId,
      fromShiftSlug,
      fromShiftDate,
      type: 'giveaway',
      status: { $in: ['pending_match', 'pending_approval'] },
    });
    if (dupGiveaway) {
      throw new SwapRequestError(
        'duplicate-giveaway',
        'You already have an open giveaway or pending offer for this shift-day.',
        400
      );
    }
  }

  if (type === 'swap' || type === 'giveaway') {
    assertInitiatorOnRoster(job, fromShiftSlug, fromEmployeeId, fromSnap);
  }

  let toShiftSlug: string | null =
    input.toShiftSlug?.trim() || input.shiftSlug?.trim() || null;
  let toShiftDate: string | null =
    input.toShiftDate?.trim() || input.toShiftDay?.date?.trim() || null;
  if (toShiftSlug === '') toShiftSlug = null;
  if (toShiftDate === '') toShiftDate = null;

  if (type === 'swap') {
    const toId = input.toEmployeeId?.trim();
    if (!toId && !input.acceptAny) {
      throw new SwapRequestError(
        'missing-target',
        'toEmployeeId is required for swap unless acceptAny is true.',
        400
      );
    }
    if (toId && toId === fromEmployeeId) {
      throw new SwapRequestError('invalid-target', 'Cannot swap with yourself.', 400);
    }
    if (toId && input.toShiftDay && (!input.toShiftDay.date || !input.toShiftDay.dayOfWeek)) {
      throw new SwapRequestError(
        'invalid-to-shift-day',
        'toShiftDay must include date and dayOfWeek.',
        400
      );
    }
    if (toId && input.toShiftDay?.date) {
      toShiftSlug = toShiftSlug || fromShiftSlug;
      toShiftDate = toShiftDate || input.toShiftDay.date;
    }
  }

  const directedToId = input.toEmployeeId?.trim() || null;

  if (type === 'giveaway') {
    const wantsOpenOffer = Boolean(input.acceptAny);
    if (wantsOpenOffer && directedToId) {
      throw new SwapRequestError(
        'invalid-input',
        'An open giveaway cannot name a specific employee.',
        400
      );
    }
    if (!wantsOpenOffer && !directedToId) {
      throw new SwapRequestError(
        'missing-target',
        'Select a coworker with pickup interest, or choose an open offer for any eligible employee.',
        400
      );
    }
    if (wantsOpenOffer && !directedToId) {
      toShiftSlug = null;
      toShiftDate = null;
    }
  }

  if (type === 'swap' && directedToId && toShiftSlug && toShiftDate) {
    const toSnapDirected = buildShiftDaySnapshotFromJob(
      job,
      toShiftSlug,
      toShiftDate
    );
    if (!toSnapDirected) {
      throw new SwapRequestError(
        'invalid-to-shift',
        'Could not resolve the other shift-day for overlap check.',
        400
      );
    }
    try {
      validateSwapOverlap(
        job,
        fromShiftSlug,
        fromEmployeeId,
        directedToId,
        fromSnap,
        toSnapDirected
      );
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('overlap:')) {
        throw new SwapRequestError(
          'overlap',
          e.message.replace(/^overlap:\s*/i, '').trim(),
          400
        );
      }
      throw e;
    }
  }

  if (type === 'giveaway' && directedToId) {
    if (!toShiftSlug) {
      toShiftSlug = fromShiftSlug;
    }
    try {
      validateGiveawayOverlap(
        job,
        fromShiftSlug,
        directedToId,
        fromSnap
      );
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('overlap:')) {
        throw new SwapRequestError(
          'overlap',
          e.message.replace(/^overlap:\s*/i, '').trim(),
          400
        );
      }
      throw e;
    }
  }

  const taggedOnly = Boolean(input.taggedOnly);
  const acceptAny =
    type === 'swap' || type === 'giveaway'
      ? Boolean(input.acceptAny) && !directedToId
      : Boolean(input.acceptAny);
  const notes = normalizeNotes(input.notes);
  const status = initialStatus(
    type,
    taggedOnly,
    type === 'giveaway' ? directedToId : null
  );

  const doc: SwapRequestDoc = {
    _id: new ObjectId(),
    jobSlug,
    type,
    status,
    fromEmployeeId,
    fromShiftSlug,
    fromShiftDate,
    toEmployeeId: input.toEmployeeId?.trim() || null,
    toShiftSlug,
    toShiftDate,
    acceptAny,
    taggedOnly,
    ...(notes ? { notes } : {}),
    submittedAt: new Date(),
    resolvedAt: null,
    resolvedBy: null,
    resolution: null,
  };

  await col.insertOne(doc);

  const created = await col.findOne({ _id: doc._id });
  if (created) {
    await notifySwapRequestCreated(db, created);
    const openGiveaway =
      created.type === 'giveaway' &&
      (created.toEmployeeId == null ||
        String(created.toEmployeeId).trim() === '');
    if (openGiveaway) {
      await notifyPickupSeekersOfOpenGiveaway(db, created);
    }
  }
  return toPublic(created);
}

export async function listSwapRequests(
  db: Db,
  user: AuthenticatedRequest['user'],
  query: ListSwapRequestsQuery
): Promise<object[]> {
  const isAdmin = isSwapRequestAdmin(user);
  const filter: Record<string, unknown> = {};

  if (isAdmin) {
    if (query.status?.trim()) {
      filter.status = query.status.trim();
    }
    if (query.employeeId?.trim()) {
      const eid = query.employeeId.trim();
      filter.$or = [{ fromEmployeeId: eid }, { toEmployeeId: eid }];
    }
  } else {
    const uid = getEmployeeIdFromUser(user);
    if (!uid) {
      throw new SwapRequestError(
        'missing-identifiers',
        'Missing employee identifier.',
        400
      );
    }
    filter.$or = [{ fromEmployeeId: uid }, { toEmployeeId: uid }];
    if (query.status) {
      throw new SwapRequestError(
        'unauthorized',
        'Only administrators can filter by status.',
        403
      );
    }
  }

  const rows = await db
    .collection<SwapRequestDoc>(COLLECTION)
    .find(mergeExcludeEventCoverRows(filter))
    .sort({ submittedAt: -1 })
    .toArray();

  return rows.map((r) => toPublic(r) as object);
}

export async function acceptSwapRequest(
  db: Db,
  user: AuthenticatedRequest['user'],
  id: string,
  body: AcceptSwapRequestInput
): Promise<object | null> {
  assertNotClient(user);
  const employeeId = getEmployeeIdFromUser(user);
  if (!employeeId) {
    throw new SwapRequestError(
      'missing-identifiers',
      'Missing employee identifier.',
      400
    );
  }

  const _id = parseObjectId(id);
  const col = db.collection<SwapRequestDoc>(COLLECTION);
  const existing = await col.findOne({ _id });
  if (!existing) {
    throw new SwapRequestError('not-found', 'Swap request not found.', 404);
  }

  if (isEventCoverSwapRow(existing)) {
    throw new SwapRequestError(
      'wrong-request-kind',
      'This request is an event cover. Open it from Events / notifications to respond.',
      400
    );
  }

  if (existing.status !== 'pending_match') {
    throw new SwapRequestError(
      'invalid-status',
      'Only pending_match requests can be accepted.',
      400
    );
  }

  if (existing.type !== 'swap') {
    throw new SwapRequestError(
      'invalid-type',
      'Only swap requests can be accepted this way.',
      400
    );
  }

  if (existing.fromEmployeeId === employeeId) {
    throw new SwapRequestError(
      'invalid-target',
      'You cannot accept your own swap offer.',
      400
    );
  }

  if (existing.toEmployeeId && existing.toEmployeeId !== employeeId) {
    throw new SwapRequestError(
      'unauthorized',
      'Only the targeted employee can accept.',
      403
    );
  }

  const job = await findJobByJobSlug(db, existing.jobSlug);
  if (!job) {
    throw new SwapRequestError('job-not-found', 'Job not found.', 404);
  }

  const stored = existing as unknown as SwapRequestStoredDoc;
  const fromSlug = getFromShiftSlug(stored);
  const fromDate = getFromShiftDate(stored);

  let toShiftSlug: string | null =
    body.toShiftSlug?.trim() || getToShiftSlug(stored);
  let toShiftDate: string | null =
    body.toShiftDate?.trim() || getToShiftDate(stored);

  if (body.toShiftDay?.date && body.toShiftDay?.dayOfWeek && job) {
    const enriched = enrichShiftDayFromSchedule(job, fromSlug, body.toShiftDay);
    toShiftSlug = toShiftSlug || fromSlug;
    toShiftDate = enriched.date;
  }

  if (!toShiftSlug || !toShiftDate) {
    throw new SwapRequestError(
      'missing-to-shift',
      'Swap accept requires toShiftSlug and toShiftDate (your shift-day you are trading).',
      400
    );
  }

  if (toShiftSlug !== fromSlug) {
    throw new SwapRequestError(
      'shift-mismatch',
      'Your shift must be the same job shift as the open offer.',
      400
    );
  }

  assertShiftDayNotPast(fromDate);
  assertShiftDayNotPast(toShiftDate);

  const fromSnap = buildShiftDaySnapshotFromJob(job, fromSlug, fromDate);
  const toSnap = buildShiftDaySnapshotFromJob(job, toShiftSlug, toShiftDate);
  if (!fromSnap || !toSnap) {
    throw new SwapRequestError(
      'invalid-shift',
      'Could not resolve shift-days from schedule.',
      400
    );
  }

  const configuredSwapHours = Number(job.additionalConfig?.swapBeforeHours);
  const minSwapLeadHours =
    Number.isFinite(configuredSwapHours) && configuredSwapHours >= 0
      ? configuredSwapHours
      : 48;
  assertSwapLeadTimeAtLeastHours(fromSnap.start, minSwapLeadHours);
  assertSwapLeadTimeAtLeastHours(toSnap.start, minSwapLeadHours);

  assertInitiatorOnRoster(job, toShiftSlug, employeeId, toSnap);

  try {
    validateSwapOverlap(
      job,
      fromSlug,
      existing.fromEmployeeId,
      employeeId,
      fromSnap,
      toSnap
    );
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('overlap:')) {
      throw new SwapRequestError(
        'overlap',
        e.message.replace(/^overlap:\s*/i, '').trim(),
        400
      );
    }
    throw e;
  }

  const extraNotes = normalizeNotes(body.notes);
  const mergedAcceptNotes =
    extraNotes != null
      ? existing.notes
        ? `${existing.notes}\n${extraNotes}`
        : extraNotes
      : undefined;

  const updated = await col.findOneAndUpdate(
    { _id, status: 'pending_match' },
    {
      $set: {
        toEmployeeId: employeeId,
        status: 'pending_approval',
        toShiftSlug,
        toShiftDate,
        acceptAny: false,
        ...(mergedAcceptNotes !== undefined ? { notes: mergedAcceptNotes } : {}),
      },
    },
    { returnDocument: 'after' }
  );

  if (!updated) {
    throw new SwapRequestError('conflict', 'Request was updated. Retry.', 409);
  }

  const supersedeNote = '[withdrawn: you matched another employee’s swap offer]';
  const conflicting = await col
    .find({
      _id: { $ne: _id },
      fromEmployeeId: employeeId,
      jobSlug: existing.jobSlug,
      status: 'pending_match',
      type: 'swap',
      fromShiftSlug: toShiftSlug,
      fromShiftDate: toShiftDate,
    })
    .toArray();

  for (const doc of conflicting) {
    const merged =
      doc.notes != null && String(doc.notes).trim() !== ''
        ? `${doc.notes}\n${supersedeNote}`
        : supersedeNote;
    await col.updateOne(
      { _id: doc._id, status: 'pending_match' },
      {
        $set: {
          status: 'rejected',
          resolvedAt: new Date(),
          resolvedBy: employeeId,
          resolution: 'rejected',
          notes: merged,
        },
      }
    );
  }

  if (updated) {
    await notifySwapAcceptedByPeer(db, updated);
  }
  return toPublic(updated);
}

/**
 * Employee accepts a pending giveaway (open or directed to them). Moves request to
 * `pending_approval` and sets `toEmployeeId` when the offer was open.
 */
export async function claimGiveawayRequest(
  db: Db,
  user: AuthenticatedRequest['user'],
  id: string
): Promise<object | null> {
  assertNotClient(user);
  const employeeId = getEmployeeIdFromUser(user);
  if (!employeeId) {
    throw new SwapRequestError(
      'missing-identifiers',
      'Missing employee identifier.',
      400
    );
  }

  const _id = parseObjectId(id);
  const col = db.collection<SwapRequestDoc>(COLLECTION);
  const existing = await col.findOne({ _id });
  if (!existing) {
    throw new SwapRequestError('not-found', 'Swap request not found.', 404);
  }

  if (existing.status !== 'pending_match') {
    throw new SwapRequestError(
      'invalid-status',
      'Only pending offers can be claimed.',
      400
    );
  }

  if (existing.type !== 'giveaway') {
    throw new SwapRequestError(
      'invalid-type',
      'Only shift giveaways can be claimed this way.',
      400
    );
  }

  if (existing.fromEmployeeId === employeeId) {
    throw new SwapRequestError(
      'invalid-target',
      'You cannot claim your own giveaway.',
      400
    );
  }

  const stored = existing as unknown as SwapRequestStoredDoc;
  const fromSlug = getFromShiftSlug(stored);
  const fromDate = getFromShiftDate(stored);
  if (!fromSlug || !fromDate) {
    throw new SwapRequestError(
      'invalid-request',
      'Giveaway is missing shift-day fields.',
      400
    );
  }

  const job = await findJobByJobSlug(db, existing.jobSlug);
  if (!job) {
    throw new SwapRequestError('job-not-found', 'Job not found.', 404);
  }

  assertShiftDayNotPast(fromDate);

  const fromSnap = buildShiftDaySnapshotFromJob(job, fromSlug, fromDate);
  if (!fromSnap) {
    throw new SwapRequestError(
      'invalid-shift',
      'Could not resolve this shift-day from the schedule.',
      400
    );
  }

  const configuredSwapHours = Number(job.additionalConfig?.swapBeforeHours);
  const minSwapLeadHours =
    Number.isFinite(configuredSwapHours) && configuredSwapHours >= 0
      ? configuredSwapHours
      : 48;
  assertSwapLeadTimeAtLeastHours(fromSnap.start, minSwapLeadHours);

  try {
    validateGiveawayOverlap(job, fromSlug, employeeId, fromSnap);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('overlap:')) {
      throw new SwapRequestError(
        'overlap',
        e.message.replace(/^overlap:\s*/i, '').trim(),
        400
      );
    }
    throw e;
  }

  const updated = await col.findOneAndUpdate(
    {
      _id,
      status: 'pending_match',
      type: 'giveaway',
      fromEmployeeId: { $ne: employeeId },
      $or: [
        { toEmployeeId: null },
        { toEmployeeId: { $exists: false } },
        { toEmployeeId: employeeId },
      ],
    },
    { $set: { status: 'pending_approval', toEmployeeId: employeeId } },
    { returnDocument: 'after' }
  );

  if (!updated) {
    throw new SwapRequestError(
      'unauthorized',
      'This shift is not offered to you, or it was already claimed.',
      403
    );
  }

  await notifyGiveawayClaimedByPeer(db, updated);
  return toPublic(updated);
}

export async function approveSwapRequest(
  db: Db,
  user: AuthenticatedRequest['user'],
  id: string
): Promise<object | null> {
  if (!isSwapRequestAdmin(user)) {
    throw new SwapRequestError(
      'unauthorized',
      'Only administrators can approve.',
      403
    );
  }

  const _id = parseObjectId(id);
  const col = db.collection<SwapRequestDoc>(COLLECTION);
  const req = await col.findOne({ _id });
  if (!req) {
    throw new SwapRequestError('not-found', 'Swap request not found.', 404);
  }

  if (isEventCoverSwapRow(req)) {
    throw new SwapRequestError(
      'wrong-request-kind',
      'This request is an event cover. Approve it using event cover admin tools.',
      400
    );
  }

  if (req.status !== 'pending_approval') {
    throw new SwapRequestError(
      'invalid-status',
      'Only pending_approval requests can be approved.',
      400
    );
  }

  const job = await findJobByJobSlug(db, req.jobSlug);
  if (!job) {
    throw new SwapRequestError('job-not-found', 'Job not found.', 404);
  }

  const resolverId =
    user._id != null
      ? String(user._id)
      : user.userId != null
        ? String(user.userId)
        : user.applicantId != null
          ? String(user.applicantId)
          : 'unknown';

  const storedReq = req as unknown as SwapRequestStoredDoc;
  const fromSnap = resolveFromShiftDaySnapshot(job, storedReq);
  const toSnap = resolveToShiftDaySnapshot(job, storedReq);
  const rosterShiftSlug = getFromShiftSlug(storedReq);

  if (!fromSnap) {
    throw new SwapRequestError(
      'invalid-request',
      'Cannot approve: initiator shift-day could not be resolved.',
      400
    );
  }

  const fromYmd = getFromShiftDate(storedReq);
  const toYmd = getToShiftDate(storedReq);
  const fromSlugResolved = getFromShiftSlug(storedReq);
  const toSlugResolved = getToShiftSlug(storedReq);
  const isPickupTakingOpenOffer =
    req.type === 'pickup_interest' &&
    req.taggedOnly === true &&
    req.toEmployeeId &&
    String(req.fromEmployeeId) !== String(req.toEmployeeId) &&
    Boolean(fromYmd && toYmd && fromYmd === toYmd) &&
    (toSlugResolved || fromSlugResolved) === fromSlugResolved;

  try {
    if (req.type === 'swap' && toSnap && req.toEmployeeId) {
      validateSwapOverlap(
        job,
        rosterShiftSlug,
        req.fromEmployeeId,
        req.toEmployeeId,
        fromSnap,
        toSnap
      );
      await applySwapToRosters(
        db,
        req.jobSlug,
        rosterShiftSlug,
        req.fromEmployeeId,
        req.toEmployeeId,
        fromSnap,
        toSnap
      );
    } else if (isPickupTakingOpenOffer && fromSnap) {
      const giverId = String(req.toEmployeeId);
      const takerId = String(req.fromEmployeeId);
      assertInitiatorOnRoster(job, rosterShiftSlug, giverId, fromSnap);
      try {
        validateGiveawayOverlap(job, rosterShiftSlug, takerId, fromSnap);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('overlap:')) {
          throw new SwapRequestError(
            'overlap',
            e.message.replace(/^overlap:\s*/i, '').trim(),
            400
          );
        }
        throw e;
      }
      await applyGiveawayToRoster(
        db,
        req.jobSlug,
        rosterShiftSlug,
        giverId,
        takerId,
        fromSnap
      );
    } else if (
      (req.type === 'giveaway' || req.type === 'pickup_interest') &&
      req.toEmployeeId &&
      fromSnap
    ) {
      validateGiveawayOverlap(
        job,
        rosterShiftSlug,
        req.toEmployeeId,
        fromSnap
      );
      await applyGiveawayToRoster(
        db,
        req.jobSlug,
        rosterShiftSlug,
        req.fromEmployeeId,
        req.toEmployeeId,
        fromSnap
      );
    } else {
      throw new SwapRequestError(
        'invalid-request',
        'Cannot approve: missing peer or shift-day data for this request type.',
        400
      );
    }
  } catch (e) {
    if (e instanceof SwapRequestError) throw e;
    throw new SwapRequestError(
      'roster-update-failed',
      e instanceof Error ? e.message : 'Roster update failed.',
      400
    );
  }

  const after = await col.findOneAndUpdate(
    { _id, status: 'pending_approval' },
    {
      $set: {
        status: 'approved',
        resolvedAt: new Date(),
        resolvedBy: resolverId,
        resolution: 'approved',
      },
    },
    { returnDocument: 'after' }
  );

  if (!after) {
    throw new SwapRequestError(
      'internal-error',
      'Roster updated but request state could not be finalized.',
      500
    );
  }

  await notifySwapApprovedByAdmin(db, after);
  return toPublic(after);
}

export async function rejectSwapRequest(
  db: Db,
  user: AuthenticatedRequest['user'],
  id: string,
  input: RejectSwapRequestInput
): Promise<object | null> {
  if (!isSwapRequestAdmin(user)) {
    throw new SwapRequestError(
      'unauthorized',
      'Only administrators can reject.',
      403
    );
  }

  const _id = parseObjectId(id);
  const col = db.collection<SwapRequestDoc>(COLLECTION);
  const existing = await col.findOne({ _id });
  if (!existing) {
    throw new SwapRequestError('not-found', 'Swap request not found.', 404);
  }

  if (isEventCoverSwapRow(existing)) {
    throw new SwapRequestError(
      'wrong-request-kind',
      'This request is an event cover. Reject it using event cover admin tools.',
      400
    );
  }

  const resolverId =
    user._id != null
      ? String(user._id)
      : user.userId != null
        ? String(user.userId)
        : user.applicantId != null
          ? String(user.applicantId)
          : 'unknown';

  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  const mergedNotes =
    reason.length > 0
      ? existing.notes
        ? `${existing.notes}\n[reject] ${reason}`
        : `[reject] ${reason}`
      : existing.notes;

  const updated = await col.findOneAndUpdate(
    { _id, status: { $in: ['pending_match', 'pending_approval'] } },
    {
      $set: {
        status: 'rejected',
        resolvedAt: new Date(),
        resolvedBy: resolverId,
        resolution: 'rejected',
        ...(mergedNotes !== undefined ? { notes: mergedNotes } : {}),
      },
    },
    { returnDocument: 'after' }
  );

  if (!updated) {
    throw new SwapRequestError(
      'invalid-status',
      'Request cannot be rejected in current state.',
      400
    );
  }

  await notifySwapRejectedByAdmin(db, updated);
  return toPublic(updated);
}

export async function withdrawSwapRequest(
  db: Db,
  user: AuthenticatedRequest['user'],
  id: string
): Promise<object | null> {
  assertNotClient(user);
  const uid = getEmployeeIdFromUser(user);
  if (!uid) {
    throw new SwapRequestError(
      'missing-identifiers',
      'Missing employee identifier.',
      400
    );
  }

  const _id = parseObjectId(id);
  const col = db.collection<SwapRequestDoc>(COLLECTION);
  const existing = await col.findOne({ _id });
  if (!existing) {
    throw new SwapRequestError('not-found', 'Swap request not found.', 404);
  }

  if (isEventCoverSwapRow(existing)) {
    throw new SwapRequestError(
      'wrong-request-kind',
      'Event cover requests cannot be withdrawn from shift-swap. Contact an administrator.',
      400
    );
  }

  const isAdmin = isSwapRequestAdmin(user);
  if (!isAdmin) {
    if (existing.fromEmployeeId !== uid) {
      throw new SwapRequestError(
        'unauthorized',
        'You can only withdraw your own requests.',
        403
      );
    }
    if (existing.type === 'swap') {
      throw new SwapRequestError(
        'cannot-withdraw-swap',
        'Swap requests cannot be removed here. Contact an administrator if you need to cancel a swap.',
        403
      );
    }
    if (
      (existing.type === 'giveaway' ||
        existing.type === 'pickup_interest') &&
      existing.toEmployeeId
    ) {
      throw new SwapRequestError(
        'cannot-withdraw-assigned',
        'This request names a specific coworker. It cannot be removed here. Contact an administrator.',
        403
      );
    }
  }

  const withdrawNote = '[withdrawn by employee]';
  const mergedNotes = existing.notes
    ? `${existing.notes}\n${withdrawNote}`
    : withdrawNote;

  const updated = await col.findOneAndUpdate(
    { _id, status: { $in: ['pending_match', 'pending_approval'] } },
    {
      $set: {
        status: 'rejected',
        resolvedAt: new Date(),
        resolvedBy: uid,
        resolution: 'rejected',
        notes: mergedNotes,
      },
    },
    { returnDocument: 'after' }
  );

  if (!updated) {
    throw new SwapRequestError(
      'invalid-status',
      'Only pending requests can be withdrawn.',
      400
    );
  }

  return toPublic(updated);
}

export type ListWillingSwapCandidatesQuery = {
  jobSlug: string;
  shiftSlug: string;
  page?: number;
  limit?: number;
  /** Optional YYYY-MM-DD window (e.g. schedule table week) for peers’ `fromShiftDate`. */
  startDate?: string;
  endDate?: string;
};

type ApplicantNameFields = {
  firstName?: string;
  lastName?: string;
  fullName?: string;
};

async function loadApplicantDisplayMap(
  db: Db,
  employeeIds: string[]
): Promise<Map<string, { displayName: string; initials: string }>> {
  const out = new Map<string, { displayName: string; initials: string }>();
  const unique = [...new Set(employeeIds)].filter(Boolean);
  const oids = unique
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
  if (oids.length === 0) return out;

  const docs = await db
    .collection('applicants')
    .find({ _id: { $in: oids } }, { projection: { firstName: 1, lastName: 1, fullName: 1 } })
    .toArray();

  for (const d of docs) {
    const id = String(d._id);
    const a = d as ApplicantNameFields;
    const first = a.firstName?.trim() || '';
    const last = a.lastName?.trim() || '';
    const full = a.fullName?.trim() || '';
    const displayName =
      full || [first, last].filter(Boolean).join(' ') || 'Employee';
    const initials =
      [first, last]
        .filter(Boolean)
        .map((s) => s[0]?.toUpperCase())
        .join('')
        .slice(0, 2) || displayName.slice(0, 2).toUpperCase();
    out.set(id, { displayName, initials });
  }
  return out;
}

/**
 * Other employees with an open `swap` request on the same job+shift (`type: 'swap'`,
 * `pending_match`). Omits rows where the viewer is already on this shift template’s
 * roster for the peer’s offered calendar day (`fromShiftDate`).
 */
export async function listWillingSwapCandidates(
  db: Db,
  user: AuthenticatedRequest['user'],
  query: ListWillingSwapCandidatesQuery
): Promise<{
  items: Array<{
    swapRequestId: string;
    employeeId: string;
    displayName: string;
    initials: string;
    fromShiftSlug: string;
    fromShiftDate: string;
    fromShiftDay: ShiftDaySnapshot;
    submittedAt: string;
  }>;
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}> {
  assertNotClient(user);

  const me = getEmployeeIdFromUser(user);
  if (!me) {
    throw new SwapRequestError(
      'missing-identifiers',
      'Missing employee identifier.',
      400
    );
  }

  const jobSlug = query.jobSlug?.trim();
  const shiftSlug = query.shiftSlug?.trim();
  if (!jobSlug || !shiftSlug) {
    throw new SwapRequestError(
      'missing-job-shift',
      'jobSlug and shiftSlug are required.',
      400
    );
  }

  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(50, Math.max(1, query.limit ?? 5));

  const filter: Record<string, unknown> = {
    jobSlug,
    $or: [{ fromShiftSlug: shiftSlug }, { shiftSlug: shiftSlug }],
    status: 'pending_match',
    type: 'swap',
    fromEmployeeId: { $ne: me },
  };

  const rangeStart = query.startDate?.trim()
    ? coerceQueryBoundaryToYmd(query.startDate)
    : null;
  const rangeEnd = query.endDate?.trim()
    ? coerceQueryBoundaryToYmd(query.endDate)
    : null;
  if (rangeStart && rangeEnd && rangeStart <= rangeEnd) {
    filter.fromShiftDate = { $gte: rangeStart, $lte: rangeEnd };
  }

  const WILLING_RAW_ROW_CAP = 600;

  const col = db.collection<SwapRequestDoc>(COLLECTION);
  const [jobForWilling, rows] = await Promise.all([
    findJobByJobSlug(db, jobSlug),
    col
      .find(filter, {
        projection: {
          _id: 1,
          fromEmployeeId: 1,
          fromShiftSlug: 1,
          shiftSlug: 1,
          fromShiftDate: 1,
          fromShiftDay: 1,
          submittedAt: 1,
        },
      })
      .sort({ submittedAt: -1 })
      .limit(WILLING_RAW_ROW_CAP)
      .toArray(),
  ]);

  type WillingRowPre = {
    swapRequestId: string;
    employeeId: string;
    fromShiftSlug: string;
    fromShiftDate: string;
    fromShiftDay: ShiftDaySnapshot;
    submittedAt: string;
  };

  const mapped: WillingRowPre[] = rows.map((r) => {
    const row = r as unknown as SwapRequestStoredDoc;
    const slug = getFromShiftSlug(row);
    const date = getFromShiftDate(row);
    let fromShiftDay: ShiftDaySnapshot;
    if (jobForWilling && slug && date) {
      const built = buildShiftDaySnapshotFromJob(jobForWilling, slug, date);
      if (built) {
        fromShiftDay = built;
      } else {
        fromShiftDay = {
          date,
          dayOfWeek: dayKeyFromYmd(date) || 'monday',
          start: '',
          end: '',
        };
      }
    } else {
      fromShiftDay = {
        date,
        dayOfWeek: dayKeyFromYmd(date) || 'monday',
        start: '',
        end: '',
      };
    }
    return {
      swapRequestId: String(r._id),
      employeeId: r.fromEmployeeId,
      fromShiftSlug: slug,
      fromShiftDate: date,
      fromShiftDay,
      submittedAt:
        r.submittedAt instanceof Date
          ? r.submittedAt.toISOString()
          : String(r.submittedAt),
    };
  });

  const itemsAll = mapped.filter((item) => {
    if (!item.fromShiftDate) return false;
    if (item.fromShiftSlug !== shiftSlug) return false;
    if (!jobForWilling) return true;
    return !isEmployeeAssignedShiftDay(
      jobForWilling,
      shiftSlug,
      me,
      item.fromShiftDate
    );
  });

  const total = itemsAll.length;
  const pageSlice = itemsAll.slice((page - 1) * limit, page * limit);

  const nameMap = await loadApplicantDisplayMap(
    db,
    pageSlice.map((item) => item.employeeId)
  );

  const items = pageSlice.map((item) => {
    const nm = nameMap.get(item.employeeId) ?? {
      displayName: 'Employee',
      initials: 'EM',
    };
    return {
      ...item,
      displayName: nm.displayName,
      initials: nm.initials,
    };
  });

  return {
    items,
    page,
    limit,
    total,
    hasMore: page * limit < total,
  };
}

/** Accepts `YYYY-MM-DD` or ISO datetimes; returns local calendar `YYYY-MM-DD`. */
function coerceQueryBoundaryToYmd(raw: string): string | null {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function* eachYmdInRange(startYmd: string, endYmd: string): Generator<string> {
  if (startYmd > endYmd) return;
  const start = Date.parse(`${startYmd}T12:00:00`);
  const end = Date.parse(`${endYmd}T12:00:00`);
  if (Number.isNaN(start) || Number.isNaN(end)) return;
  for (let t = start; t <= end; t += 86400000) {
    const d = new Date(t);
    yield `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

function isEmployeeAssignedShiftDay(
  job: GignologyJob,
  shiftSlug: string,
  employeeId: string,
  dateYmd: string
): boolean {
  const shift = job.shifts?.find((s) => s.slug === shiftSlug);
  const dk = dayKeyFromYmd(dateYmd);
  if (!shift?.defaultSchedule || !dk) return false;
  const roster = shift.defaultSchedule[dk]?.roster;
  if (!Array.isArray(roster)) return false;
  return roster.some((e) =>
    rosterEntryMatches(e as string | RosterEntry, employeeId, dateYmd)
  );
}

export type ListPickupInterestSeekersQuery = {
  jobSlug: string;
  shiftSlug: string;
  page?: number;
  limit?: number;
  /**
   * Optional YYYY-MM-DD bounds on seekers’ tagged `fromShiftDate`.
   * Use the same value for both to restrict to a single calendar day.
   */
  startDate?: string;
  endDate?: string;
};

export type ListPickupOpportunitiesQuery = {
  jobSlug: string;
  shiftSlug: string;
  startDate: string;
  endDate: string;
};

/**
 * Coworkers with open `pickup_interest` on the same job+shift (want extra work).
 * Includes `pending_match` and `pending_approval`, and any `taggedOnly` value.
 * Used for “Let someone take my shift” — pass equal `startDate`/`endDate` to list
 * only seekers who tagged interest for that specific shift-day.
 */
export async function listPickupInterestSeekers(
  db: Db,
  user: AuthenticatedRequest['user'],
  query: ListPickupInterestSeekersQuery
): Promise<{
  items: Array<{
    swapRequestId: string;
    employeeId: string;
    displayName: string;
    initials: string;
    interestShiftDate: string;
    preferenceNote: string | null;
    submittedAt: string;
  }>;
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}> {
  assertNotClient(user);

  const me = getEmployeeIdFromUser(user);
  if (!me) {
    throw new SwapRequestError(
      'missing-identifiers',
      'Missing employee identifier.',
      400
    );
  }

  const jobSlug = query.jobSlug?.trim();
  const shiftSlug = query.shiftSlug?.trim();
  if (!jobSlug || !shiftSlug) {
    throw new SwapRequestError(
      'missing-job-shift',
      'jobSlug and shiftSlug are required.',
      400
    );
  }

  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(50, Math.max(1, query.limit ?? 8));

  const filter: Record<string, unknown> = {
    jobSlug,
    $or: [{ fromShiftSlug: shiftSlug }, { shiftSlug: shiftSlug }],
    status: { $in: ['pending_match', 'pending_approval'] },
    type: 'pickup_interest',
    fromEmployeeId: { $ne: me },
  };

  const skStart = query.startDate?.trim()
    ? coerceQueryBoundaryToYmd(query.startDate)
    : null;
  const skEnd = query.endDate?.trim()
    ? coerceQueryBoundaryToYmd(query.endDate)
    : null;
  if (skStart && skEnd && skStart <= skEnd) {
    filter.fromShiftDate = { $gte: skStart, $lte: skEnd };
  }

  const col = db.collection<SwapRequestDoc>(COLLECTION);
  const total = await col.countDocuments(filter);
  const rows = await col
    .find(filter)
    .sort({ submittedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();

  const nameMap = await loadApplicantDisplayMap(
    db,
    rows.map((r) => r.fromEmployeeId)
  );

  const items = rows.map((r) => {
    const row = r as unknown as SwapRequestStoredDoc;
    const date = getFromShiftDate(row);
    const nm = nameMap.get(r.fromEmployeeId) ?? {
      displayName: 'Employee',
      initials: 'EM',
    };
    const rawNote = r.notes != null ? String(r.notes).trim() : '';
    return {
      swapRequestId: String(r._id),
      employeeId: r.fromEmployeeId,
      displayName: nm.displayName,
      initials: nm.initials,
      interestShiftDate: date,
      preferenceNote: rawNote.length > 0 ? rawNote : null,
      submittedAt:
        r.submittedAt instanceof Date
          ? r.submittedAt.toISOString()
          : String(r.submittedAt),
    };
  });

  return {
    items,
    page,
    limit,
    total,
    hasMore: page * limit < total,
  };
}

/**
 * Shift-days in the date range for this job shift where shift start is at least
 * `swapBeforeHours` away (from `job.additionalConfig`, default 48). Past days excluded.
 * Includes days the viewer already works so “Available now” can show for giveaways.
 */
export async function listPickupOpportunities(
  db: Db,
  user: AuthenticatedRequest['user'],
  query: ListPickupOpportunitiesQuery
): Promise<{
  items: Array<{
    shiftDate: string;
    shiftDay: ShiftDaySnapshot;
    shiftName: string | null;
    availableNow: boolean;
    claimable: boolean;
    giveawayRequestId: string | null;
    offererDisplayName: string | null;
    directedToOther: boolean;
    viewerAlreadyAssigned: boolean;
    /** Another shift on the same day overlaps this slot (cannot double-book). */
    viewerScheduleOverlap: boolean;
    viewerPickedUp: boolean;
  }>;
  swapBeforeHours: number;
}> {
  assertNotClient(user);

  const me = getEmployeeIdFromUser(user);
  if (!me) {
    throw new SwapRequestError(
      'missing-identifiers',
      'Missing employee identifier.',
      400
    );
  }

  const jobSlug = query.jobSlug?.trim();
  const shiftSlug = query.shiftSlug?.trim();
  const startRaw = query.startDate?.trim();
  const endRaw = query.endDate?.trim();
  if (!jobSlug || !shiftSlug || !startRaw || !endRaw) {
    throw new SwapRequestError(
      'missing-params',
      'jobSlug, shiftSlug, startDate, and endDate are required.',
      400
    );
  }

  const startDate = coerceQueryBoundaryToYmd(startRaw);
  const endDate = coerceQueryBoundaryToYmd(endRaw);
  if (!startDate || !endDate) {
    throw new SwapRequestError(
      'invalid-date-range',
      'startDate and endDate must be valid calendar dates.',
      400
    );
  }

  const job = await findJobByJobSlug(db, jobSlug);
  if (!job) {
    throw new SwapRequestError('job-not-found', 'Job not found.', 404);
  }

  const configuredSwapHours = Number(job.additionalConfig?.swapBeforeHours);
  const minSwapLeadHours =
    Number.isFinite(configuredSwapHours) && configuredSwapHours >= 0
      ? configuredSwapHours
      : 48;

  const shiftMeta = job.shifts?.find((s) => s.slug === shiftSlug);
  const shiftName =
    shiftMeta?.shiftName?.trim() || shiftMeta?.slug?.trim() || null;

  const col = db.collection<SwapRequestDoc>(COLLECTION);
  const giveawayRows = await col
    .find({
      jobSlug,
      status: 'pending_match',
      type: 'giveaway',
      fromEmployeeId: { $ne: me },
      fromShiftDate: { $gte: startDate, $lte: endDate },
      $or: [{ fromShiftSlug: shiftSlug }, { shiftSlug: shiftSlug }],
    })
    .sort({ submittedAt: -1 })
    .toArray();

  const byDate = new Map<string, SwapRequestDoc>();
  for (const g of giveawayRows) {
    const row = g as unknown as SwapRequestStoredDoc;
    const slugOnDoc = getFromShiftSlug(row);
    if (slugOnDoc !== shiftSlug) continue;
    const d = getFromShiftDate(row);
    if (!d || byDate.has(d)) continue;
    byDate.set(d, g);
  }

  const offererIds = [...byDate.values()].map((g) => g.fromEmployeeId);
  const nameMap = await loadApplicantDisplayMap(db, offererIds);

  const pickupRows = await col
    .find({
      jobSlug,
      type: 'pickup_interest',
      fromEmployeeId: me,
      status: { $in: ['pending_match', 'pending_approval', 'approved'] },
      fromShiftDate: { $gte: startDate, $lte: endDate },
      $or: [{ fromShiftSlug: shiftSlug }, { shiftSlug: shiftSlug }],
    })
    .toArray();

  const viewerPickedUpDates = new Set<string>();
  for (const pr of pickupRows) {
    const stored = pr as unknown as SwapRequestStoredDoc;
    if (getFromShiftSlug(stored) !== shiftSlug) continue;
    const d = getFromShiftDate(stored);
    if (d) viewerPickedUpDates.add(d);
  }

  const items: Array<{
    shiftDate: string;
    shiftDay: ShiftDaySnapshot;
    shiftName: string | null;
    availableNow: boolean;
    claimable: boolean;
    giveawayRequestId: string | null;
    offererDisplayName: string | null;
    directedToOther: boolean;
    viewerAlreadyAssigned: boolean;
    viewerScheduleOverlap: boolean;
    viewerPickedUp: boolean;
  }> = [];

  for (const ymd of eachYmdInRange(startDate, endDate)) {
    const snap = buildShiftDaySnapshotFromJob(job, shiftSlug, ymd);
    if (!snap) continue;

    try {
      assertShiftDayNotPast(ymd);
    } catch {
      continue;
    }

    try {
      assertSwapLeadTimeAtLeastHours(snap.start, minSwapLeadHours);
    } catch {
      continue;
    }

    const viewerAlreadyAssigned = isEmployeeAssignedShiftDay(
      job,
      shiftSlug,
      me,
      ymd
    );

    const viewerScheduleOverlap =
      !viewerAlreadyAssigned &&
      assigneeHasScheduleConflictForShiftDay(job, shiftSlug, me, snap);

    const g = byDate.get(ymd);
    const availableNow = Boolean(g);
    const toOnGiveaway =
      g?.toEmployeeId != null && String(g.toEmployeeId).trim() !== ''
        ? String(g.toEmployeeId)
        : '';
    const directedToOther = Boolean(toOnGiveaway && toOnGiveaway !== String(me));
    const claimable = Boolean(
      g &&
        (!toOnGiveaway || toOnGiveaway === String(me)) &&
        !viewerAlreadyAssigned &&
        !viewerScheduleOverlap
    );
    const offerer = g
      ? (nameMap.get(g.fromEmployeeId)?.displayName ?? 'Employee')
      : null;

    items.push({
      shiftDate: ymd,
      shiftDay: snap,
      shiftName,
      availableNow,
      claimable,
      giveawayRequestId: g ? String(g._id) : null,
      offererDisplayName: offerer,
      directedToOther,
      viewerAlreadyAssigned,
      viewerScheduleOverlap,
      viewerPickedUp: viewerPickedUpDates.has(ymd),
    });
  }

  return { items, swapBeforeHours: minSwapLeadHours };
}
