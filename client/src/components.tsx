import { useEffect, type ReactNode } from 'react';
import { X, Flag, CalendarDays, FolderKanban } from 'lucide-react';
import type { Task, User } from './api';
import { dateLabel, displayPriority, initials } from './api';

export function Modal({ title, subtitle, onClose, children, footer, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={16} /></button></header>
      <div className="modal-body">{children}</div>
      {footer && <footer className="modal-footer">{footer}</footer>}
    </section>
  </div>;
}

export function Avatar({ user, small = false, accent = false }: { user: Pick<User, 'name' | 'initials'>; small?: boolean; accent?: boolean }) {
  return <span className={`avatar${small ? ' small' : ''}${accent ? ' accent' : ''}`} title={user.name} aria-label={user.name}>{user.initials ?? initials(user.name)}</span>;
}

export function AvatarStack({ users }: { users: Pick<User, 'id' | 'name' | 'initials'>[] }) {
  return <div className="avatar-stack" aria-label={`${users.length} project members`}>{users.slice(0, 4).map((user, index) => <Avatar key={user.id} user={user} small accent={index === 0} />)}{users.length > 4 && <span className="avatar small">+{users.length - 4}</span>}</div>;
}

export function PriorityPill({ priority }: { priority: Task['priority'] }) {
  return <span className={`pill priority-${priority.toLowerCase()}`}><Flag size={10} />{displayPriority(priority)}</span>;
}

export function DueDatePill({ dueDate }: { dueDate: string | null }) {
  const label = dateLabel(dueDate);
  return label ? <span className="pill due-date"><CalendarDays size={10} />{label}</span> : null;
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><FolderKanban size={18} /></div><h3>{title}</h3><p>{detail}</p>{action}</div>;
}

export function LoadingState({ label = 'Loading your work…' }: { label?: string }) {
  return <div className="loading"><div><div className="spinner" />{label}</div></div>;
}
