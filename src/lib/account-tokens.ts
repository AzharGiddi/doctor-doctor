import "server-only";
import { randomBytes } from "node:crypto";
import { AccountTokenKind, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/credentials";

export async function issueAccountToken(input: {
  kind: AccountTokenKind;
  email: string;
  name?: string | null;
  role?: UserRole | null;
  tenantId?: string | null;
  createdById?: string | null;
  expiresInMs: number;
}): Promise<{ token: string; id: string }> {
  await prisma.accountToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const token = randomBytes(32).toString("base64url");
  const record = await prisma.accountToken.create({
    data: {
      tokenHash: hashToken(token), kind: input.kind, email: input.email.toLowerCase(),
      name: input.name ?? null, role: input.role ?? null, tenantId: input.tenantId ?? null,
      createdById: input.createdById ?? null, expiresAt: new Date(Date.now() + input.expiresInMs),
    },
    select: { id: true },
  });
  return { token, id: record.id };
}

export async function findActiveAccountToken(token: string, kind: AccountTokenKind) {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  return prisma.accountToken.findFirst({
    where: { tokenHash: hashToken(token), kind, usedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, email: true, name: true, role: true, tenantId: true },
  });
}

export async function sendAccountLink(input: { to: string; subject: string; text: string; path: string; token: string }): Promise<void> {
  const { buildActionUrl, getEmailProvider } = await import("@/lib/email");
  await getEmailProvider().send({ to: input.to, subject: input.subject, text: input.text, actionUrl: buildActionUrl(input.path, input.token) });
}
