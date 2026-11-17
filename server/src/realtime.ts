import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { prisma } from './db';
import { sessionFromCookieHeader } from './auth';

export function createRealtime(server: HttpServer) {
  const io = new Server(server, { serveClient: true, pingInterval: 25000, pingTimeout: 20000 });

  io.use((socket, next) => {
    try {
      const user = sessionFromCookieHeader(socket.handshake.headers.cookie);
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = user;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as { id: string };
    socket.join(`user:${user.id}`);
    socket.on('project:join', async (projectId: unknown, ack?: (result: { ok: boolean }) => void) => {
      if (typeof projectId !== 'string' || projectId.length > 80) {
        ack?.({ ok: false });
        return;
      }
      try {
        const membership = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: user.id } }, select: { projectId: true } });
        if (!membership) {
          ack?.({ ok: false });
          return;
        }
        await socket.join(`project:${projectId}`);
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false });
      }
    });
    socket.on('project:leave', (projectId: unknown) => {
      if (typeof projectId === 'string') void socket.leave(`project:${projectId}`);
    });
  });

  return io;
}
