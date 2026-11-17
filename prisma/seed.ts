import bcrypt from 'bcryptjs';
import { PrismaClient, ProjectRole, TaskPriority } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Demo@123', 12);
  const owner = await prisma.user.upsert({
    where: { email: 'demo1@test.com' },
    update: {},
    create: { name: 'Alex Morgan', email: 'demo1@test.com', passwordHash }
  });
  const member = await prisma.user.upsert({
    where: { email: 'demo2@test.com' },
    update: {},
    create: { name: 'Jamie Lee', email: 'demo2@test.com', passwordHash }
  });

  let project = await prisma.project.findFirst({ where: { ownerId: owner.id, name: 'Northstar launch' } });
  if (!project) {
    project = await prisma.project.create({
      data: {
        name: 'Northstar launch',
        description: 'A shared space for the next product milestone.',
        ownerId: owner.id,
        members: { create: [{ userId: owner.id, role: ProjectRole.OWNER }, { userId: member.id, role: ProjectRole.MEMBER }] }
      }
    });
  } else {
    await prisma.projectMember.upsert({ where: { projectId_userId: { projectId: project.id, userId: owner.id } }, update: {}, create: { projectId: project.id, userId: owner.id, role: ProjectRole.OWNER } });
    await prisma.projectMember.upsert({ where: { projectId_userId: { projectId: project.id, userId: member.id } }, update: {}, create: { projectId: project.id, userId: member.id, role: ProjectRole.MEMBER } });
  }

  let columns = await prisma.column.findMany({ where: { projectId: project.id }, orderBy: { position: 'asc' } });
  if (columns.length === 0) {
    await prisma.column.createMany({ data: [
      { projectId: project.id, title: 'To Do', position: 0 },
      { projectId: project.id, title: 'In Progress', position: 1 },
      { projectId: project.id, title: 'Done', position: 2 }
    ] });
    columns = await prisma.column.findMany({ where: { projectId: project.id }, orderBy: { position: 'asc' } });
  }

  const existingTasks = await prisma.task.count({ where: { projectId: project.id } });
  if (existingTasks === 0) {
    await prisma.task.createMany({ data: [
      { projectId: project.id, columnId: columns[0].id, title: 'Map the first milestones', description: 'Agree on the work that will move the launch forward.', priority: TaskPriority.HIGH, assigneeId: owner.id, position: 0 },
      { projectId: project.id, columnId: columns[1].id, title: 'Gather product feedback', description: 'Collect a short set of useful customer notes.', priority: TaskPriority.MEDIUM, assigneeId: member.id, position: 0 },
      { projectId: project.id, columnId: columns[2].id, title: 'Set up the shared space', description: 'The team now has one clear place to work.', priority: TaskPriority.LOW, position: 0 }
    ] });
  }
  console.log('Demo seed is ready (demo1@test.com / demo2@test.com, password Demo@123).');
}

main().finally(async () => prisma.$disconnect());
