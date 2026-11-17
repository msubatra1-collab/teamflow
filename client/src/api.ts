export interface User { id: string; name: string; email: string; initials?: string }
export interface Comment { id: string; taskId: string; userId: string; content: string; createdAt: string; updatedAt: string; user: User }
export interface Task { id: string; projectId: string; columnId: string; title: string; description: string; dueDate: string | null; priority: 'LOW' | 'MEDIUM' | 'HIGH'; assigneeId: string | null; position: number; createdAt: string; updatedAt: string; assignee: User | null; comments: Comment[] }
export interface BoardColumn { id: string; projectId: string; title: string; position: number; tasks: Task[]; _count?: { tasks: number } }
export interface Member { role: 'OWNER' | 'MEMBER'; joinedAt: string; user: User }
export interface Project { id: string; name: string; description: string; ownerId: string; createdAt: string; updatedAt: string; members: Member[]; columns: BoardColumn[] }
export interface Notification { id: string; userId: string; type: 'ASSIGNED' | 'MENTIONED' | 'COMMENTED' | 'ADDED_TO_PROJECT'; message: string; link: string | null; isRead: boolean; createdAt: string }

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers }
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error ?? 'Something went wrong.', response.status, data.code);
  return data as T;
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();
}
export function displayPriority(value: Task['priority']): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
export function dateLabel(value: string | null): string | null {
  if (!value) return null;
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
