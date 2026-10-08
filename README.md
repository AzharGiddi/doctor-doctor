# Doctor Website Platform v0.1

Multi-tenant doctor website builder foundation.

Stack: Next.js + TypeScript + PostgreSQL + Prisma. Development media uses local filesystem storage.

## Run locally
1. Install Node.js 20+ and Docker Desktop.
2. Copy `.env.example` to `.env`.
3. Run `docker compose up -d db`.
4. Run `npm install`.
5. Run `npm run db:generate`.
6. Run `npm run db:migrate` to create the local schema.
7. Run `npm run db:seed` to add the sample Madilu tenant. To provision a Super Admin through the seed instead of first-run setup, set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` in `.env` first (use a unique password of at least 12 characters).
8. For first-admin setup, either set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` before `npm run db:seed`, or set a random `INITIAL_ADMIN_SETUP_TOKEN` of at least 32 characters in `.env`.
9. Run `npm run dev`.
10. Open http://localhost:3000/admin. If no users exist, create the first Super Admin at `/admin/setup` using the setup token; otherwise sign in at `/admin/login`.

The admin workspace uses database-backed sessions, scrypt password hashes, role checks, and session-derived tenant access. Sign-out revokes the current session. The first-run setup page only creates an admin while the user table is empty. A prior colon-delimited scrypt hash is upgraded after a successful login. In development, invitation and reset links are printed by the console email adapter. For deployment, select `EMAIL_DRIVER=smtp` and configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, and optional paired SMTP credentials.

The project includes persistent login and recovery throttling, one-time account invitations and password reset links, platform audit logs, signature-checked media uploads, and a PostgreSQL exclusion constraint against overlapping active appointments. Apply all migrations before running the app: `npm run db:migrate`.

## Tests

Install the local Playwright browser once with `npx playwright install chromium`. Run `npm run test:unit` for unit tests, `npm run test:integration` for PostgreSQL-backed tests, `npm run test:e2e` for browser tests, or `npm test` for all suites. Integration and end to end tests use the configured local PostgreSQL database and clean up their temporary records. See [the authentication and tenant-isolation milestone plan](docs/auth-authorization-plan.md).
