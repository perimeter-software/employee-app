import 'server-only';
import cluster from 'node:cluster';

/**
 * Mirrors pb-express: primary when not a forked worker, or when cluster is off.
 * Use for primary-only services (e.g. WebSockets on master) if added later.
 */
export function isClusterPrimary(): boolean {
  return cluster.isPrimary || process.env.IS_CLUSTER_WORKER !== 'true';
}

export function isClusterWorkerProcess(): boolean {
  return process.env.IS_CLUSTER_WORKER === 'true';
}

export function getClusterWorkerId(): number | undefined {
  const raw = process.env.WORKER_ID;
  if (raw === undefined) return undefined;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? undefined : n;
}
