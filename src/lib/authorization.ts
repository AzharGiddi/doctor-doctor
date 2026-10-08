import { UserRole } from "@prisma/client";

export type Principal = { userId: string; role: UserRole; tenantId: string | null };
export type Capability = "platform:manage" | "website:manage" | "content:manage" | "appointments:manage" | "availability:manage";

const roleCapabilities: Record<UserRole, readonly Capability[]> = {
  SUPER_ADMIN: ["platform:manage", "website:manage", "content:manage", "appointments:manage", "availability:manage"],
  DOCTOR: ["website:manage", "content:manage", "appointments:manage", "availability:manage"],
  RECEPTIONIST: ["appointments:manage", "availability:manage"],
  CONTENT_MANAGER: ["content:manage"],
};

export function can(principal: Principal, capability: Capability): boolean {
  return roleCapabilities[principal.role].includes(capability);
}

export function resolveTenantAccess(principal: Principal, requestedTenantId: string | null): string | null {
  if (principal.role === UserRole.SUPER_ADMIN) return requestedTenantId;
  if (!principal.tenantId) return null;
  return requestedTenantId === null || requestedTenantId === principal.tenantId ? principal.tenantId : null;
}

export function canManageTenant(principal: Principal, tenantId: string): boolean {
  return principal.role === UserRole.SUPER_ADMIN || principal.tenantId === tenantId;
}
