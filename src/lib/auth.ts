import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Principal, Capability } from "@/lib/authorization";
import { can, resolveTenantAccess } from "@/lib/authorization";
import { hashPassword, hashToken, verifyPassword } from "@/lib/credentials";

const COOKIE_NAME = "doctor_platform_session";
const SESSION_DAYS = 7;
const loginSchema = z.object({ email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()), password: z.string().min(1).max(256) });

export async function authenticate(emailInput: unknown, passwordInput: unknown): Promise<boolean> {
  const parsed = loginSchema.safeParse({ email: emailInput, password: passwordInput });
  if (!parsed.success) return false;
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) return false;
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { tokenHash: hashToken(rawToken), userId: user.id, expiresAt } });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, rawToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
  return true;
}

export async function getPrincipal(): Promise<Principal | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({ where: { id: session.id } });
    cookieStore.delete(COOKIE_NAME);
    return null;
  }
  return { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId };
}

export type AuthUser = Principal & { id: string; email: string; name: string | null };
export const SESSION_COOKIE = COOKIE_NAME;

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  (await cookies()).set(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({ where: { id: session.id } });
    (await cookies()).delete(COOKIE_NAME);
    return null;
  }
  return { id: session.user.id, userId: session.user.id, email: session.user.email, name: session.user.name, role: session.user.role, tenantId: session.user.tenantId };
}

export async function requirePrincipal(): Promise<Principal> {
  const principal = await getPrincipal();
  if (!principal) throw new Error("UNAUTHENTICATED");
  return principal;
}

export async function requireCapability(capability: Capability): Promise<Principal> {
  const principal = await requirePrincipal();
  if (!can(principal, capability)) throw new Error("FORBIDDEN");
  return principal;
}

export async function requireTenant(capability: Capability, requestedTenantId: string | null): Promise<{ principal: Principal; tenantId: string }> {
  const principal = await requireCapability(capability);
  const tenantId = resolveTenantAccess(principal, requestedTenantId);
  if (!tenantId) throw new Error("FORBIDDEN");
  if (principal.role !== UserRole.SUPER_ADMIN) {
    const exists = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!exists) throw new Error("FORBIDDEN");
  }
  return { principal, tenantId };
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  cookieStore.delete(COOKIE_NAME);
}

export const destroySession = logout;
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  return user;
}
export async function requireTenantAccess(tenantId: string, allowedRoles?: UserRole[]): Promise<AuthUser> {
  const user = await requireUser();
  if ((allowedRoles && !allowedRoles.includes(user.role)) || (user.role !== UserRole.SUPER_ADMIN && user.tenantId !== tenantId)) throw new Error("FORBIDDEN");
  return user;
}
export async function requireRole(...roles: UserRole[]): Promise<AuthUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new Error("FORBIDDEN");
  return user;
}

export { hashPassword, hashToken, verifyPassword, UserRole };
