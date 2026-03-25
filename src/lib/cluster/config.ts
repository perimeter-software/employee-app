import fs from 'fs';
import path from 'path';
import { availableParallelism, cpus } from 'node:os';

/** Max forked workers (primary does not serve HTTP). */
export const MAX_CLUSTER_WORKERS = 32;

export function assertProductionBuildReady(): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (!fs.existsSync(path.join(process.cwd(), '.next', 'BUILD_ID'))) {
    throw new Error(
      'No production build in .next. Run `yarn build`, then `yarn start:cluster`. ' +
        'https://nextjs.org/docs/messages/production-start-no-build-id'
    );
  }
}

export function isClusterEnabled(): boolean {
  return process.env.CLUSTER_ENABLED !== 'false';
}

function cpuCount(): number {
  try {
    return availableParallelism();
  } catch {
    return cpus().length;
  }
}

function clampForks(n: number, cpus: number): number {
  return Math.min(Math.max(1, n), cpus, MAX_CLUSTER_WORKERS);
}

export function getWorkerCount(): number {
  const cpus = cpuCount();
  const raw = process.env.CLUSTER_WORKERS;
  if (raw) {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n > 0) return clampForks(n, cpus);
  }
  return clampForks(Math.max(1, cpus - 1), cpus);
}

export function applyPortFromArgv(): void {
  if (process.env.PORT) return;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-p' || a === '--port') {
      const n = parseInt(args[i + 1] ?? '', 10);
      if (!Number.isNaN(n) && n > 0) {
        process.env.PORT = String(n);
        return;
      }
    }
    if (a.startsWith('--port=')) {
      const n = parseInt(a.slice('--port='.length), 10);
      if (!Number.isNaN(n) && n > 0) {
        process.env.PORT = String(n);
        return;
      }
    }
  }
}
