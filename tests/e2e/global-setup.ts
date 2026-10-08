import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient, UserRole } from "@prisma/client";
import { hashPassword } from "../../src/lib/credentials";

const fixturePath = path.join(process.cwd(), "test-results", "e2e-fixture.json");

export default async function globalSetup() {
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const tenantSlug = `e2e-${suffix}`;
  const email = `e2e-${suffix}@example.test`;
  const password = `E2e-${randomUUID()}-SafePassword`;
  let tenantId: string | undefined;
  let userId: string | undefined;

  try {
    const tenant = await prisma.tenant.create({
      data: {
        slug: tenantSlug,
        name: "E2E Test Clinic",
        doctor: { create: { name: "Test Doctor", slug: `doctor-${suffix}`, qualifications: [], specialties: [] } },
        settings: { create: { siteTitle: "E2E Test Clinic" } },
        theme: { create: { name: "Test Theme", tokens: { primary: "#123456" } } },
        pages: { create: { slug: "home", title: "Test Home", status: "PUBLISHED", blocks: [{ type: "hero", props: { headline: "E2E clinic homepage" } }, { type: "cta", props: { title: "Request a test visit" } }] } },
      },
      select: { id: true },
    });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: { email, name: "E2E Admin", role: UserRole.SUPER_ADMIN, passwordHash: await hashPassword(password) },
      select: { id: true },
    });
    userId = user.id;
    await mkdir(path.dirname(fixturePath), { recursive: true });
    await writeFile(fixturePath, JSON.stringify({ email, password, tenantId, tenantSlug, userId }), { mode: 0o600 });
  } catch (error) {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}
