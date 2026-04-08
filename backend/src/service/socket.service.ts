import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { verifyAccessToken } from './jwt.service';

let io: SocketServer;

export function initSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Auth middleware — clients must pass { auth: { token: '<accessToken>' } }
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const user = verifyAccessToken(token);
      (socket as Socket & { data: { user: typeof user } }).data.user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as Socket & { data: { user: ReturnType<typeof verifyAccessToken> } }).data.user;
    console.log(`[Socket] Connected: ${user.userId} (${user.userType})`);

    // Join appropriate room
    if (user.userType === 'SYSTEM') {
      socket.join('system');
    } else if (user.tenantId) {
      socket.join(`tenant:${user.tenantId}`);
    }

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${user.userId}`);
    });
  });

  console.log('[Socket] Socket.io initialized');
  return io;
}

/** Emit an event to all sockets in a tenant's room */
export function emitToTenant(tenantId: string, event: string, payload: unknown): void {
  if (!io) return;
  io.to(`tenant:${tenantId}`).emit(event, payload);
}

/** Emit an event to SYSTEM room (visible to all SYSTEM users) */
export function emitToSystem(event: string, payload: unknown): void {
  if (!io) return;
  io.to('system').emit(event, payload);
}

/** Emit to both tenant room and system room */
export function emitAccessEvent(tenantId: string, payload: unknown): void {
  emitToTenant(tenantId, 'access_event', payload);
  emitToSystem('access_event', payload);
}
