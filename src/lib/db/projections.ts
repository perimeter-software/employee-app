/**
 * Default projections for heavy collections that contain vector embeddings.
 * Always apply these when fetching documents without a restrictive inclusion projection,
 * to avoid transferring large embedding arrays that slow down queries.
 *
 * NOTE: These use exclusion syntax ({ field: 0 }). They cannot be combined with
 * inclusion projections ({ field: 1 }) — MongoDB forbids mixing the two (except _id).
 * Queries that already use inclusion projections are inherently safe and don't need these.
 */

export const DEFAULT_APPLICANT_PROJECTION = {
  'resumeData.section_embeddings': 0,
  'resumes.summary_embeddings': 0,
  'resumes.section_embeddings': 0,
} as const;

export const DEFAULT_JOBS_PROJECTION = {
  job_embeddings: 0,
} as const;
