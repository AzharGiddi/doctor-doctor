# Authentication, authorization, and tenant isolation milestone

## Repository audit

- The repository has a Next.js 15 / React 19 / strict TypeScript application, a PostgreSQL Docker Compose service, Prisma models, tenant-aware public rendering, a local media storage abstraction, and a Madilu sample seed.
- Tenant-owned records generally carry `tenantId`; slugs are unique per tenant where needed. This is a sound base to retain.
- There is no authentication or session flow. `/admin` reads every tenant and all of its content anonymously. All admin Server Actions are callable without a user session.
- Admin forms send `tenantId`; most content mutations, appointment status updates, and media deletes then use only a global record ID. This permits cross-tenant access and arbitrary record changes.
- User records have nullable `passwordHash` and `tenantId`, but no sessions. No initial Super Admin is provisioned.
- Runtime validation is inconsistent. Several numeric and JSON fields are cast/coerced, and file uploads trust client MIME metadata. Appointment conflict detection is a read-then-insert race and should be hardened with database-level protection in the appointment milestone.
- Tenant-aware public site queries and appointment service lookup are scoped. Public media URLs intentionally expose published media, though a future private-media policy is needed for patient records (which are not currently modeled).
- The local storage provider is vendor-neutral, but upload actions currently bypass it and write directly to disk. Preserve and adopt the abstraction in the media milestone.

## Implementation plan and status

1. **Add identity and session persistence** — required email/password user records, hashed opaque session tokens with expiry/revocation, and a bootstrap Super Admin provisioned only from explicit environment credentials. No default password.
2. **Add login/logout and session guards** — validated login input, scrypt password verification, generic login errors, HttpOnly/SameSite cookies, secure cookies in production, expiry enforcement, and invalid-session cleanup.
3. **Enforce role and tenant authorization at the server boundary** — derive tenant access from the session; SUPER_ADMIN may select any tenant, tenant roles are pinned to their assigned tenant. Restrict receptionist/content manager/doctor operations by capability.
4. **Scope admin reads and writes** — gate the dashboard; apply tenant constraints to all record lookup/update/delete operations and derive creation tenant from the authenticated principal. Never treat a form tenant ID as authority.
5. **Add tests and run project checks** — cover password/session helpers and role/tenant capability decisions; run TypeScript, Prisma validation/generation, tests, and build where environment permits.

## Follow-up completion

- Persistent per-account login and password-reset throttling; generic login and recovery responses.
- One-time invitation and password-reset links with hashed tokens, expiry, single use, session invalidation, and a vendor-neutral SMTP adapter. Local development can use console email previews.
- Audit log events for authentication, account, tenant, content, media, availability, and appointment actions, with a Super Admin log view.
- Media MIME allowlisting plus file-signature checks, safe filenames, size and metadata limits, and sandboxed/attachment media responses.
- PostgreSQL exclusion and positive-duration constraints for appointments, backed by a serializable transaction in the booking action.
- Local Docker/PostgreSQL and media backup/restore scripts, plus database-backed tenant isolation and overlap tests.

## Operational items still requiring deployment work

- Apply the new Prisma migrations on a Docker-enabled machine and execute `RUN_DB_TESTS=1 npm run test:db` against that PostgreSQL instance. The current environment has no Docker or `psql` executable.
- Configure SMTP credentials, HTTPS, secure environment secrets, and an external encrypted/off-host backup destination before deployment.
- Add a custom email adapter only if SMTP is not suitable; implement an email verification/recovery delivery-monitoring policy, audit retention, backup scheduling and restore drills.
- MFA, PostgreSQL row-level security, malware scanning, full media decoding, and public appointment abuse controls remain future hardening. SVG uploads are rejected until a safe sanitizer is added.
