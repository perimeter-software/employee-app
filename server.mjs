import cluster from 'node:cluster';
import os from 'node:os';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

// Load .env locally when dotenv is installed; EB/production use real process.env only.
try {
  createRequire(import.meta.url)('dotenv').config();
} catch {
  /* no dotenv (e.g. prod without devDeps) — env already set by the host */
}

const rawPort = parseInt(process.env.PORT || '8080', 10);
const PORT =
  Number.isFinite(rawPort) && rawPort > 0 && rawPort < 65536 ? rawPort : 8080;

const CLUSTER_ENABLED = process.env.CLUSTER_ENABLED === 'true';
const rawWorkers = parseInt(process.env.CLUSTER_WORKERS || '0', 10);

const MAX_RESTARTS = 5;
const RESTART_WINDOW_MS = 60_000;
const RESTART_DELAY_MS = 1_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

if (!CLUSTER_ENABLED) {
  const child = spawn('node_modules/.bin/next', ['start', '-p', String(PORT)], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('error', (err) => {
    console.error('[server] Failed to start next:', err.message);
    process.exit(1);
  });
  child.on('exit', (code) => process.exit(code ?? 1));
  ['SIGTERM', 'SIGINT'].forEach((sig) =>
    process.on(sig, () => child.kill(sig))
  );
} else if (cluster.isPrimary) {
  const cpuCount = os.cpus().length;
  let requested =
    Number.isFinite(rawWorkers) && rawWorkers > 0 ? rawWorkers : cpuCount;
  // Never fork more than 2× vCPUs — misconfig / typo should not OOM the box
  const maxWorkers = Math.max(1, cpuCount * 2);
  const workerCount = Math.min(Math.max(1, requested), maxWorkers);

  if (requested > maxWorkers) {
    console.warn(
      `[cluster] CLUSTER_WORKERS=${requested} exceeds cap ${maxWorkers} (2× CPUs) — using ${workerCount}`
    );
  }

  console.log(
    `[cluster] Primary ${process.pid} starting ${workerCount} worker(s) (cpus=${cpuCount})`
  );

  /** slot index 0..workerCount-1 → restart timestamps (crash-loop per logical slot) */
  const restartHistory = new Map();
  /** cluster worker id → slot index (stable across respawns of the same slot) */
  const slotByWorkerId = new Map();

  let shuttingDown = false;

  function shouldRespawnSlot(slot) {
    const now = Date.now();
    const history = restartHistory.get(slot) || [];
    const recent = history.filter((ts) => now - ts < RESTART_WINDOW_MS);
    recent.push(now);
    restartHistory.set(slot, recent);
    return recent.length <= MAX_RESTARTS;
  }

  function forkWorkerForSlot(slot) {
    const w = cluster.fork({ CLUSTER_WORKER_SLOT: String(slot) });
    slotByWorkerId.set(w.id, slot);
    console.log(
      `[cluster] Worker pid=${w.process.pid} id=${w.id} slot=${slot}`
    );
    return w;
  }

  for (let slot = 0; slot < workerCount; slot++) {
    forkWorkerForSlot(slot);
  }

  cluster.on('exit', (worker, code, signal) => {
    if (worker.exitedAfterDisconnect) return;
    if (shuttingDown) return;

    const slot = slotByWorkerId.get(worker.id);
    slotByWorkerId.delete(worker.id);

    console.error(
      `[cluster] Worker id=${worker.id} pid=${worker.process.pid} slot=${slot ?? '?'} died (code=${code}, signal=${signal})`
    );

    if (slot === undefined) {
      console.error('[cluster] Unknown worker exit — not respawning');
      return;
    }

    if (!shouldRespawnSlot(slot)) {
      console.error(
        `[cluster] Slot ${slot} exceeded ${MAX_RESTARTS} restarts in ${RESTART_WINDOW_MS / 1000}s — not respawning`
      );
      return;
    }

    setTimeout(() => {
      if (shuttingDown) return;
      forkWorkerForSlot(slot);
    }, RESTART_DELAY_MS);
  });

  function gracefulShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[cluster] ${signal} received — shutting down workers`);

    for (const id in cluster.workers) {
      cluster.workers[id]?.process.kill('SIGTERM');
    }

    const deadline = setTimeout(() => {
      console.warn('[cluster] Shutdown timeout — force-killing workers');
      for (const id in cluster.workers) {
        cluster.workers[id]?.process.kill('SIGKILL');
      }
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    const checkInterval = setInterval(() => {
      if (Object.keys(cluster.workers).length === 0) {
        clearInterval(checkInterval);
        clearTimeout(deadline);
        console.log('[cluster] All workers exited — primary shutting down');
        process.exit(0);
      }
    }, 200);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
} else {
  const { default: next } = await import('next');
  const { createServer } = await import('node:http');

  const app = next({ dev: false, port: PORT });
  const handler = app.getRequestHandler();

  try {
    await app.prepare();
  } catch (err) {
    console.error(`[cluster] Worker ${process.pid} next.prepare() failed:`, err);
    process.exit(1);
  }

  const server = createServer(handler);
  // No server.on('upgrade') — this app does not mount Socket.io/ws on Node. If you add
  // WebSockets later, register upgrade here (and keep cluster in mind for shared state).

  server.on('error', (err) => {
    console.error(`[cluster] Worker ${process.pid} HTTP server error:`, err);
    process.exit(1);
  });

  server.listen(PORT, () => {
    console.log(`[cluster] Worker ${process.pid} listening on :${PORT}`);
  });

  let closing = false;
  function closeWorker() {
    if (closing) return;
    closing = true;
    console.log(`[cluster] Worker ${process.pid} shutting down — closing server`);
    // Drop idle keep-alive sockets so shutdown does not wait forever (Node 18.2+).
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    server.close(() => process.exit(0));
  }

  process.on('SIGTERM', closeWorker);
  process.on('SIGINT', closeWorker);
}
