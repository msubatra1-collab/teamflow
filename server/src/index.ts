import path from 'node:path';
import http from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { createApiRouter } from './api';
import { errorHandler } from './errors';
import { createRealtime } from './realtime';
import { prisma } from './db';

async function start() {
  const app = express();
  const server = http.createServer(app);
  const io = createRealtime(server);

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.get('/api/health', (_req, res) => res.status(200).json({ ok: true, service: 'teamflow' }));
  app.use('/api/v1', createApiRouter(io));

  let vite: Awaited<ReturnType<typeof createViteServer>> | undefined;
  if (process.env.NODE_ENV === 'production') {
    const clientDist = path.resolve(process.cwd(), 'client/dist');
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get(/.*/, (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else {
    vite = await createViteServer({
      configFile: path.resolve(process.cwd(), 'vite.config.ts'),
      server: { middlewareMode: true, hmr: { server } },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }
  app.use(errorHandler);

  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => console.log(`Teamflow listening on port ${port}`));

  const close = async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await vite?.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => { void close(); });
  process.on('SIGINT', () => { void close(); });
}

start().catch((error) => {
  console.error('Teamflow server failed to start:', error instanceof Error ? error.message : 'unknown error');
  process.exit(1);
});
