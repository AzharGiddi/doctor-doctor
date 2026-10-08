import "server-only";
import { prisma } from "@/lib/prisma";

export type AuditEvent = {
  actorId?: string | null;
  tenantId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function writeAudit(event: AuditEvent): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: event.actorId ?? null,
      tenantId: event.tenantId ?? null,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId ?? null,
      metadata: event.metadata,
    },
  });
}
