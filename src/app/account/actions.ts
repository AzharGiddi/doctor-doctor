"use server";

import { AccountTokenKind, UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCapability, createSession, hashPassword } from "@/lib/auth";
import { issueAccountToken, findActiveAccountToken, sendAccountLink } from "@/lib/account-tokens";
import { clearLoginFailures, isLoginBlocked, recordThrottleAttempt } from "@/lib/login-throttle";
import { hashToken } from "@/lib/credentials";
import { writeAudit } from "@/lib/audit";

const inviteSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  name: z.string().trim().min(1).max(120),
  role: z.nativeEnum(UserRole),
  tenantId: z.string().trim().max(64).optional(),
});
const passwordSchema = z.object({ token: z.string().min(40).max(50), password: z.string().min(12).max(256), confirmation: z.string().min(12).max(256) });
const emailSchema = z.string().trim().email().max(254).transform((email) => email.toLowerCase());
function field(data: FormData, key: string): unknown { return data.get(key); }

export async function inviteUser(formData: FormData): Promise<void> {
  const actor = await requireCapability("platform:manage");
  const parsed = inviteSchema.safeParse({ email: field(formData, "email"), name: field(formData, "name"), role: field(formData, "role"), tenantId: field(formData, "tenantId") });
  if (!parsed.success) redirect("/admin?section=Users&error=details");
  const { email, name, role, tenantId: requestedTenantId } = parsed.data;
  const tenantId = role === UserRole.SUPER_ADMIN ? null : requestedTenantId || null;
  if (role !== UserRole.SUPER_ADMIN && !tenantId) redirect("/admin?section=Users&error=details");
  if (tenantId && !(await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }))) redirect("/admin?section=Users&error=details");
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) redirect("/admin?section=Users&error=exists");

  const issued = await issueAccountToken({ kind: AccountTokenKind.INVITATION, email, name, role, tenantId, createdById: actor.userId, expiresInMs: 24 * 60 * 60 * 1000 });
  try {
    await sendAccountLink({ to: email, subject: "Your practice studio invitation", text: `You have been invited to access the Doctor Website Platform. This link expires in 24 hours.`, path: "/account/accept", token: issued.token });
  } catch {
    await prisma.accountToken.delete({ where: { id: issued.id } });
    redirect("/admin?section=Users&error=email");
  }
  await writeAudit({ actorId: actor.userId, tenantId, action: "USER_INVITED", targetType: "User", targetId: null, metadata: { role } });
  redirect("/admin?section=Users&invited=1");
}

export async function acceptInvitation(formData: FormData): Promise<void> {
  const parsed = passwordSchema.safeParse({ token: field(formData, "token"), password: field(formData, "password"), confirmation: field(formData, "confirmation") });
  if (!parsed.success || parsed.data.password !== parsed.data.confirmation) redirect("/account/accept?error=invalid");
  const tokenHash = hashToken(parsed.data.token);
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const token = await tx.accountToken.findFirst({ where: { tokenHash, kind: AccountTokenKind.INVITATION, usedAt: null, expiresAt: { gt: now } } });
    if (!token?.role || (token.role !== UserRole.SUPER_ADMIN && !token.tenantId)) return null;
    const consumed = await tx.accountToken.updateMany({ where: { id: token.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (consumed.count !== 1) return null;
    const user = await tx.user.create({ data: { email: token.email, name: token.name, role: token.role, tenantId: token.tenantId, passwordHash: await hashPassword(parsed.data.password) } });
    await tx.auditLog.create({ data: { actorId: user.id, tenantId: user.tenantId, action: "INVITATION_ACCEPTED", targetType: "User", targetId: user.id } });
    return user;
  });
  if (!result) redirect("/account/accept?error=invalid");
  await createSession(result.id);
  redirect("/admin");
}

export async function requestPasswordReset(formData: FormData): Promise<void> {
  const emailResult = emailSchema.safeParse(field(formData, "email"));
  if (!emailResult.success) redirect("/account/recover?sent=1");
  const email = emailResult.data;
  const identity = `reset:${email}`;
  if (await isLoginBlocked(identity)) redirect("/account/recover?sent=1");
  const requests = await recordThrottleAttempt(identity);
  if (requests >= 5) redirect("/account/recover?sent=1");
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, tenantId: true } });
  if (!user) redirect("/account/recover?sent=1");
  const issued = await issueAccountToken({ kind: AccountTokenKind.PASSWORD_RESET, email, createdById: user.id, expiresInMs: 30 * 60 * 1000 });
  try {
    await sendAccountLink({ to: email, subject: "Reset your practice studio password", text: "Use this one-time link to reset your password. It expires in 30 minutes.", path: "/account/reset", token: issued.token });
    await writeAudit({ actorId: user.id, tenantId: user.tenantId, action: "PASSWORD_RESET_REQUESTED", targetType: "User", targetId: user.id });
  } catch {
    await prisma.accountToken.delete({ where: { id: issued.id } });
  }
  redirect("/account/recover?sent=1");
}

export async function resetPassword(formData: FormData): Promise<void> {
  const parsed = passwordSchema.safeParse({ token: field(formData, "token"), password: field(formData, "password"), confirmation: field(formData, "confirmation") });
  if (!parsed.success || parsed.data.password !== parsed.data.confirmation) redirect("/account/reset?error=invalid");
  const tokenHash = hashToken(parsed.data.token);
  const now = new Date();
  const user = await prisma.$transaction(async (tx) => {
    const token = await tx.accountToken.findFirst({ where: { tokenHash, kind: AccountTokenKind.PASSWORD_RESET, usedAt: null, expiresAt: { gt: now } } });
    if (!token) return null;
    const consumed = await tx.accountToken.updateMany({ where: { id: token.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (consumed.count !== 1) return null;
    const updated = await tx.user.update({ where: { email: token.email }, data: { passwordHash: await hashPassword(parsed.data.password) } });
    await tx.session.deleteMany({ where: { userId: updated.id } });
    await tx.auditLog.create({ data: { actorId: updated.id, tenantId: updated.tenantId, action: "PASSWORD_RESET_COMPLETED", targetType: "User", targetId: updated.id } });
    return updated;
  });
  if (!user) redirect("/account/reset?error=invalid");
  await clearLoginFailures(`reset:${user.email}`);
  redirect("/admin/login?reset=1");
}
