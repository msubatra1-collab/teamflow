# Teamflow — Implementation and Design Plan

## Scope and implementation choices

Build a deployable, full-stack collaborative project-management app with the requested registration/login/logout, protected frontend and backend, project/member roles, Kanban boards, movable tasks, comments, REST API, unread notifications, and project-scoped Socket.IO updates. Deliver the organized frontend/backend source, setup and architecture documentation, environment-variable/API reference, and repeatable demo seed. Exercise the requested registration, project/member, task assignment, comment, and two-session realtime flows before delivery.

The user selected the already-enabled managed MySQL-compatible database after the external PostgreSQL secret values proved unusable. Prisma will use the platform-provided `DATABASE_URL`; no external DSN is required. This is an approved adaptation from the original PostgreSQL/SQLite options and gives the live app durable storage without requesting a third-party database credential. SQLite files are not used because container storage is temporary.

Use a TypeScript monorepo with React + Vite + Tailwind on the client, Node.js + Express and Socket.IO on the server, Prisma for persistence, Zod for input validation, bcrypt for password hashes, and JWT access sessions in an HTTP-only cookie. Keep API and Vite preview on the configured port, serve the compiled client and `/api/v1` from the same Express process in production, and deploy as a container. The registered REST routes and Socket.IO handshakes check authentication and project membership. Store only password hashes; use a valid local `APP_JWT_SECRET` where supplied, otherwise derive a Teamflow-specific signing key from the platform-managed `MANUS_JWT_SECRET` with HKDF and validate tokens with the app's issuer/audience.

## Product behavior

- **Accounts:** register, log in, log out, and see the signed-in user's name, email, and initials avatar. Require valid inputs, normalize email, hash passwords with bcrypt, use safe generic authentication errors, and protect all private API routes.
- **Projects:** dashboard lists projects the current user belongs to. Users can create and edit projects. Owners can delete their project and remove members; members cannot do either. Owners can add existing users by email. For an email with no account, create a time-limited pending invitation and show a copyable invite link; registration with that email can accept it. No external email-sending provider is assumed. Membership and role checks apply to every project-scoped HTTP and realtime operation.
- **Boards and columns:** each project begins with To Do, In Progress, and Done columns. Members can create, rename, and delete columns; a column with tasks cannot be deleted until those tasks are moved, preventing silent data loss. Column order and task order are persisted. Use `dnd-kit` for pointer, touch, and keyboard-accessible drag-and-drop.
- **Tasks:** create, edit, and delete tasks with title, description, due date, Low/Medium/High priority, column/status, and an optional assignee restricted to project members. Task details open in a modal and include the full task and comment history. Dragging a card persists both its destination and order.
- **Comments and notifications:** task comments show author and timestamp and can be edited/deleted by their author (project owner may moderate). New comments broadcast immediately to authorized project members. Create durable notifications when a user is assigned a task, a project member is added, or a task assignee is mentioned/has activity on their task; provide an unread count, notification list, and mark-read action.
- **Realtime:** authenticated Socket.IO rooms are scoped to a project and require membership. Broadcast task create/edit/move/delete, column changes, comments, member additions, and relevant notification changes. Persist before broadcasting; reconnect by reloading authoritative API state.
- **REST API:** versioned `/api/v1` endpoints for auth, users/profile, projects, members/invitations, columns, tasks, task comments, and notifications. Validate request bodies/parameters; return consistent JSON errors and suitable 2xx/4xx/5xx statuses. Use shared authorization and error middleware.
- **Responsive UX:** desktop dashboard with persistent project navigation and a wide, horizontally scrollable board; mobile navigation and touch-friendly board/card controls. Include loading, empty, error, and success-toast states, clear priority/due-date indicators, and accessible focus/keyboard behavior.

## Architecture and project structure

```text
client/
  src/app/                 routes, auth state, app shell
  src/features/             dashboard, projects, board, tasks, comments, notifications
  src/components/           reusable dialogs, forms, avatar, toast, loading/empty states
  src/lib/                  API client, schemas, date/format helpers
  src/styles/               Tailwind entry and design tokens
server/
  src/app.ts                Express setup, static hosting, health endpoint
  src/index.ts              HTTP/Socket.IO startup and shutdown
  src/routes/               auth, profile, projects, members, columns, tasks, comments, notifications
  src/middleware/           auth, membership/role checks, validation, errors
  src/realtime/             authenticated project-room joins and event broadcasts
  src/services/             business rules, notifications, invitation acceptance
prisma/
  schema.prisma             relational data model
  migrations/               committed, repeatable schema history
  seed.ts                   idempotent demo users, project, board, and tasks
public/manus-routes.json    complete client page-route manifest
Dockerfile                  production build and single-port Express runtime
.env.example                documented variable names without secrets
README.md                   setup, deployment assumptions, environment and REST API reference
```

The Prisma model covers users, projects, project memberships, pending invitations, ordered columns, ordered tasks, comments, and notifications; add indexes and foreign-key delete behavior for the access patterns. The seed is repeatable and creates `demo1@test.com` and `demo2@test.com`, both with password `Demo@123`, plus a sample project and board, without overwriting later user edits.

## Deployment and delivery workflow

1. After approval, create the complete acceptance-criteria `TODO.md`, then register TypeScript/JavaScript/JSON/CSS diagnostics before the first application-code batch.
2. Implement the client, API, schema/migrations, seeded demo data, tests, environment example, route manifest, container, and README in organized folders.
3. Run installation with a pinned Node/package-manager version; apply migrations to the selected durable database; run type/lint/build and API/realtime integration checks. Exercise the main requested flows, including two independently authenticated Socket.IO/browser sessions receiving a change.
4. Run the project in Preview on the configured port and confirm health and `/manus-routes.json`. Keep URLs same-origin and ensure the JWT cookie is sent correctly in HTTPS Preview.
5. Configure the container deployment and health path, create and push the intended checkpoint to the canonical `main`, then publish the requested live version. Report the live link only after publication confirms success.
6. Provide the full organized source as a downloadable ZIP alongside the live app and README.

## Design direction

Three uncommon style directions considered: **Swiss editorial utility** (0.07), **sunlit paper-planner warmth** (0.04), **quiet monochrome control room** (0.02). Choose **Swiss editorial utility**: crisp, workmanlike, warm enough to feel collaborative, with strong typographic hierarchy and board-first density rather than a generic centered SaaS template.

- **Design movement:** contemporary Swiss editorial systems applied to a collaborative workbench.
- **Core principles:** legible at a glance; compact but not cramped; strong hierarchy through spacing and type; every important state has a clear visual cue.
- **Color philosophy:** soft limestone and paper surfaces make long sessions comfortable; deep ink grounds dense work; a distinct persimmon accent draws attention to creation and active focus; muted teal/amber/rose distinguish workflow and priority without relying on color alone.
- **Layout paradigm:** a narrow, fixed-feeling navigation rail and a broad working canvas; project dashboard uses a compact left-aligned list with a small activity strip; the board uses a true horizontal work surface with independently scrollable lanes.
- **Signature elements:** a three-lane geometric mark; fine ruled separators and small uppercase section labels; compact rounded priority/status chips with a slim accent edge.
- **Interaction philosophy:** direct manipulation with visible drop targets; immediate optimistic feedback with rollback on failure; destructive actions are clearly named and confirmed; keyboard alternatives are available for drag/drop.
- **Animation:** restrained 140–200 ms transitions for drawers, menus, and card movement; no perpetual motion; use reduced-motion preferences and avoid animating layout-heavy dashboard changes.
- **Typography system:** Manrope for headings and compact labels, Inter for body and dense task metadata, with system sans-serif fallbacks; use tabular numerals for dates/counts and reserve uppercase tracking for tiny section labels.
- **Brand essence:** a clear shared workbench for small teams to move projects from intention to done; **focused, dependable, collaborative**.
- **Brand voice:** direct, calm, and action-oriented. Example: “A clear next step for every project.” “Good work moves forward together.”
- **Wordmark & logo:** custom Teamflow wordmark paired with three offset lane-bars and a small persimmon progress dot; use the mark as a compact app icon and as a restrained navigation signature.
- **Signature brand color:** persimmon `#E76F51` against warm paper and deep slate.
