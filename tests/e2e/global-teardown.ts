import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

type Fixture = { tenantId: string; userId: string };
const fixturePath = path.join(process.cwd(), "test-results", "e2e-fixture.json");

export default async function globalTeardown() {
  let fixture: Fixture;
  try {
    fixture = JSON.parse(await readFile(fixturePath, "utf8")) as Fixture;
  } catch {
    return;
  }
  const prisma = new PrismaClient();
  try {
    await prisma.user.deleteMany({ where: { id: fixture.userId } });
    await prisma.tenant.deleteMany({ where: { id: fixture.tenantId } });
  } finally {
    await prisma.$disconnect();
    await rm(fixturePath, { force: true });
  }
}
