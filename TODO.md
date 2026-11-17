# TODO

## Accounts and protected access
- [x] Users can register, log in, and log out; frontend routes and private backend routes are protected; the signed-in profile exposes name, email, and an initials avatar; passwords are bcrypt-hashed and JWT sessions are held in a secure HTTP-only cookie.

## Projects, membership, and roles
- [x] The dashboard lists the user's group projects; users can create, edit, and delete projects; owners can add an existing user by email or create a shareable, expiring invitation link for an unknown email; project roles are Owner and Member, and only an owner can delete the project or remove members.

## Boards, columns, and tasks
- [x] Every project has a board with default To Do, In Progress, and Done columns; members can add, rename, and delete columns; deleting a project removes its task content safely; tasks can be dragged between columns.
- [x] Users can create, edit, and delete task cards with title, description, due date, Low/Medium/High priority, board-column status, and optional assignment to a project member; a task detail modal shows its information and comments.

## Comments, notifications, and realtime collaboration
- [x] Users can add, edit, and delete task comments; comments show author and timestamp and update immediately for connected project members.
- [x] Authenticated Socket.IO sessions join project-scoped rooms only while the user is a member; task and comment changes are persisted and broadcast to other authorized sessions.
- [x] The notification bell shows the unread count; notifications cover task assignments, mentions/comments, and member additions; users can mark one or all notifications as read.

## REST API and authorization
- [x] Versioned REST endpoints cover authentication, projects, members and invitations, columns, tasks, comments, and notifications; requests are validated and errors use appropriate status codes and consistent JSON; project membership is checked for project-related routes and realtime room access.

## Responsive product experience
- [x] The responsive interface supports desktop and mobile, includes a dashboard and board view with drag-and-drop, and provides loading/empty states plus success and error toasts.

## Setup and delivery
- [x] The organized React/Vite/Tailwind frontend and Express/Prisma/Socket.IO backend, database migrations, and Dockerfile are documented in the README, including setup, environment variables, API routes, architecture, and verification commands.
- [x] The repeatable seed creates `demo1@test.com` and `demo2@test.com`, both with password `Demo@123`, and a sample project without overwriting later project edits.
- [x] The integration smoke test passed registration, project creation, adding a member, role checks, task assignment, comments, notifications, and realtime updates across two authenticated Socket.IO sessions; project deletion with a task also passed. Production build, typecheck, unit test, migration status, Preview health, and route manifest checks passed.
- [x] The application is published at <https://teamflow-6y77fxgf.manus.space> and its live URL is confirmed.
- [x] The complete source code archive is packaged and verified; it excludes secrets, dependencies, build output, and Git metadata.
