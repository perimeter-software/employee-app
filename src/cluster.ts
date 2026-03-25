/**
 * Cluster entry: `yarn build` then `yarn start:cluster`. Plain `yarn start` = `next start`.
 */
import cluster from 'node:cluster';
import type { Worker } from 'node:cluster';
import {
  applyPortFromArgv,
  assertProductionBuildReady,
  getWorkerCount,
  isClusterEnabled,
  loadEnvFilesForCluster,
} from '@/lib/cluster/config';

const RESTART_MS = 60_000;
const MAX_RESTARTS = 5;
const SHUTDOWN_MS = 10_000;
const BACKOFF_CAP = 30_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function forkEnv(slot: number, total: number): Record<string, string> {
  return {
    WORKER_ID: String(slot),
    IS_CLUSTER_WORKER: 'true',
    CLUSTER_TOTAL_WORKERS: String(total),
  };
}

function envWorkerId(w: Worker): number | undefined {
  const raw = (w.process as unknown as NodeJS.Process).env?.WORKER_ID;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

async function setupWorker(): Promise<void> {
  const { startNextServer } = await import('./next-worker');
  const server = await startNextServer();
  const close = () =>
    new Promise<void>((res, rej) =>
      server.close((e) => (e ? rej(e) : res()))
    );
  const stop = async (sig: NodeJS.Signals) => {
    console.log(`[worker ${process.pid}] ${sig}`);
    try {
      await close();
    } catch (e) {
      console.error(e);
    }
    process.exit(0);
  };
  process.once('SIGTERM', () => void stop('SIGTERM'));
  process.once('SIGINT', () => void stop('SIGINT'));
}

async function runPrimary(): Promise<void> {
  process.title = 'employee-app:cluster-primary';

  const total = getWorkerCount();
  /** cluster.Worker.id → slot (1-based) */
  const slotByWorkerId = new Map<number, number>();
  const restarts = new Map<number, number>();
  const window = new Map<number, number[]>();

  const canRestart = (slot: number) => {
    const t = Date.now() - RESTART_MS;
    const arr = (window.get(slot) ?? []).filter((x) => x > t);
    window.set(slot, arr);
    return arr.length < MAX_RESTARTS;
  };

  const recordWindow = (slot: number) => {
    const arr = window.get(slot) ?? [];
    arr.push(Date.now());
    window.set(slot, arr);
  };

  const backoff = (n: number) =>
    Math.min(1000 * 2 ** Math.min(n, 8), BACKOFF_CAP) +
    Math.floor(Math.random() * 500);

  let stopping = false;
  const shutdown = async (why: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`primary shutdown (${why})`);
    const pool = cluster.workers;
    if (!pool || !Object.keys(pool).length) process.exit(0);

    const workers = Object.values(pool).filter(Boolean) as Worker[];
    await Promise.race([
      Promise.all(
        workers.map(
          (w) =>
            new Promise<void>((res) => {
              try {
                w.kill('SIGTERM');
              } catch {
                res();
                return;
              }
              w.once('exit', () => res());
            })
        )
      ),
      sleep(SHUTDOWN_MS),
    ]);
    for (const w of workers) {
      if (typeof w.isDead === 'function' && !w.isDead()) {
        try {
          w.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }
    }
    process.exit(0);
  };

  process.once('uncaughtException', (e) => {
    console.error(e);
    void shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (r) =>
    console.error('unhandledRejection', r)
  );
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  const forkOne = (slot: number) => {
    const w = cluster.fork(forkEnv(slot, total));
    slotByWorkerId.set(w.id, slot);
    w.on('online', () =>
      console.log(`slot ${slot} online (pid ${w.process.pid})`)
    );
  };

  cluster.on('exit', (w, code, sig) => {
    const slot =
      slotByWorkerId.get(w.id) ?? envWorkerId(w) ?? NaN;
    slotByWorkerId.delete(w.id);
    if (!Number.isFinite(slot)) return;

    const n = (restarts.get(slot) ?? 0) + 1;
    restarts.set(slot, n);
    console.warn(`slot ${slot} exit code=${code} sig=${sig ?? '—'}`);

    if (stopping) return;
    if (!canRestart(slot)) {
      console.error(`slot ${slot}: restart limit (${MAX_RESTARTS}/${RESTART_MS}ms)`);
      return;
    }
    recordWindow(slot);
    const delay = backoff(n);
    console.log(`restart slot ${slot} in ${delay}ms (n=${n})`);
    setTimeout(() => {
      if (!stopping) forkOne(slot);
    }, delay);
  });

  console.log(`[primary ${process.pid}] fork ${total} workers`);
  for (let s = 1; s <= total; s++) forkOne(s);
}

async function main(): Promise<void> {
  loadEnvFilesForCluster();
  applyPortFromArgv();

  if (!isClusterEnabled()) {
    await setupWorker();
    return;
  }
  if (cluster.isPrimary) {
    assertProductionBuildReady();
    await runPrimary();
    return;
  }
  await setupWorker();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
