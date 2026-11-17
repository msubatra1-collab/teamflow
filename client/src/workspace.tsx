import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Activity, Bell, CalendarDays, Check, ChevronDown, ChevronLeft, CircleHelp, ClipboardCheck, Clock3, FileText, Filter, FolderKanban, LayoutGrid, LogOut, Menu, MessageCircle, MoreHorizontal, Pencil, Plus, Search, Settings2, SlidersHorizontal, Sparkles, Trash2, Users, X } from 'lucide-react';
import { api, type BoardColumn, type Notification, type Project, type Task, type User } from './api';
import { useAuth } from './auth';
import { Avatar, AvatarStack, DueDatePill, EmptyState, LoadingState, Modal, PriorityPill } from './components';
import { useToast } from './toast';

interface ShellContextValue { projects: Project[]; refreshProjects: () => Promise<void> }
import { createContext, useContext } from 'react';
const ShellContext = createContext<ShellContextValue | null>(null);
function useShell() { const value = useContext(ShellContext); if (!value) throw new Error('Workspace context is missing.'); return value; }
const brandColors = ['#e76f51', '#74a38a', '#a786cf', '#d8a54a', '#6b93b8'];
const dateTime = (date: string) => new Date(date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const seenIds = useRef(new Set<string>());
  const toast = useToast();
  const load = useCallback(async () => { try { const result = await api<{ notifications: Notification[]; unreadCount: number }>('/notifications'); seenIds.current = new Set(result.notifications.map((item) => item.id)); setNotifications(result.notifications); setUnreadCount(result.unreadCount); } catch { /* protected shell will show the login state */ } }, []);
  useEffect(() => {
    void load();
    const socket: Socket = io({ withCredentials: true });
    socket.on('notification:new', (item: Notification) => { if (!seenIds.current.has(item.id) && !item.isRead) setUnreadCount((count) => count + 1); seenIds.current.add(item.id); setNotifications((current) => [item, ...current.filter((n) => n.id !== item.id)].slice(0, 50)); });
    return () => { socket.disconnect(); };
  }, [load]);
  const unread = unreadCount;
  const markRead = async (item: Notification) => {
    try {
      if (!item.isRead) { await api(`/notifications/${item.id}/read`, { method: 'PATCH' }); setUnreadCount((count) => Math.max(0, count - 1)); }
      setNotifications((current) => current.map((n) => n.id === item.id ? { ...n, isRead: true } : n));
      setOpen(false);
      if (item.link) window.location.assign(item.link);
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not update notification.', 'error'); }
  };
  const readAll = async () => {
    await api('/notifications/read-all', { method: 'POST' });
    setNotifications((current) => current.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };
  return <div style={{ position: 'relative' }}>
    <button className="icon-button" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} onClick={() => setOpen((v) => !v)}><Bell size={16} />{unread > 0 && <span className="notification-dot" />}</button>
    {open && <div className="notifications-panel"><div className="notifications-head"><strong>Notifications {unread > 0 && <span style={{ color: '#df7052' }}>· {unread} new</span>}</strong>{unread > 0 && <button className="quiet-button" style={{ minHeight: 26, padding: '0 7px', fontSize: 10 }} onClick={() => void readAll()}>Mark all read</button>}</div>
      {notifications.length === 0 ? <EmptyState title="All caught up" detail="Project updates will show up here." /> : notifications.map((item) => <div key={item.id} className={`notification-item${item.isRead ? '' : ' unread'}`} onClick={() => void markRead(item)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') void markRead(item); }}><div><p>{item.message}</p><time>{dateTime(item.createdAt)}</time></div></div>)}
    </div>}
  </div>;
}

export function WorkspaceShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const refreshProjects = useCallback(async () => {
    try { const result = await api<{ projects: Project[] }>('/projects'); setProjects(result.projects); }
    catch (error) { toast(error instanceof Error ? error.message : 'Could not load projects.', 'error'); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void refreshProjects(); }, [refreshProjects]);
  const routeTitle = selectedProject?.name;
  const { projectId } = useParams();
  useEffect(() => { if (!projectId) { setSelectedProject(null); return; } const found = projects.find((p) => p.id === projectId); if (found) setSelectedProject(found); }, [projectId, projects]);
  const doLogout = async () => { try { await logout(); navigate('/login'); } catch { toast('Could not sign out. Please try again.', 'error'); } };
  const side = <aside className="sidebar">
    <Link to="/app" className="brand"><img src="/brand-mark.svg" alt="" /><div><span className="brand-name">Teamflow</span><span className="brand-caption">the shared workbench</span></div></Link>
    <div className="side-section"><span className="side-label" style={{ padding: '0 10px' }}>Workspace</span><Link to="/app" className={`nav-item${!projectId ? ' active' : ''}`} onClick={() => setMobileOpen(false)}><LayoutGrid size={16} />Overview</Link></div>
    <div className="side-section"><div className="panel-title" style={{ padding: '0 10px', margin: 0 }}><span className="side-label">Your projects</span><span>{projects.length}</span></div><div className="project-nav">{loading ? <div style={{ padding: '10px', fontSize: 11, color: '#a1a4aa' }}>Loading…</div> : projects.map((project, index) => <Link to={`/app/projects/${project.id}`} key={project.id} className={`nav-item${projectId === project.id ? ' active' : ''}`} onClick={() => setMobileOpen(false)}><span className="project-dot" style={{ '--dot-color': brandColors[index % brandColors.length] } as React.CSSProperties} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{project.name}</span></Link>)}</div></div>
    <div className="side-bottom"><div className="user-row"><Avatar user={user ?? { name: 'Team member' }} accent /><div className="user-copy"><strong>{user?.name}</strong><span>{user?.email}</span></div><button className="icon-button" style={{ width: 30, height: 30, border: 0 }} aria-label="Sign out" title="Sign out" onClick={() => void doLogout()}><LogOut size={14} /></button></div><div className="nav-item" style={{ marginTop: 7, fontSize: 11, color: '#999ca2' }}><CircleHelp size={15} />Made for teams, by teams</div></div>
  </aside>;
  return <ShellContext.Provider value={{ projects, refreshProjects }}><div className="app-shell">
    {side}
    {mobileOpen && <div className="modal-backdrop" style={{ display: 'block', padding: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setMobileOpen(false); }}>{side}</div>}
    <main className="main-area"><header className="topbar"><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={17} /></button><div className="breadcrumb"><span>Workspace</span><ChevronLeft size={13} style={{ transform: 'rotate(180deg)' }} /><strong>{routeTitle ?? 'Overview'}</strong></div></div><div className="top-actions"><NotificationMenu /><Avatar user={user ?? { name: 'Team member' }} small /></div></header><Outlet /></main>
  </div></ShellContext.Provider>;
}

function ProjectDialog({ onClose, onSaved, project }: { onClose: () => void; onSaved: (project: Project) => void; project?: Project }) {
  const toast = useToast();
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [busy, setBusy] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true);
    try {
      const result = await api<{ project: Project }>(project ? `/projects/${project.id}` : '/projects', { method: project ? 'PATCH' : 'POST', body: JSON.stringify({ name, description }) });
      onSaved(result.project); toast(project ? 'Project details saved.' : 'Project created.'); onClose();
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not save this project.', 'error'); }
    finally { setBusy(false); }
  };
  return <Modal title={project ? 'Project settings' : 'Create a project'} subtitle={project ? 'Keep the team pointed at the same outcome.' : 'Give your team a clear place to move work forward.'} onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancel</button><button form="project-form" className="primary-button" disabled={busy}>{busy ? 'Saving…' : project ? 'Save changes' : 'Create project'}</button></>}>
    <form id="project-form" onSubmit={save}><div className="form-field"><label htmlFor="project-name">Project name</label><input id="project-name" autoFocus required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Product launch" /></div><div className="form-field"><label htmlFor="project-description">Description <span style={{ color: '#a0a3aa', fontWeight: 400 }}>(optional)</span></label><textarea id="project-description" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this team want to make happen?" /></div></form>
  </Modal>;
}

export function DashboardPage() {
  const { projects, refreshProjects } = useShell();
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const navigate = useNavigate();
  const toast = useToast();
  const onSaved = async (project: Project) => { await refreshProjects(); if (!editProject) navigate(`/app/projects/${project.id}`); };
  return <section className="page-content">
    <div className="page-heading"><div><span className="eyebrow">Tuesday, {new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</span><h1>Good work, {user?.name.split(' ')[0]}.</h1><p>Here’s where your team is moving things forward.</p></div><button className="primary-button" onClick={() => setShowCreate(true)}><Plus size={15} />New project</button></div>
    <div className="project-overview"><div className="panel project-list-panel"><div className="panel-title"><h2>Your projects</h2><span>{projects.length} active</span></div>{projects.length === 0 ? <EmptyState title="Start with one shared project" detail="Create a space for the next outcome your team wants to move forward." action={<button className="primary-button" onClick={() => setShowCreate(true)}><Plus size={14} />Create a project</button>} /> : <div className="project-list">{projects.map((project, index) => <div key={project.id} className="project-row"><Link className="project-row-main" to={`/app/projects/${project.id}`}><span className="project-flag" style={{ background: `${brandColors[index % brandColors.length]}18`, color: brandColors[index % brandColors.length] }}><FolderKanban size={16} /></span><span style={{ minWidth: 0 }}><h3>{project.name}</h3><p>{project.description || 'A shared space for the next milestone.'}</p></span></Link><span className="project-meta"><ClipboardCheck size={14} />{project.columns?.reduce((sum, c) => sum + (c._count?.tasks ?? 0), 0) ?? 0} tasks</span><span className="project-meta"><AvatarStack users={project.members.map((m) => m.user)} /></span><button className="icon-button" style={{ width: 30, height: 30 }} disabled={project.ownerId !== user?.id} title={project.ownerId === user?.id ? 'Edit project' : 'Only the owner can edit project details'} aria-label={`Edit ${project.name}`} onClick={() => setEditProject(project)}><MoreHorizontal size={15} /></button></div>)}</div>}</div>
      <aside className="panel activity-panel"><span className="eyebrow">Small steps, shared progress</span><h2>Good work moves forward together.</h2><p>Keep the next action visible, share the context, and let the team take it from there.</p><div className="activity-metric"><div><strong>{projects.length.toString().padStart(2, '0')}</strong><span>shared projects</span></div><div><strong>{projects.reduce((count, project) => count + project.members.length, 0).toString().padStart(2, '0')}</strong><span>collaborators</span></div></div></aside></div>
    <div className="section-row"><h2>At a glance</h2><span>Your recent workspaces</span></div><div className="project-overview" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>{projects.slice(0, 3).map((project, index) => <Link key={project.id} to={`/app/projects/${project.id}`} className="panel" style={{ padding: 17, display: 'flex', alignItems: 'center', gap: 12 }}><span className="project-flag" style={{ background: `${brandColors[index % brandColors.length]}18`, color: brandColors[index % brandColors.length] }}><Sparkles size={15} /></span><div style={{ minWidth: 0 }}><strong style={{ display: 'block', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</strong><span style={{ display: 'block', fontSize: 10, color: '#999ca2', marginTop: 4 }}>{project.members.length} team members</span></div><ArrowRightSmall /></Link>)}{projects.length === 0 && <div className="panel" style={{ padding: 18, color: '#93969d', fontSize: 11 }}>Your recent projects will appear here.</div>}</div>
    {showCreate && <ProjectDialog onClose={() => setShowCreate(false)} onSaved={onSaved} />}{editProject && <ProjectDialog project={editProject} onClose={() => setEditProject(null)} onSaved={onSaved} />}
  </section>;
}
function ArrowRightSmall() { return <span style={{ marginLeft: 'auto', color: '#a0a3aa', fontSize: 16 }}>↗</span>; }

function TaskCard({ task, columnId, onOpen }: { task: Task; columnId: string; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, data: { columnId } });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 };
  return <article ref={setNodeRef} style={style} className={`task-card${isDragging ? ' dragging' : ''}`} onClick={onOpen} {...attributes} {...listeners} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') onOpen(); }}>
    <h3 className="task-title">{task.title}</h3>{task.description && <p className="task-description">{task.description}</p>}<div className="task-labels"><PriorityPill priority={task.priority} /><DueDatePill dueDate={task.dueDate} /></div><div className="task-footer"><div className="task-foot-meta"><span><MessageCircle size={12} style={{ verticalAlign: '-2px' }} /> {task.comments.length}</span>{task.dueDate && <span><CalendarDays size={12} style={{ verticalAlign: '-2px' }} /> {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}</div>{task.assignee ? <Avatar user={task.assignee} small /> : <span className="avatar small" style={{ background: '#f5f4f1', color: '#a3a5aa' }}>—</span>}</div>
  </article>;
}

function BoardColumnView({ column, onAddTask, onEditColumn, onDeleteColumn, onOpenTask }: { column: BoardColumn; onAddTask: () => void; onEditColumn: () => void; onDeleteColumn: () => void; onOpenTask: (task: Task) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane:${column.id}`, data: { columnId: column.id } });
  const [menu, setMenu] = useState(false);
  const colors: Record<number, string> = { 0: '#d79d42', 1: '#6f92b7', 2: '#5d9b7e' };
  return <div ref={setNodeRef} className={`board-column${isOver ? ' drag-over' : ''}`}><div className="column-header"><span className="column-color" style={{ '--lane-color': colors[column.position] ?? '#9b8cc0' } as React.CSSProperties} /><span className="column-title">{column.title}</span><span className="column-count">{column.tasks.length}</span><div style={{ position: 'relative' }}><button className="column-menu" aria-label={`Options for ${column.title}`} onClick={() => setMenu((v) => !v)}><MoreHorizontal size={17} /></button>{menu && <div className="notifications-panel" style={{ width: 165, maxHeight: 'none', right: 0, top: 30 }}><button className="notification-item" onClick={() => { setMenu(false); onEditColumn(); }}><Pencil size={13} /><p>Rename column</p></button><button className="notification-item" onClick={() => { setMenu(false); onDeleteColumn(); }}><Trash2 size={13} /><p>Delete column</p></button></div>}</div></div>
    <SortableContext items={column.tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}><div className="task-stack">{column.tasks.map((task) => <TaskCard key={task.id} task={task} columnId={column.id} onOpen={() => onOpenTask(task)} />)}{column.tasks.length === 0 && <div className="board-empty">Drop a card here to move it along</div>}</div></SortableContext><button className="add-card" onClick={onAddTask}><Plus size={14} />Add a task</button>
  </div>;
}

function ColumnDialog({ mode, initialTitle, onClose, onSave }: { mode: 'add' | 'edit'; initialTitle?: string; onClose: () => void; onSave: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState(initialTitle ?? ''); const [busy, setBusy] = useState(false);
  return <Modal title={mode === 'add' ? 'Add a column' : 'Rename column'} onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" form="column-form" disabled={busy}>{busy ? 'Saving…' : mode === 'add' ? 'Add column' : 'Save name'}</button></>}><form id="column-form" onSubmit={async (event) => { event.preventDefault(); setBusy(true); await onSave(title); setBusy(false); }}><div className="form-field"><label htmlFor="column-title">Column name</label><input id="column-title" autoFocus required maxLength={40} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="In review" /></div></form></Modal>;
}

function TaskDialog({ project, columns, task, initialColumnId, onClose, onSaved, onDeleted }: { project: Project; columns: BoardColumn[]; task?: Task; initialColumnId?: string; onClose: () => void; onSaved: () => Promise<void>; onDeleted: () => Promise<void> }) {
  const { user } = useAuth(); const toast = useToast();
  const [title, setTitle] = useState(task?.title ?? ''); const [description, setDescription] = useState(task?.description ?? ''); const [dueDate, setDueDate] = useState(task?.dueDate?.slice(0, 10) ?? ''); const [priority, setPriority] = useState<Task['priority']>(task?.priority ?? 'MEDIUM'); const [columnId, setColumnId] = useState(task?.columnId ?? initialColumnId ?? columns[0]?.id ?? ''); const [assigneeId, setAssigneeId] = useState(task?.assigneeId ?? ''); const [busy, setBusy] = useState(false); const [comment, setComment] = useState(''); const [comments, setComments] = useState(task?.comments ?? []); const [editingCommentId, setEditingCommentId] = useState<string | null>(null); const [editingContent, setEditingContent] = useState(''); const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { setComments(task?.comments ?? []); }, [task?.id, task?.comments]);
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true);
    try {
      const data = { title, description, columnId, priority, dueDate: dueDate ? new Date(`${dueDate}T12:00:00.000Z`).toISOString() : null, assigneeId: assigneeId || null };
      await api(task ? `/projects/${project.id}/tasks/${task.id}` : `/projects/${project.id}/tasks`, { method: task ? 'PATCH' : 'POST', body: JSON.stringify(data) });
      await onSaved(); toast(task ? 'Task updated.' : 'Task added.'); onClose();
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not save task.', 'error'); }
    finally { setBusy(false); }
  };
  const addComment = async (event: FormEvent) => {
    event.preventDefault(); if (!task || !comment.trim()) return;
    try { const result = await api<{ comment: typeof comments[number] }>(`/projects/${project.id}/tasks/${task.id}/comments`, { method: 'POST', body: JSON.stringify({ content: comment }) }); setComments((current) => [...current, result.comment]); setComment(''); await onSaved(); }
    catch (error) { toast(error instanceof Error ? error.message : 'Could not add comment.', 'error'); }
  };
  const saveComment = async (commentId: string) => {
    if (!task || !editingContent.trim()) return;
    try {
      const result = await api<{ comment: typeof comments[number] }>(`/projects/${project.id}/tasks/${task.id}/comments/${commentId}`, { method: 'PATCH', body: JSON.stringify({ content: editingContent }) });
      setComments((current) => current.map((item) => item.id === commentId ? result.comment : item));
      setEditingCommentId(null); setEditingContent(''); await onSaved(); toast('Comment updated.');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not update comment.', 'error'); }
  };
  const deleteComment = async (commentId: string) => {
    if (!task || !window.confirm('Delete this comment?')) return;
    try { await api(`/projects/${project.id}/tasks/${task.id}/comments/${commentId}`, { method: 'DELETE' }); setComments((current) => current.filter((item) => item.id !== commentId)); await onSaved(); toast('Comment deleted.'); }
    catch (error) { toast(error instanceof Error ? error.message : 'Could not delete comment.', 'error'); }
  };
  const remove = async () => {
    if (!task) return;
    try { await api(`/projects/${project.id}/tasks/${task.id}`, { method: 'DELETE' }); await onDeleted(); toast('Task deleted.'); onClose(); }
    catch (error) { toast(error instanceof Error ? error.message : 'Could not delete task.', 'error'); }
  };
  return <Modal title={task ? 'Task details' : 'Add a task'} subtitle={task ? 'Keep the context close to the work.' : `Add something the team can move forward in ${project.name}.`} onClose={onClose} wide footer={<><button className="quiet-button" style={{ marginRight: 'auto', color: '#bf6250' }} onClick={() => setConfirmDelete(true)}>{task && <><Trash2 size={14} />Delete task</>}</button><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" form="task-form" disabled={busy}>{busy ? 'Saving…' : task ? 'Save task' : 'Create task'}</button></>}>
    <form id="task-form" onSubmit={save}><div className="form-field"><label htmlFor="task-title">Task title</label><input autoFocus id="task-title" required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Write a clear next step" /></div><div className="form-field"><label htmlFor="task-description">Description</label><textarea id="task-description" maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add a little context for the team…" /></div><div className="form-grid"><div className="form-field"><label htmlFor="task-due">Due date</label><input id="task-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div><div className="form-field"><label htmlFor="task-priority">Priority</label><select id="task-priority" value={priority} onChange={(event) => setPriority(event.target.value as Task['priority'])}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></div></div><div className="form-grid"><div className="form-field"><label htmlFor="task-column">Status</label><select id="task-column" value={columnId} onChange={(event) => setColumnId(event.target.value)}>{columns.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}</select></div><div className="form-field"><label htmlFor="task-assignee">Assignee</label><select id="task-assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Unassigned</option>{project.members.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.name}</option>)}</select></div></div></form>
    {task && <section style={{ borderTop: '1px solid #f0efeb', paddingTop: 15, marginTop: 5 }}><div className="panel-title"><h2>Conversation</h2><span>{comments.length} comments · use @email to mention</span></div><div className="comment-list">{comments.length === 0 ? <div style={{ fontSize: 11, color: '#a1a4aa', padding: '4px 0 10px' }}>No comments yet. Add the first bit of context.</div> : comments.map((item) => <div className="comment" key={item.id}><Avatar user={item.user} small /><div className="comment-content"><div className="comment-meta"><strong>{item.user.name}</strong><span>{dateTime(item.createdAt)}</span>{(item.userId === user?.id || project.ownerId === user?.id) && <><button className="icon-button" style={{ width: 24, height: 24, border: 0 }} aria-label="Edit comment" onClick={() => { setEditingCommentId(item.id); setEditingContent(item.content); }}><Pencil size={12} /></button><button className="icon-button" style={{ width: 24, height: 24, border: 0, color: '#bc6250' }} aria-label="Delete comment" onClick={() => void deleteComment(item.id)}><Trash2 size={12} /></button></>}</div>{editingCommentId === item.id ? <div style={{ marginTop: 6 }}><textarea value={editingContent} maxLength={3000} onChange={(event) => setEditingContent(event.target.value)} style={{ width: '100%', minHeight: 55, border: '1px solid #e3e1db', borderRadius: 8, padding: 8, fontSize: 11 }} /><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 5 }}><button className="quiet-button" style={{ minHeight: 28 }} onClick={() => setEditingCommentId(null)}>Cancel</button><button className="primary-button" style={{ minHeight: 28 }} onClick={() => void saveComment(item.id)}><Check size={12} />Save</button></div></div> : <p>{item.content}</p>}</div></div>)}</div><form className="comment-compose" onSubmit={addComment}><textarea aria-label="Write a comment" maxLength={3000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder={`Write a comment${user ? `, ${user.name.split(' ')[0]}` : ''}…`} /><button type="submit" className="primary-button" style={{ minHeight: 36 }} disabled={!comment.trim()}><MessageCircle size={14} />Send</button></form></section>}
    {confirmDelete && <div className="modal-backdrop" style={{ zIndex: 30 }}><div className="modal"><div className="modal-header"><h2>Delete this task?</h2><button className="icon-button" onClick={() => setConfirmDelete(false)}><X size={16} /></button></div><div className="modal-body"><p style={{ fontSize: 12, color: '#747983', margin: 0 }}>This will remove the task and its comments from the project.</p></div><div className="modal-footer"><button className="secondary-button" onClick={() => setConfirmDelete(false)}>Keep task</button><button className="danger-button" onClick={() => void remove()}>Delete task</button></div></div></div>}
  </Modal>;
}

function MemberDialog({ project, onClose, onChanged }: { project: Project; onClose: () => void; onChanged: () => Promise<void> }) {
  const { user } = useAuth(); const toast = useToast(); const [email, setEmail] = useState(''); const [invitePath, setInvitePath] = useState(''); const [busy, setBusy] = useState(false);
  const owner = project.ownerId === user?.id;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true);
    try {
      const result = await api<{ member?: unknown; invitation?: { invitePath: string; email: string } }>(`/projects/${project.id}/members`, { method: 'POST', body: JSON.stringify({ email }) });
      if (result.invitation) { setInvitePath(`${window.location.origin}${result.invitation.invitePath}`); toast('Invitation link created. Copy it to share.'); }
      else { setEmail(''); await onChanged(); toast('Project member added.'); }
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not add member.', 'error'); }
    finally { setBusy(false); }
  };
  const remove = async (userId: string) => {
    try { await api(`/projects/${project.id}/members/${userId}`, { method: 'DELETE' }); await onChanged(); toast('Member removed.'); }
    catch (error) { toast(error instanceof Error ? error.message : 'Could not remove member.', 'error'); }
  };
  return <Modal title="People on this project" subtitle="A focused team makes the next step easier." onClose={onClose} wide>
    <div className="comment-list" style={{ maxHeight: 230 }}>{project.members.map((member) => <div key={member.user.id} className="user-row" style={{ borderBottom: '1px solid #f1f0ec', padding: '9px 3px' }}><Avatar user={member.user} /><div className="user-copy"><strong>{member.user.name} {member.user.id === user?.id && <span style={{ color: '#999ca2' }}>(you)</span>}</strong><span>{member.user.email}</span></div><span className="pill" style={{ background: member.role === 'OWNER' ? '#f8e7e0' : '#f1f0ed', color: member.role === 'OWNER' ? '#ba6148' : '#7a7e86' }}>{member.role === 'OWNER' ? 'Owner' : 'Member'}</span>{owner && member.role !== 'OWNER' && <button className="icon-button" aria-label={`Remove ${member.user.name}`} onClick={() => void remove(member.user.id)}><X size={14} /></button>}</div>)}</div>
    {owner && <form onSubmit={submit} style={{ marginTop: 20 }}><div className="form-field"><label htmlFor="invite-email">Add a member by email</label><div style={{ display: 'flex', gap: 8 }}><input id="invite-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@company.com" /><button className="primary-button" disabled={busy}>{busy ? 'Adding…' : <><Plus size={14} />Add</>}</button></div><span style={{ fontSize: 10, color: '#999ca2' }}>Existing accounts join now. New people receive a one-time invitation link you can share.</span></div></form>}
    {invitePath && <div className="invite-code"><span style={{ flex: 1 }}>{invitePath}</span><button className="secondary-button" style={{ minHeight: 30, padding: '0 9px' }} onClick={() => { void navigator.clipboard.writeText(invitePath).then(() => toast('Invitation link copied.')); }}><ClipboardCheck size={13} />Copy</button></div>}
  </Modal>;
}

export function BoardPage() {
  const { projectId = '' } = useParams(); const { projects, refreshProjects } = useShell(); const { user } = useAuth(); const toast = useToast(); const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [query, setQuery] = useState(''); const [taskDialog, setTaskDialog] = useState<{ task?: Task; columnId?: string } | null>(null); const [columnDialog, setColumnDialog] = useState<{ mode: 'add' | 'edit'; column?: BoardColumn } | null>(null); const [showMembers, setShowMembers] = useState(false); const [showSettings, setShowSettings] = useState(false); const [activeTask, setActiveTask] = useState<Task | null>(null); const [filterPriority, setFilterPriority] = useState('ALL');
  const loadProject = useCallback(async () => {
    if (!projectId) return;
    try { const result = await api<{ project: Project }>(`/projects/${projectId}`); setProject(result.project); setError(''); }
    catch (reason) { const message = reason instanceof Error ? reason.message : 'Could not open this project.'; setError(message); }
    finally { setLoading(false); }
  }, [projectId]);
  useEffect(() => { setLoading(true); void loadProject(); }, [loadProject]);
  useEffect(() => {
    if (!projectId) return;
    const socket: Socket = io({ withCredentials: true });
    socket.on('connect', () => socket.emit('project:join', projectId, (result: { ok: boolean }) => { if (!result.ok) setError('You no longer have access to this project.'); }));
    socket.on('project:event', (event: { type: string }) => {
      if (event.type === 'project.deleted') { toast('This project was deleted by its owner.', 'info'); navigate('/app'); }
      else void loadProject();
    });
    return () => { socket.emit('project:leave', projectId); socket.disconnect(); };
  }, [projectId, loadProject, navigate, toast]);
  const saveProject = async (updated: Project) => { setProject((current) => current ? { ...current, ...updated } : updated); await refreshProjects(); };
  const addTask = (columnId: string) => setTaskDialog({ columnId });
  const updateTask = async (task: Task, columnId: string, position: number) => {
    try { await api(`/projects/${projectId}/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ columnId, position }) }); await loadProject(); }
    catch (reason) { toast(reason instanceof Error ? reason.message : 'Could not move this task.', 'error'); await loadProject(); }
  };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const dragStart = (event: DragStartEvent) => { const task = project?.columns.flatMap((c) => c.tasks).find((item) => item.id === String(event.active.id)); setActiveTask(task ?? null); };
  const dragEnd = async (event: DragEndEvent) => {
    setActiveTask(null); if (!project || !event.over) return;
    const task = project.columns.flatMap((column) => column.tasks).find((item) => item.id === String(event.active.id)); if (!task) return;
    const overId = String(event.over.id); let destination = project.columns.find((column) => column.id === overId.replace(/^lane:/, ''));
    let position = 0;
    if (!destination) {
      destination = project.columns.find((column) => column.tasks.some((item) => item.id === overId));
      if (destination) position = Math.max(0, destination.tasks.findIndex((item) => item.id === overId));
    }
    if (!destination) return;
    const sourceColumn = task.columnId;
    const samePosition = sourceColumn === destination.id && project.columns.find((column) => column.id === destination?.id)?.tasks.findIndex((item) => item.id === task.id) === position;
    if (samePosition) return;
    await updateTask(task, destination.id, position);
  };
  const onDeleteProject = async () => {
    if (!project || !window.confirm(`Delete “${project.name}” and all its board content?`)) return;
    try { await api(`/projects/${project.id}`, { method: 'DELETE' }); await refreshProjects(); navigate('/app'); toast('Project deleted.'); }
    catch (reason) { toast(reason instanceof Error ? reason.message : 'Could not delete project.', 'error'); }
  };
  const renameColumn = async (column: BoardColumn, title: string) => { try { await api(`/projects/${projectId}/columns/${column.id}`, { method: 'PATCH', body: JSON.stringify({ title }) }); setColumnDialog(null); await loadProject(); toast('Column renamed.'); } catch (reason) { toast(reason instanceof Error ? reason.message : 'Could not rename column.', 'error'); } };
  const deleteColumn = async (column: BoardColumn) => { if (!window.confirm(`Delete the empty “${column.title}” column?`)) return; try { await api(`/projects/${projectId}/columns/${column.id}`, { method: 'DELETE' }); await loadProject(); toast('Column deleted.'); } catch (reason) { toast(reason instanceof Error ? reason.message : 'Could not delete column.', 'error'); } };
  const createColumn = async (title: string) => { try { await api(`/projects/${projectId}/columns`, { method: 'POST', body: JSON.stringify({ title }) }); setColumnDialog(null); await loadProject(); toast('Column added.'); } catch (reason) { toast(reason instanceof Error ? reason.message : 'Could not add column.', 'error'); } };
  const filteredColumns = useMemo(() => (project?.columns ?? []).map((column) => ({ ...column, tasks: column.tasks.filter((task) => (!query || `${task.title} ${task.description}`.toLowerCase().includes(query.toLowerCase())) && (filterPriority === 'ALL' || task.priority === filterPriority)) })), [project, query, filterPriority]);
  if (loading) return <LoadingState label="Opening the board…" />;
  if (!project) return <section className="page-content"><EmptyState title="We couldn’t open this project" detail={error || 'It may have been removed or you may not be a member.'} action={<Link to="/app" className="secondary-button">Back to projects</Link>} /></section>;
  const isOwner = project.ownerId === user?.id;
  return <section className="page-content" style={{ maxWidth: 'none', paddingRight: 30 }}>
    <div className="page-heading"><div><div className="breadcrumb" style={{ marginBottom: 7 }}><Link to="/app">Projects</Link><ChevronLeft size={12} style={{ transform: 'rotate(180deg)' }} /><strong>{project.name}</strong></div><h1>{project.name}</h1><p>{project.description || 'A shared space for the next milestone.'}</p></div><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><button className="secondary-button" onClick={() => setShowMembers(true)}><Users size={14} />People <span className="pill" style={{ padding: '3px 6px', background: '#f0efeb', color: '#777c85' }}>{project.members.length}</span></button><button className="icon-button" aria-label="Project settings" onClick={() => setShowSettings(true)}><Settings2 size={15} /></button></div></div>
    <div className="board-toolbar"><div><span className="eyebrow">Board</span><div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5, color: '#8f939a', fontSize: 10 }}><Clock3 size={12} />Last updated just now <span style={{ color: '#d4d2cb' }}>·</span><AvatarStack users={project.members.map((member) => member.user)} /></div></div><div className="board-tools"><label className="search-box"><Search size={14} /><input aria-label="Search tasks" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" /></label><label className="filter-button"><Filter size={13} /><select aria-label="Filter by priority" value={filterPriority} onChange={(event) => setFilterPriority(event.target.value)} style={{ border: 0, background: 'transparent', outline: 'none', color: 'inherit', fontSize: 11 }}><option value="ALL">All priorities</option><option value="HIGH">High priority</option><option value="MEDIUM">Medium priority</option><option value="LOW">Low priority</option></select></label><button className="primary-button" onClick={() => addTask(project.columns[0]?.id ?? '')}><Plus size={14} />Add task</button></div></div>
    {error && <div className="panel" style={{ padding: 12, marginBottom: 15, color: '#ba594b', fontSize: 11 }}>{error}</div>}
    <DndContext sensors={sensors} onDragStart={dragStart} onDragEnd={(event) => void dragEnd(event)}><div className="board-scroller"><div className="board">{filteredColumns.map((column) => <BoardColumnView key={column.id} column={column} onAddTask={() => addTask(column.id)} onEditColumn={() => setColumnDialog({ mode: 'edit', column })} onDeleteColumn={() => void deleteColumn(column)} onOpenTask={(task) => setTaskDialog({ task })} />)}<button className="add-column" onClick={() => setColumnDialog({ mode: 'add' })}><Plus size={15} />Add a column</button></div></div><DragOverlay>{activeTask ? <article className="task-card" style={{ width: 280, boxShadow: '0 14px 35px #22283322' }}><h3 className="task-title">{activeTask.title}</h3><div className="task-labels"><PriorityPill priority={activeTask.priority} /><DueDatePill dueDate={activeTask.dueDate} /></div></article> : null}</DragOverlay></DndContext>
    {taskDialog && <TaskDialog project={project} columns={project.columns} task={taskDialog.task} initialColumnId={taskDialog.columnId} onClose={() => setTaskDialog(null)} onSaved={loadProject} onDeleted={loadProject} />}
    {columnDialog && <ColumnDialog mode={columnDialog.mode} initialTitle={columnDialog.column?.title} onClose={() => setColumnDialog(null)} onSave={(title) => columnDialog.mode === 'add' ? createColumn(title) : renameColumn(columnDialog.column!, title)} />}
    {showMembers && <MemberDialog project={project} onClose={() => setShowMembers(false)} onChanged={loadProject} />}
    {showSettings && <Modal title="Project settings" subtitle="Keep the project details in step with the work." onClose={() => setShowSettings(false)} footer={<button className="secondary-button" onClick={() => setShowSettings(false)}>Done</button>}>
      <ProjectSettings project={project} isOwner={isOwner} onSave={async (name, description) => { await api(`/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ name, description }) }); await loadProject(); await refreshProjects(); toast('Project details updated.'); setShowSettings(false); }} onDelete={onDeleteProject} onMembers={() => { setShowSettings(false); setShowMembers(true); }} />
    </Modal>}
  </section>;
}

function ProjectSettings({ project, isOwner, onSave, onDelete, onMembers }: { project: Project; isOwner: boolean; onSave: (name: string, description: string) => Promise<void>; onDelete: () => Promise<void>; onMembers: () => void }) {
  const [name, setName] = useState(project.name); const [description, setDescription] = useState(project.description); const [busy, setBusy] = useState(false);
  return <div><form onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { await onSave(name, description); } finally { setBusy(false); } }}><div className="form-field"><label htmlFor="settings-project-name">Project name</label><input id="settings-project-name" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} /></div><div className="form-field"><label htmlFor="settings-project-description">Description</label><textarea id="settings-project-description" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!isOwner} /></div>{isOwner && <button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</button>}</form><div style={{ borderTop: '1px solid #f0efeb', marginTop: 18, paddingTop: 16, display: 'flex', justifyContent: 'space-between', gap: 10 }}><button className="secondary-button" onClick={onMembers}><Users size={14} />Manage people</button>{isOwner && <button className="danger-button" onClick={() => void onDelete()}><Trash2 size={14} />Delete project</button>}</div></div>;
}
