import { spawnSync } from 'node:child_process';
import path from 'node:path';

const [tool, ...args] = process.argv.slice(2);
if (!['prisma', 'tsx'].includes(tool ?? '')) {
  console.error('Usage: node scripts/with-mysql-tls.mjs <prisma|tsx> [arguments...]');
  process.exit(2);
}

const rawUrl = process.env.DATABASE_URL;
if (rawUrl) {
  try {
    const databaseUrl = new URL(rawUrl);
    const isTiDBCloud = databaseUrl.hostname.endsWith('.tidbcloud.com') || databaseUrl.hostname.endsWith('.tidbcloud.net');
    if (isTiDBCloud || databaseUrl.searchParams.has('ssl')) {
      databaseUrl.searchParams.set('sslaccept', 'strict');
    }
    process.env.DATABASE_URL = databaseUrl.toString();
  } catch {
    console.error('DATABASE_URL is not a valid URL. Its value has not been printed.');
    process.exit(2);
  }
}

const bin = tool === 'prisma'
  ? path.resolve('node_modules/prisma/build/index.js')
  : path.resolve('node_modules/tsx/dist/cli.mjs');
const result = spawnSync(process.execPath, [bin, ...args], { stdio: 'inherit', env: process.env });
if (result.error) {
  console.error(`${tool} could not be started: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
