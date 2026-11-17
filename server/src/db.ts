import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl) {
  const parsedUrl = new URL(databaseUrl);
  const isTiDBCloud = parsedUrl.hostname.endsWith('.tidbcloud.com') || parsedUrl.hostname.endsWith('.tidbcloud.net');
  if (isTiDBCloud || parsedUrl.searchParams.has('ssl')) parsedUrl.searchParams.set('sslaccept', 'strict');
  process.env.DATABASE_URL = parsedUrl.toString();
}

const globalForPrisma = globalThis as unknown as { teamflowPrisma?: PrismaClient };

export const prisma = globalForPrisma.teamflowPrisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.teamflowPrisma = prisma;
