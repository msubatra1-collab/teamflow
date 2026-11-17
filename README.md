# Teamflow

Teamflow is a collaborative project workspace with a task board, member access, comments, notifications, and live updates. It uses React, Vite, Tailwind CSS, Express, Socket.IO, Prisma, and MySQL.

## Quick start

1. Use Node.js 22 and npm 10.9.9. Copy `.env.example` to `.env`, then set `DATABASE_URL` to a MySQL database. Replace the sample `APP_JWT_SECRET` with at least 32 random bytes for local use.
2. Install and initialize the database:

   ```sh
   npm ci
   npm run prisma:generate
   npm run prisma:migrate
   npm run db:seed
   ```

3. Start the app with `npm run dev` and open `http://localhost:3000`.
4. Demo accounts: `demo1@test.com` and `demo2@test.com`; both use password `Demo@123`.

The managed WebDev project injects its MySQL URL and platform JWT key. Managed TiDB Cloud URLs require TLS; the Prisma/seed runner adds `sslaccept=strict` when it detects the TiDB Cloud hostname or platform `ssl` flag. The setting verifies the server certificate against system CA roots. See the [TiDB Cloud Prisma connection guide](https://docs.pingcap.com/developer/dev-guide-sample-application-nodejs-prisma/) and [serverless TLS guide](https://docs.pingcap.com/tidbcloud/secure-connections-to-serverless-clusters/).

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL DSN. The managed project supplies it in development and production; local development uses `.env`. |
| `APP_JWT_SECRET` | Optional local-only app session signing key; use at least 32 random bytes. Managed deployments derive an app-specific key from the platform-provided `MANUS_JWT_SECRET`. |
| `MANUS_JWT_SECRET` | Platform-provided secret used only as HKDF input; do not add it to source control or declare a duplicate. |
| `PORT` | HTTP listener port; defaults to 3000. |
| `NODE_ENV` | `development` enables Vite middleware; `production` serves the compiled client. |

Node 22 loads `.env` for the development and database-maintenance scripts. Platform environment values take precedence. The HTTP-only session cookie is `Secure` and `SameSite=None` for HTTPS Preview and production.

## Main REST API

All application API routes are below `/api/v1`. Authentication routes are `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, and `GET /auth/me`. Projects and membership use `GET/POST /projects`, `GET/PATCH/DELETE /projects/:projectId`, `GET/POST /projects/:projectId/members`, `DELETE /projects/:projectId/members/:userId`, and `POST /invitations/:token/accept`. Adding an existing account by email adds it directly; an unknown email receives a seven-day invitation link to share.

Columns use `POST /projects/:projectId/columns` and `PATCH/DELETE /projects/:projectId/columns/:columnId`. Tasks use `POST /projects/:projectId/tasks` and `PATCH/DELETE /projects/:projectId/tasks/:taskId`. Comments use `POST /projects/:projectId/tasks/:taskId/comments` and `PATCH/DELETE /projects/:projectId/tasks/:taskId/comments/:commentId`. Notifications use `GET /notifications`, `PATCH /notifications/:notificationId/read`, and `POST /notifications/read-all`; the list response includes the total `unreadCount`. `GET /api/health` is public for health checks.

Project operations verify membership. Only project owners can change project details, delete projects, or remove members. Inputs are validated and errors use `{ error, code }` JSON.

## Realtime

Socket.IO authenticates the `teamflow_session` cookie. Each connected user joins a private notification room. A client can join a `project:join` room only while it is a project member; removed members are taken out of that room. Project mutations are persisted before `project:event` broadcasts. Notifications are persisted and also emitted to the recipient's private room.

## Architecture

- `client/` contains the React app, auth flow, dashboard, responsive task board, dialogs, and notifications.
- `server/` contains the Express API, bcrypt/JWT sessions, authorization, validation, and Socket.IO rooms.
- `prisma/` contains the MySQL schema, committed additive migration, and idempotent demo seed.
- `scripts/with-mysql-tls.mjs` preserves the platform DSN and adds strict TLS mode for TiDB Cloud when running Prisma or the seed.
- Vite is mounted as Express middleware during development. Production Express serves the compiled client and API from one container port. Container startup applies committed migrations before listening.

## Build and checks

```sh
npm run typecheck
npm test
npm run build
```

With the development server running and the database migrated, run `npm run smoke` to test registration, project creation, adding a member, task assignment, comments, notifications, owner/member authorization, and Socket.IO events across two authenticated sessions. The smoke test creates uniquely named temporary users and removes only its own test project and accounts.

Development, testing, and publication share the managed database. The initial migration only creates Teamflow tables; the seed is idempotent and preserves existing project edits. The Dockerfile runs `prisma migrate deploy` at startup and serves the health endpoint at `/api/health`.
