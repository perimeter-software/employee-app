/**
 * Next.js HTTP server for cluster workers / single-process cluster mode.
 * Not used by `next dev` or `next start`.
 */
import http from 'http';
import { parse } from 'url';
import next from 'next';
import { assertProductionBuildReady } from '@/lib/cluster/config';

const dev = process.env.NODE_ENV !== 'production';

function getHostname(): string {
  return process.env.HOSTNAME || '0.0.0.0';
}

function getPort(): number {
  const fromEnv = process.env.PORT;
  if (fromEnv) {
    const n = parseInt(fromEnv, 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return 3000;
}

/** Aligns with common reverse-proxy idle timeouts (e.g. ALB ~60s). */
function tuneServerTimeouts(server: http.Server): void {
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
}

export async function startNextServer(): Promise<http.Server> {
  assertProductionBuildReady();

  const hostname = getHostname();
  const port = getPort();
  const dir = process.cwd();
  const wid = process.env.WORKER_ID ?? 'single';

  process.title =
    wid === 'single' ? 'employee-app:next' : `employee-app:worker:${wid}`;

  const app = next({
    dev,
    dir,
    conf: {
      poweredByHeader: false,
    },
  });
  const handle = app.getRequestHandler();

  await app.prepare();

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url ?? '', true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('request handler error', req.url, err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('internal server error');
      }
    }
  });

  tuneServerTimeouts(server);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, hostname, () => {
      console.log(
        `> Next.js ready on http://${hostname}:${port} (worker ${wid})`
      );
      resolve();
    });
  });

  return server;
}
