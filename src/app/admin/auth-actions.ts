"use server";

import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { clearLoginFailures, isLoginBlocked, recordLoginFailure } from "@/lib/login-throttle";
import { writeAudit } from "@/lib/audit";

const setupSchema = z.object({ email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()), name: z.string().trim().min(1).max(120), password: z.string().min(12).max(256), confirmation: z.string().min(12).max(256), bootstrapToken: z.string().min(32).max(256) });
const loginSchema = z.object({ email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()), password: z.string().min(1).max(256) });
function field(data: FormData, key: string): unknown { return data.get(key); }

export async function createFirstAdmin(data: FormData): Promise<void> {
  const parsed = setupSchema.safeParse({ email: field(data,"email"), name: field(data,"name"), password: field(data,"password"), confirmation: field(data,"confirmation"), bootstrapToken: field(data,"bootstrapToken") });
  if (!parsed.success || parsed.data.password !== parsed.data.confirmation) redirect("/admin/setup?error=details");
  const configuredToken = process.env.INITIAL_ADMIN_SETUP_TOKEN;
  if (!configuredToken || configuredToken.length < 32) redirect("/admin/setup?error=disabled");
  const receivedHash = createHash("sha256").update(parsed.data.bootstrapToken).digest();
  const configuredHash = createHash("sha256").update(configuredToken).digest();
  if (!timingSafeEqual(receivedHash, configuredHash)) redirect("/admin/setup?error=details");
  try {
    const user = await prisma.$transaction(async (tx) => {
      if (await tx.user.count() !== 0) return null;
      return tx.user.create({ data: { email: parsed.data.email, name: parsed.data.name, role: UserRole.SUPER_ADMIN, passwordHash: await hashPassword(parsed.data.password) } });
    }, { isolationLevel: "Serializable" });
    if (!user) redirect("/admin/login");
    await writeAudit({ actorId: user.id, action: "SUPER_ADMIN_CREATED", targetType: "User", targetId: user.id });
    await createSession(user.id);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect("/admin/setup?error=details");
  }
  redirect("/admin");
}

export async function login(data: FormData): Promise<void> {
  const parsed = loginSchema.safeParse({ email: field(data,"email"), password: field(data,"password") });
  if (!parsed.success) redirect("/admin/login?error=credentials");
  const identity = `login:${parsed.data.email}`;
  if (await isLoginBlocked(identity)) redirect("/admin/login?error=credentials");
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? "scrypt$00000000000000000000000000000000$00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000");
  if (!user || !valid) {
    const failures = await recordLoginFailure(identity);
    if (failures >= 5) await writeAudit({ action: "LOGIN_THROTTLED", targetType: "User", targetId: user?.id ?? null });
    redirect("/admin/login?error=credentials");
  }
  await clearLoginFailures(identity);
  if (user.passwordHash.startsWith("scrypt:")) {
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.password) } });
  }
  await createSession(user.id);
  await writeAudit({ actorId: user.id, tenantId: user.tenantId, action: "LOGIN_SUCCEEDED", targetType: "User", targetId: user.id });
  redirect("/admin");
}

export async function logout(): Promise<void> {
  const { getCurrentUser } = await import("@/lib/auth");
  const user = await getCurrentUser();
  await destroySession();
  if (user) await writeAudit({ actorId: user.id, tenantId: user.tenantId, action: "LOGOUT", targetType: "User", targetId: user.id });
  redirect("/admin/login");
}
