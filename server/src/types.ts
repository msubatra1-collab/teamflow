import type { Request } from 'express';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export type AuthedRequest = Request & { user: SessionUser };

export interface ApiError extends Error {
  status?: number;
  code?: string;
}
