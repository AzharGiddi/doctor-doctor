import assert from "node:assert/strict";
import test, { after } from "node:test";
import { randomUUID } from "node:crypto";
import { AppointmentStatus, ConsultationType, PrismaClient } from "@prisma/client";
import { AccountTokenKind, UserRole } from "@prisma/client";
import { hashToken } from "../src/lib/credentials";

const enabled = process.env.RUN_DB_TESTS === "1";
const db = new PrismaClient();

test("PostgreSQL tenant scoping and appointment exclusion work across tenants", { skip: !enabled }, async () => {
  const suffix = randomUUID();
  const email = `doctor-${suffix}@example.test`;
  const throttleKey = hashToken(`login:${email}`);
  const tenantA = await db.tenant.create({ data: { slug: `isolation-a-${suffix}`, name: "Isolation A" } });
  const tenantB = await db.tenant.create({ data: { slug: `isolation-b-${suffix}`, name: "Isolation B" } });
  try {
    const userA = await db.user.create({ data: { tenantId: tenantA.id, email, role: UserRole.DOCTOR, passwordHash: "test-password-hash" } });
    const sessionTokenHash = hashToken(randomUUID());
    const session = await db.session.create({ data: { userId: userA.id, tokenHash: sessionTokenHash, expiresAt: new Date(Date.now() + 60_000) } });
    assert.equal((await db.session.findUnique({ where: { tokenHash: sessionTokenHash }, include: { user: true } }))?.user.tenantId, tenantA.id);
    await db.session.delete({ where: { id: session.id } });

    const throttle = await db.loginThrottle.create({ data: { key: throttleKey, failures: 5, blockedUntil: new Date(Date.now() + 60_000) } });
    assert.equal((await db.loginThrottle.findUnique({ where: { key: throttleKey } }))?.failures, 5);
    await db.loginThrottle.delete({ where: { key: throttle.key } });

    const serviceA = await db.service.create({ data: { tenantId: tenantA.id, slug: "consultation", name: "A consultation" } });
    const serviceB = await db.service.create({ data: { tenantId: tenantB.id, slug: "consultation", name: "B consultation" } });
    const visibleToA = await db.service.findMany({ where: { tenantId: tenantA.id } });
    assert.deepEqual(visibleToA.map((service) => service.id), [serviceA.id]);
    const crossTenantUpdate = await db.service.updateMany({ where: { id: serviceB.id, tenantId: tenantA.id }, data: { name: "Tampered" } });
    assert.equal(crossTenantUpdate.count, 0);
    const crossTenantDelete = await db.service.deleteMany({ where: { id: serviceB.id, tenantId: tenantA.id } });
    assert.equal(crossTenantDelete.count, 0);
    assert.equal((await db.service.findUniqueOrThrow({ where: { id: serviceB.id } })).name, "B consultation");

    const accountToken = await db.accountToken.create({ data: { tokenHash: randomUUID().replaceAll("-", ""), kind: AccountTokenKind.INVITATION, email: `invite-${suffix}@example.test`, role: UserRole.DOCTOR, tenantId: tenantA.id, expiresAt: new Date(Date.now() + 60_000) } });
    const consume = () => db.accountToken.updateMany({ where: { id: accountToken.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    const consumption = await Promise.all([consume(), consume()]);
    assert.equal(consumption.reduce((sum, result) => sum + result.count, 0), 1);

    const startsAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
    const appointment = (tenantId: string) => ({ tenantId, patientName: "Test Patient", patientPhone: "0000000000", startsAt, endsAt, consultationType: ConsultationType.IN_PERSON, status: AppointmentStatus.PENDING });
    await db.appointment.create({ data: appointment(tenantA.id) });
    await db.appointment.create({ data: appointment(tenantB.id) });
    await assert.rejects(db.appointment.create({ data: appointment(tenantA.id) }));
  } finally {
    await db.loginThrottle.deleteMany({ where: { key: throttleKey } });
    await db.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
  }
});

after(() => db.$disconnect());
