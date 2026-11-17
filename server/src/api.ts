import { createHash, randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Server } from 'socket.io';
import { prisma } from './db';
import { clearSession, requireAuth, setSession } from './auth';
import { asyncRoute, HttpError, requireId, validate } from './errors';
import type { SessionUser } from './types';

const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const idParam = z.string().min(1).max(80);
const prioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must contain at least 2 characters.').max(60),
  email: emailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters.').max(72).refine((value) => Buffer.byteLength(value) <= 72, 'Password must be at most 72 UTF-8 bytes.'),
  invitationToken: z.string().min(20).max(160).optional()
});
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(72) });
const projectSchema = z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().max(500).optional() });
const columnSchema = z.object({ title: z.string().trim().min(1).max(40) });
const taskSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(4000).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  priority: prioritySchema.optional(),
  assigneeId: idParam.nullable().optional(),
  columnId: idParam
});
const taskPatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(4000).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  priority: prioritySchema.optional(),
  assigneeId: idParam.nullable().optional(),
  columnId: idParam.optional(),
  position: z.number().int().min(0).max(10000).optional()
}).refine((value) => Object.keys(value).length > 0, 'At least one task field must be provided.');
const commentSchema = z.object({ content: z.string().trim().min(1).max(3000) });

function currentUser(req: Request): SessionUser {
  return (req as Request & { user: SessionUser }).user;
}
function projectRoom(projectId: string) { return `project:${projectId}`; }
function notifyUser(io: Server, userId: string, notification: unknown) { io.to(`user:${userId}`).emit('notification:new', notification); }
function projectEvent(io: Server, projectId: string, type: string, data: unknown) {
  io.to(projectRoom(projectId)).emit('project:event', { type, data, projectId, at: new Date().toISOString() });
}
async function memberRole(projectId: string, userId: string) {
  return prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { role: true } });
}
async function requireMember(projectId: string, userId: string) {
  const member = await memberRole(projectId, userId);
  if (!member) throw new HttpError(403, 'You are not a member of this project.', 'PROJECT_ACCESS_DENIED');
  return member;
}
async function requireOwner(projectId: string, userId: string) {
  const member = await requireMember(projectId, userId);
  if (member.role !== 'OWNER') throw new HttpError(403, 'Only the project owner can do that.', 'OWNER_REQUIRED');
  return member;
}
async function requireTask(projectId: string, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, projectId } });
  if (!task) throw new HttpError(404, 'Task not found.', 'TASK_NOT_FOUND');
  return task;
}
async function validateColumn(projectId: string, columnId: string) {
  const column = await prisma.column.findFirst({ where: { id: columnId, projectId } });
  if (!column) throw new HttpError(400, 'Choose a column in this project.', 'INVALID_COLUMN');
  return column;
}
async function validateAssignee(projectId: string, assigneeId: string | null | undefined) {
  if (assigneeId == null) return;
  const membership = await memberRole(projectId, assigneeId);
  if (!membership) throw new HttpError(400, 'Assignees must be members of this project.', 'INVALID_ASSIGNEE');
}
function publicUser(user: { id: string; name: string; email: string }) { return { id: user.id, name: user.name, email: user.email, initials: user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() }; }
function tokenHash(token: string) { return createHash('sha256').update(token).digest('hex'); }

export function createApiRouter(io: Server) {
  const router = Router();
  const publicAuthPaths = new Set(['/auth/register', '/auth/login', '/auth/logout']);
  router.use((req, res, next) => { if (publicAuthPaths.has(req.path)) return next(); requireAuth(req, res, next); });

  router.post('/auth/register', asyncRoute(async (req, res) => {
    const input = validate(registerSchema, req.body);
    let invite: { id: string; projectId: string; email: string; expiresAt: Date; acceptedAt: Date | null } | null = null;
    if (input.invitationToken) {
      invite = await prisma.projectInvitation.findUnique({ where: { tokenHash: tokenHash(input.invitationToken) }, select: { id: true, projectId: true, email: true, expiresAt: true, acceptedAt: true } });
      if (!invite || invite.acceptedAt || invite.expiresAt < new Date() || invite.email !== input.email) throw new HttpError(400, 'This invitation is expired, already used, or does not match the account email.', 'INVITATION_INVALID');
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    let user;
    try {
      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { name: input.name, email: input.email, passwordHash } });
        if (invite) {
          await tx.projectMember.create({ data: { projectId: invite.projectId, userId: created.id, role: 'MEMBER' } });
          await tx.projectInvitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
          await tx.notification.create({ data: { userId: created.id, type: 'ADDED_TO_PROJECT', message: 'You joined a project from an invitation.', link: `/app/projects/${invite.projectId}` } });
        }
        return created;
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new HttpError(409, 'An account with this email already exists.', 'EMAIL_ALREADY_REGISTERED');
      throw error;
    }
    const session = publicUser(user);
    setSession(res, session);
    if (invite) projectEvent(io, invite.projectId, 'member.added', session);
    res.status(201).json({ user: session });
  }));

  router.post('/auth/login', asyncRoute(async (req, res) => {
    const input = validate(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) throw new HttpError(401, 'Email or password is incorrect.', 'INVALID_CREDENTIALS');
    const session = publicUser(user);
    setSession(res, session);
    res.json({ user: session });
  }));

  router.post('/auth/logout', (_req, res) => { clearSession(res); res.status(204).end(); });
  router.get('/auth/me', asyncRoute(async (req, res) => {
    const session = currentUser(req);
    const user = await prisma.user.findUnique({ where: { id: session.id }, select: { id: true, name: true, email: true } });
    if (!user) throw new HttpError(401, 'Your account is no longer available.', 'ACCOUNT_NOT_FOUND');
    res.json({ user: publicUser(user) });
  }));

  router.get('/projects', asyncRoute(async (req, res) => {
    const user = currentUser(req);
    const projects = await prisma.project.findMany({
      where: { members: { some: { userId: user.id } } },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } }, columns: { orderBy: { position: 'asc' }, include: { _count: { select: { tasks: true } } } }, _count: { select: { tasks: true } } },
      orderBy: { updatedAt: 'desc' }
    });
    res.json({ projects: projects.map((project) => ({ ...project, members: project.members.map((m) => ({ role: m.role, joinedAt: m.joinedAt, user: publicUser(m.user) })) })) });
  }));

  router.post('/projects', asyncRoute(async (req, res) => {
    const input = validate(projectSchema, req.body);
    const user = currentUser(req);
    const project = await prisma.project.create({
      data: {
        name: input.name,
        description: input.description ?? '',
        ownerId: user.id,
        members: { create: { userId: user.id, role: 'OWNER' } },
        columns: { create: [{ title: 'To Do', position: 0 }, { title: 'In Progress', position: 1 }, { title: 'Done', position: 2 }] }
      },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } }, columns: { orderBy: { position: 'asc' }, include: { tasks: true } } }
    });
    projectEvent(io, project.id, 'project.created', project);
    res.status(201).json({ project });
  }));

  router.get('/projects/:projectId', asyncRoute(async (req, res) => {
    const projectId = requireId(req.params.projectId, 'project ID');
    const user = currentUser(req);
    await requireMember(projectId, user.id);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: {
          orderBy: { joinedAt: 'asc' },
          include: { user: { select: { id: true, name: true, email: true } } }
        },
        columns: {
          orderBy: { position: 'asc' },
          include: {
            tasks: {
              orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
              include: {
                assignee: { select: { id: true, name: true, email: true } },
                comments: {
                  orderBy: { createdAt: 'asc' },
                  include: { user: { select: { id: true, name: true, email: true } } }
                }
              }
            }
          }
        }
      }
    });
    if (!project) throw new HttpError(404, 'Project not found.', 'PROJECT_NOT_FOUND');
    res.json({ project: { ...project, members: project.members.map((m) => ({ role: m.role, joinedAt: m.joinedAt, user: publicUser(m.user) })) } });
  }));

  router.patch('/projects/:projectId', asyncRoute(async (req, res) => {
    const projectId = requireId(req.params.projectId, 'project ID');
    const input = validate(projectSchema.partial().refine((value) => Object.keys(value).length > 0, 'Update at least one project field.'), req.body);
    await requireOwner(projectId, currentUser(req).id);
    const project = await prisma.project.update({ where: { id: projectId }, data: input });
    projectEvent(io, projectId, 'project.updated', project);
    res.json({ project });
  }));

  router.delete('/projects/:projectId', asyncRoute(async (req, res) => {
    const projectId = requireId(req.params.projectId, 'project ID');
    const user = currentUser(req);
    await requireOwner(projectId, user.id);
    await prisma.$transaction(async (tx) => {
      await tx.task.deleteMany({ where: { projectId } });
      await tx.project.delete({ where: { id: projectId } });
    });
    projectEvent(io, projectId, 'project.deleted', { projectId });
    await io.in(projectRoom(projectId)).socketsLeave(projectRoom(projectId));
    res.status(204).end();
  }));

  router.get('/projects/:projectId/members', asyncRoute(async (req, res) => {
    const projectId = requireId(req.params.projectId, 'project ID');
    await requireMember(projectId, currentUser(req).id);
    const members = await prisma.projectMember.findMany({ where: { projectId }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { joinedAt: 'asc' } });
    res.json({ members: members.map((m) => ({ role: m.role, joinedAt: m.joinedAt, user: publicUser(m.user) })) });
  }));

  router.post('/projects/:projectId/members', asyncRoute(async (req, res) => {
    const projectId = requireId(req.params.projectId, 'project ID');
    const user = currentUser(req);
    await requireOwner(projectId, user.id);
    const { email } = validate(z.object({ email: emailSchema }), req.body);
    const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } });
    if (!existingUser) {
      const token = randomBytes(32).toString('base64url');
      const invitation = await prisma.projectInvitation.create({ data: { projectId, createdById: user.id, email, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } });
      return res.status(201).json({ invitation: { id: invitation.id, email, expiresAt: invitation.expiresAt, invitePath: `/invite/${token}` } });
    }
    const alreadyMember = await memberRole(projectId, existingUser.id);
    if (alreadyMember) throw new HttpError(409, 'This person is already a project member.', 'ALREADY_MEMBER');
    const membership = await prisma.projectMember.create({ data: { projectId, userId: existingUser.id, role: 'MEMBER' }, include: { user: { select: { id: true, name: true, email: true } } } });
    const notification = await prisma.notification.create({ data: { userId: existingUser.id, type: 'ADDED_TO_PROJECT', message: `${user.name} added you to a project.`, link: `/app/projects/${projectId}` } });
    projectEvent(io, projectId, 'member.added', { user: publicUser(membership.user), role: membership.role });
    notifyUser(io, existingUser.id, notification);
    res.status(201).json({ member: { role: membership.role, joinedAt: membership.joinedAt, user: publicUser(membership.user) } });
  }));

  router.delete('/projects/:projectId/members/:userId', asyncRoute(async (req, res) => {
    const projectId = requireId(req.params.projectId, 'project ID');
    const targetId = requireId(req.params.userId, 'user ID');
    const user = currentUser(req);
    await requireOwner(projectId, user.id);
    if (targetId === user.id) throw new HttpError(400, 'The owner cannot remove themself from the project.', 'CANNOT_REMOVE_OWNER');
    const membership = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: targetId } } });
    if (!membership) throw new HttpError(404, 'Project member not found.', 'MEMBER_NOT_FOUND');
    await prisma.$transaction([
      prisma.projectMember.delete({ where: { projectId_userId: { projectId, userId: targetId } } }),
      prisma.task.updateMany({ where: { projectId, assigneeId: targetId }, data: { assigneeId: null } })
    ]);
    await io.in(`user:${targetId}`).socketsLeave(projectRoom(projectId));
    projectEvent(io, projectId, 'member.removed', { userId: targetId });
    res.status(204).end();
  }));

  router.post('/invitations/:token/accept', asyncRoute(async (req, res) => {
    const token = requireId(req.params.token, 'invitation token');
    const user = currentUser(req);
    const invitation = await prisma.projectInvitation.findUnique({ where: { tokenHash: tokenHash(token) } });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date() || invitation.email !== user.email) throw new HttpError(400, 'This invitation is expired or does not match your account.', 'INVITATION_INVALID');
    await prisma.$transaction([
      prisma.projectMember.upsert({ where: { projectId_userId: { projectId: invitation.projectId, userId: user.id } }, update: {}, create: { projectId: invitation.projectId, userId: user.id, role: 'MEMBER' } }),
      prisma.projectInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } })
    ]);
    const notification = await prisma.notification.create({ data: { userId: user.id, type: 'ADDED_TO_PROJECT', message: 'You joined a project from an invitation.', link: `/app/projects/${invitation.projectId}` } });
    notifyUser(io, user.id, notification);
    projectEvent(io, invitation.projectId, 'member.added', { userId: user.id, name: user.name });
    res.json({ projectId: invitation.projectId });
  }));

  router.post('/projects/:projectId/columns', asyncRoute(async (req, res) => {
    const projectId = requireId(req.params.projectId, 'project ID');
    await requireMember(projectId, currentUser(req).id);
    const { title } = validate(columnSchema, req.body);
    const position = await prisma.column.count({ where: { projectId } });
    const column = await prisma.column.create({ data: { projectId, title, position } });
    projectEvent(io, projectId, 'column.created', column);
    res.status(201).json({ column });
  }));

  router.patch('/projects/:projectId/columns/:columnId', asyncRoute(async (req, res) => {
    const projectId = requireId(req.params.projectId, 'project ID');
    const columnId = requireId(req.params.columnId, 'column ID');
    await requireMember(projectId, currentUser(req).id);
    const { title } = validate(columnSchema, req.body);
    const existing = await prisma.column.findFirst({ where: { id: columnId, projectId } });
    if (!existing) throw new HttpError(404, 'Column not found.', 'COLUMN_NOT_FOUND');
    const column = await prisma.column.update({ where: { id: columnId }, data: { title } });
    projectEvent(io, projectId, 'column.updated', column);
    res.json({ column });
  }));

  router.delete('/projects/:projectId/columns/:columnId', asyncRoute(async (req, res) => {
    const projectId = requireId(req.params.projectId, 'project ID');
    const columnId = requireId(req.params.columnId, 'column ID');
    await requireMember(projectId, currentUser(req).id);
    const existing = await prisma.column.findFirst({ where: { id: columnId, projectId }, include: { _count: { select: { tasks: true } } } });
    if (!existing) throw new HttpError(404, 'Column not found.', 'COLUMN_NOT_FOUND');
    if (existing._count.tasks > 0) throw new HttpError(409, 'Move the tasks to another column before deleting this one.', 'COLUMN_NOT_EMPTY');
    await prisma.column.delete({ where: { id: columnId } });
    projectEvent(io, projectId, 'column.deleted', { columnId });
    res.status(204).end();
  }));

  router.post('/projects/:projectId/tasks', asyncRoute(async (req, res) => {
    const projectId = requireId(req.params.projectId, 'project ID');
    await requireMember(projectId, currentUser(req).id);
    const input = validate(taskSchema, req.body);
    await validateColumn(projectId, input.columnId);
    await validateAssignee(projectId, input.assigneeId);
    const position = await prisma.task.count({ where: { projectId, columnId: input.columnId } });
    const task = await prisma.task.create({
      data: { ...input, projectId, position, description: input.description ?? '', dueDate: input.dueDate ? new Date(input.dueDate) : null },
      include: { assignee: { select: { id: true, name: true, email: true } }, comments: true }
    });
    if (task.assigneeId) {
      const notification = await prisma.notification.create({ data: { userId: task.assigneeId, type: 'ASSIGNED', message: `${currentUser(req).name} assigned you “${task.title}”.`, link: `/app/projects/${projectId}` } });
      notifyUser(io, task.assigneeId, notification);
    }
    projectEvent(io, projectId, 'task.created', task);
    res.status(201).json({ task });
  }));

  router.patch('/projects/:projectId/tasks/:taskId', asyncRoute(async (req, res) => {
    const projectId = requireId(req.params.projectId, 'project ID');
    const taskId = requireId(req.params.taskId, 'task ID');
    const actor = currentUser(req);
    await requireMember(projectId, actor.id);
    const input = validate(taskPatchSchema, req.body);
    const existing = await requireTask(projectId, taskId);
    if (input.columnId) await validateColumn(projectId, input.columnId);
    if (Object.prototype.hasOwnProperty.call(input, 'assigneeId')) await validateAssignee(projectId, input.assigneeId);
    let task;
    if (input.columnId || input.position !== undefined) {
      const targetColumn = input.columnId ?? existing.columnId;
      const targetPosition = input.position ?? 0;
      task = await prisma.$transaction(async (tx) => {
        const siblings = await tx.task.findMany({ where: { projectId, columnId: targetColumn, id: { not: taskId } }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
        const insertAt = Math.min(targetPosition, siblings.length);
        const ordered = [...siblings];
        ordered.splice(insertAt, 0, existing);
        await Promise.all(ordered.map((row, position) => tx.task.update({ where: { id: row.id }, data: { columnId: targetColumn, position } })));
        const { columnId: _columnId, position: _position, ...fields } = input;
        return tx.task.update({ where: { id: taskId }, data: { ...fields, columnId: targetColumn, position: insertAt, dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null }, include: { assignee: { select: { id: true, name: true, email: true } }, comments: true } });
      });
    } else {
      task = await prisma.task.update({ where: { id: taskId }, data: { ...input, dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null }, include: { assignee: { select: { id: true, name: true, email: true } }, comments: true } });
    }
    if (input.assigneeId && input.assigneeId !== existing.assigneeId) {
      const notification = await prisma.notification.create({ data: { userId: input.assigneeId, type: 'ASSIGNED', message: `${actor.name} assigned you “${task.title}”.`, link: `/app/projects/${projectId}` } });
      notifyUser(io, input.assigneeId, notification);
    }
    projectEvent(io, projectId, 'task.updated', task);
    res.json({ task });
  }));

  router.delete('/projects/:projectId/tasks/:taskId', asyncRoute(async (req, res) => {
    const projectId = requireId(req.params.projectId, 'project ID');
    const taskId = requireId(req.params.taskId, 'task ID');
    await requireMember(projectId, currentUser(req).id);
    await requireTask(projectId, taskId);
    await prisma.task.delete({ where: { id: taskId } });
    projectEvent(io, projectId, 'task.deleted', { taskId });
    res.status(204).end();
  }));

  router.post('/projects/:projectId/tasks/:taskId/comments', asyncRoute(async (req, res) => {
    const projectId = requireId(req.params.projectId, 'project ID');
    const taskId = requireId(req.params.taskId, 'task ID');
    const actor = currentUser(req);
    await requireMember(projectId, actor.id);
    const input = validate(commentSchema, req.body);
    const task = await requireTask(projectId, taskId);
    const comment = await prisma.comment.create({ data: { taskId, userId: actor.id, content: input.content }, include: { user: { select: { id: true, name: true, email: true } } } });
    const mentionedEmails = Array.from(input.content.matchAll(/(?:^|\s)@([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi)).map((match) => match[1].toLowerCase());
    const recipientConditions = [
      ...(task.assigneeId ? [{ userId: task.assigneeId }] : []),
      ...(mentionedEmails.length ? [{ user: { email: { in: mentionedEmails } } }] : [])
    ];
    const members = recipientConditions.length ? await prisma.projectMember.findMany({ where: { projectId, OR: recipientConditions }, include: { user: { select: { id: true, name: true, email: true } } } }) : [];
    const recipients = new Map<string, { type: 'COMMENTED' | 'MENTIONED'; message: string }>();
    for (const member of members) {
      if (member.userId === actor.id) continue;
      const isMention = mentionedEmails.includes(member.user.email);
      recipients.set(member.userId, { type: isMention ? 'MENTIONED' : 'COMMENTED', message: isMention ? `${actor.name} mentioned you in a task comment.` : `${actor.name} commented on a task assigned to you.` });
    }
    const notifications = await Promise.all(Array.from(recipients, async ([userId, value]) => prisma.notification.create({ data: { userId, type: value.type, message: value.message, link: `/app/projects/${projectId}` } })));
    for (const notification of notifications) notifyUser(io, notification.userId, notification);
    projectEvent(io, projectId, 'comment.created', { taskId, comment: { ...comment, user: publicUser(comment.user) } });
    res.status(201).json({ comment: { ...comment, user: publicUser(comment.user) } });
  }));

  router.patch('/projects/:projectId/tasks/:taskId/comments/:commentId', asyncRoute(async (req, res) => {
    const projectId = requireId(req.params.projectId, 'project ID');
    const taskId = requireId(req.params.taskId, 'task ID');
    const commentId = requireId(req.params.commentId, 'comment ID');
    const actor = currentUser(req);
    await requireMember(projectId, actor.id);
    const input = validate(commentSchema, req.body);
    await requireTask(projectId, taskId);
    const existing = await prisma.comment.findFirst({ where: { id: commentId, taskId }, include: { task: { select: { projectId: true } } } });
    if (!existing) throw new HttpError(404, 'Comment not found.', 'COMMENT_NOT_FOUND');
    const membership = await requireMember(projectId, actor.id);
    if (existing.userId !== actor.id && membership.role !== 'OWNER') throw new HttpError(403, 'Only the author or project owner can edit this comment.', 'COMMENT_EDIT_DENIED');
    const comment = await prisma.comment.update({ where: { id: commentId }, data: { content: input.content }, include: { user: { select: { id: true, name: true, email: true } } } });
    projectEvent(io, projectId, 'comment.updated', { taskId, comment: { ...comment, user: publicUser(comment.user) } });
    res.json({ comment: { ...comment, user: publicUser(comment.user) } });
  }));

  router.delete('/projects/:projectId/tasks/:taskId/comments/:commentId', asyncRoute(async (req, res) => {
    const projectId = requireId(req.params.projectId, 'project ID');
    const taskId = requireId(req.params.taskId, 'task ID');
    const commentId = requireId(req.params.commentId, 'comment ID');
    const actor = currentUser(req);
    await requireMember(projectId, actor.id);
    const comment = await prisma.comment.findFirst({ where: { id: commentId, taskId } });
    if (!comment) throw new HttpError(404, 'Comment not found.', 'COMMENT_NOT_FOUND');
    const membership = await requireMember(projectId, actor.id);
    if (comment.userId !== actor.id && membership.role !== 'OWNER') throw new HttpError(403, 'Only the author or project owner can delete this comment.', 'COMMENT_DELETE_DENIED');
    await prisma.comment.delete({ where: { id: commentId } });
    projectEvent(io, projectId, 'comment.deleted', { taskId, commentId });
    res.status(204).end();
  }));

  router.get('/notifications', asyncRoute(async (req, res) => {
    const user = currentUser(req);
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.notification.count({ where: { userId: user.id, isRead: false } })
    ]);
    res.json({ notifications, unreadCount });
  }));
  router.patch('/notifications/:notificationId/read', asyncRoute(async (req, res) => {
    const notificationId = requireId(req.params.notificationId, 'notification ID');
    const user = currentUser(req);
    const result = await prisma.notification.updateMany({ where: { id: notificationId, userId: user.id }, data: { isRead: true } });
    if (result.count === 0) throw new HttpError(404, 'Notification not found.', 'NOTIFICATION_NOT_FOUND');
    const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
    res.json({ notification });
  }));
  router.post('/notifications/read-all', asyncRoute(async (req, res) => {
    const user = currentUser(req);
    await prisma.notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } });
    res.status(204).end();
  }));

  router.use((req, _res, next) => next(new HttpError(404, `No API route for ${req.method} ${req.path}.`, 'ROUTE_NOT_FOUND')));
  return router;
}
