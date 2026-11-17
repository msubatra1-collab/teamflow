import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { io as createSocket, type Socket } from 'socket.io-client';

const prisma = new PrismaClient();
const baseUrl = (process.env.BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const runId = randomUUID().replace(/-/g, '').slice(0, 16);
const emailA = `smoke-a-${runId}@example.test`;
const emailB = `smoke-b-${runId}@example.test`;
const testEmails = [emailA, emailB];
let projectId: string | undefined;
const sockets: Socket[] = [];

type ApiResult<T = unknown> = { response: Response; data: T };
async function call<T = any>(path: string, method = 'GET', cookie?: string, body?: unknown): Promise<ApiResult<T>> {
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  return { response, data: data as T };
}
function assertStatus(response: Response, expected: number, context: string) {
  assert.equal(response.status, expected, `${context}: expected HTTP ${expected}, got ${response.status}`);
}
function sessionCookie(response: Response): string {
  const setCookie = response.headers.get('set-cookie');
  assert(setCookie, 'Registration did not set a session cookie.');
  return setCookie.split(';', 1)[0];
}
function connect(cookie: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createSocket(baseUrl, {
      transports: ['websocket'],
      extraHeaders: { Cookie: cookie },
      reconnection: false,
      timeout: 8000
    });
    const timeout = setTimeout(() => { socket.disconnect(); reject(new Error('Socket.IO connection timed out.')); }, 9000);
    socket.once('connect', () => { clearTimeout(timeout); resolve(socket); });
    socket.once('connect_error', (error) => { clearTimeout(timeout); socket.disconnect(); reject(error); });
  });
}
function waitForEvent<T>(socket: Socket, name: string, predicate: (payload: T) => boolean, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, handler); reject(new Error(`Timed out waiting for ${name}.`)); }, timeoutMs);
    const handler = (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(name, handler);
      resolve(payload);
    };
    socket.on(name, handler);
  });
}
function joinProject(socket: Socket, id: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Project room join acknowledgement timed out.')), 5000);
    socket.emit('project:join', id, (result: { ok: boolean }) => { clearTimeout(timer); resolve(result.ok); });
  });
}

async function main() {
  const [registrationA, registrationB] = await Promise.all([
    call<{ user: { id: string } }>('/auth/register', 'POST', undefined, { name: 'Smoke Owner', email: emailA, password: 'SmokeTest@123' }),
    call<{ user: { id: string } }>('/auth/register', 'POST', undefined, { name: 'Smoke Member', email: emailB, password: 'SmokeTest@123' })
  ]);
  assertStatus(registrationA.response, 201, 'Register owner');
  assertStatus(registrationB.response, 201, 'Register member');
  const cookieA = sessionCookie(registrationA.response);
  const cookieB = sessionCookie(registrationB.response);
  const ownerId = registrationA.data.user.id;
  const memberId = registrationB.data.user.id;

  const createdProject = await call<{ project: { id: string; ownerId: string; columns: Array<{ id: string; title: string }> } }>('/projects', 'POST', cookieA, { name: `Smoke project ${runId}`, description: 'Temporary integration test project.' });
  assertStatus(createdProject.response, 201, 'Create project');
  projectId = createdProject.data.project.id;
  assert.equal(createdProject.data.project.ownerId, ownerId);
  assert.deepEqual(createdProject.data.project.columns.map((column) => column.title), ['To Do', 'In Progress', 'Done']);

  const addedMember = await call<{ member: { user: { id: string } } }>(`/projects/${projectId}/members`, 'POST', cookieA, { email: emailB });
  assertStatus(addedMember.response, 201, 'Add existing member by email');
  assert.equal(addedMember.data.member.user.id, memberId);

  const [ownerSocket, memberSocket] = await Promise.all([connect(cookieA), connect(cookieB)]);
  sockets.push(ownerSocket, memberSocket);
  assert.equal(await joinProject(ownerSocket, projectId), true, 'Owner must join the project room.');
  assert.equal(await joinProject(memberSocket, projectId), true, 'Added member must join the project room.');

  const firstColumnId = createdProject.data.project.columns[0].id;
  const taskEventPromise = waitForEvent<{ type: string; data: { id: string; assigneeId: string } }>(memberSocket, 'project:event', (event) => event.type === 'task.created');
  const assignmentNotificationPromise = waitForEvent<{ type: string; message: string }>(memberSocket, 'notification:new', (notification) => notification.type === 'ASSIGNED');
  const createdTask = await call<{ task: { id: string; assigneeId: string | null } }>(`/projects/${projectId}/tasks`, 'POST', cookieA, {
    title: 'Realtime smoke task', description: 'Created by the two-session smoke test.', dueDate: null, priority: 'HIGH', assigneeId: memberId, columnId: firstColumnId
  });
  assertStatus(createdTask.response, 201, 'Create and assign task');
  assert.equal(createdTask.data.task.assigneeId, memberId);
  const [taskEvent, assignmentNotification] = await Promise.all([taskEventPromise, assignmentNotificationPromise]);
  assert.equal(taskEvent.data.id, createdTask.data.task.id);
  assert.match(assignmentNotification.message, /Realtime smoke task/);

  const commentEventPromise = waitForEvent<{ type: string; data: { taskId: string; comment: { content: string } } }>(memberSocket, 'project:event', (event) => event.type === 'comment.created');
  const mentionNotificationPromise = waitForEvent<{ type: string }>(memberSocket, 'notification:new', (notification) => notification.type === 'MENTIONED');
  const createdComment = await call<{ comment: { id: string; content: string } }>(`/projects/${projectId}/tasks/${createdTask.data.task.id}/comments`, 'POST', cookieA, { content: `First shared note @${emailB}` });
  assertStatus(createdComment.response, 201, 'Create task comment');
  const [commentEvent] = await Promise.all([commentEventPromise, mentionNotificationPromise]);
  assert.equal(commentEvent.data.taskId, createdTask.data.task.id);
  assert.equal(commentEvent.data.comment.content, `First shared note @${emailB}`);

  const updateCommentEvent = waitForEvent<{ type: string; data: { comment: { content: string } } }>(memberSocket, 'project:event', (event) => event.type === 'comment.updated');
  const updatedComment = await call<{ comment: { content: string } }>(`/projects/${projectId}/tasks/${createdTask.data.task.id}/comments/${createdComment.data.comment.id}`, 'PATCH', cookieA, { content: 'Edited shared note.' });
  assertStatus(updatedComment.response, 200, 'Edit task comment');
  assert.equal((await updateCommentEvent).data.comment.content, 'Edited shared note.');

  const deleteCommentEvent = waitForEvent<{ type: string; data: { commentId: string } }>(memberSocket, 'project:event', (event) => event.type === 'comment.deleted');
  const removedComment = await call(`/projects/${projectId}/tasks/${createdTask.data.task.id}/comments/${createdComment.data.comment.id}`, 'DELETE', cookieA);
  assertStatus(removedComment.response, 204, 'Delete task comment');
  assert.equal((await deleteCommentEvent).data.commentId, createdComment.data.comment.id);

  const forbiddenProjectDelete = await call(`/projects/${projectId}`, 'DELETE', cookieB);
  assertStatus(forbiddenProjectDelete.response, 403, 'Prevent member from deleting project');
  const forbiddenMemberAdd = await call(`/projects/${projectId}/members`, 'POST', cookieB, { email: `other-${runId}@example.test` });
  assertStatus(forbiddenMemberAdd.response, 403, 'Prevent member from adding members');

  const taskUpdateEventPromise = waitForEvent<{ type: string; data: { title: string; columnId: string } }>(memberSocket, 'project:event', (event) => event.type === 'task.updated');
  const updatedTask = await call<{ task: { title: string } }>(`/projects/${projectId}/tasks/${createdTask.data.task.id}`, 'PATCH', cookieA, { title: 'Realtime smoke task moved', columnId: createdProject.data.project.columns[1].id, position: 0 });
  assertStatus(updatedTask.response, 200, 'Move and update task');
  const taskUpdateEvent = await taskUpdateEventPromise;
  assert.equal(taskUpdateEvent.data.title, 'Realtime smoke task moved');
  assert.equal(taskUpdateEvent.data.columnId, createdProject.data.project.columns[1].id);

  const memberRemoval = await call(`/projects/${projectId}/members/${memberId}`, 'DELETE', cookieA);
  assertStatus(memberRemoval.response, 204, 'Owner removes member');
  assert.equal(await joinProject(memberSocket, projectId), false, 'A removed member must not rejoin the project room.');

  const ownerDeleted = await call(`/projects/${projectId}`, 'DELETE', cookieA);
  assertStatus(ownerDeleted.response, 204, 'Owner deletes project with task content');
  projectId = undefined;
  console.log('Smoke test passed: registration, project creation, member access control, task assignment, comments, notifications, and realtime updates across two authenticated sessions.');
}

main()
  .catch((error) => { console.error('Smoke test failed:', error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(async () => {
    for (const socket of sockets) socket.disconnect();
    try {
      if (projectId) {
        await prisma.$transaction(async (tx) => {
          await tx.task.deleteMany({ where: { projectId } });
          await tx.project.deleteMany({ where: { id: projectId } });
        });
      }
      await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
    } catch (cleanupError) {
      console.error('Smoke test cleanup warning:', cleanupError instanceof Error ? cleanupError.message : cleanupError);
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  });
