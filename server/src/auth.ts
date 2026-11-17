import type { NextFunction, Request, Response } from 'express';
import { hkdfSync } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { SessionUser } from './types';

export const SESSION_COOKIE = 'teamflow_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function jwtSecret(): Buffer {
  const localSecret = process.env.APP_JWT_SECRET;
  if (localSecret && Buffer.byteLength(localSecret) >= 32) return Buffer.from(localSecret);
  const platformSecret = process.env.MANUS_JWT_SECRET;
  if (!platformSecret || Buffer.byteLength(platformSecret) < 16) throw new Error('A valid project JWT signing key is required.');
  return Buffer.from(hkdfSync('sha256', Buffer.from(platformSecret), Buffer.from('teamflow-session-v1'), Buffer.from('teamflow-app-access-token'), 32));
}

export function createAccessToken(user: SessionUser): string {
  return jwt.sign({ name: user.name, email: user.email }, jwtSecret(), {
    subject: user.id,
    issuer: 'teamflow',
    audience: 'teamflow-app',
    expiresIn: '12h'
  });
}

export function setSession(res: Response, user: SessionUser): void {
  res.cookie(SESSION_COOKIE, createAccessToken(user), {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: SESSION_TTL_MS
  });
}

export function clearSession(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: true, sameSite: 'none', path: '/' });
}

export function sessionFromCookieHeader(rawCookie: string | undefined): SessionUser | null {
  const token = rawCookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!token) return null;
  try {
    const claims = jwt.verify(decodeURIComponent(token), jwtSecret(), { issuer: 'teamflow', audience: 'teamflow-app' }) as JwtPayload;
    if (typeof claims.sub !== 'string' || typeof claims.name !== 'string' || typeof claims.email !== 'string') return null;
    return { id: claims.sub, name: claims.name, email: claims.email };
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) {
    res.status(401).json({ error: 'Please log in to continue.', code: 'UNAUTHENTICATED' });
    return;
  }
  try {
    const claims = jwt.verify(token, jwtSecret(), { issuer: 'teamflow', audience: 'teamflow-app' }) as JwtPayload;
    if (typeof claims.sub !== 'string' || typeof claims.name !== 'string' || typeof claims.email !== 'string') throw new Error('Invalid token claims');
    (req as Request & { user: SessionUser }).user = { id: claims.sub, name: claims.name, email: claims.email };
    next();
  } catch {
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: true, sameSite: 'none', path: '/' });
    res.status(401).json({ error: 'Your session has expired. Please log in again.', code: 'INVALID_SESSION' });
  }
}
