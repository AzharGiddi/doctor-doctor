import "server-only";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/credentials";

const WINDOW_MINUTES = 15;
const MAX_FAILURES = 5;

export function throttleKey(identity: string): string {
  return hashToken(identity.trim().toLowerCase());
}

export async function isLoginBlocked(identity: string, now = new Date()): Promise<boolean> {
  const row = await prisma.loginThrottle.findUnique({ where: { key: throttleKey(identity) }, select: { blockedUntil: true } });
  return Boolean(row?.blockedUntil && row.blockedUntil > now);
}

export async function recordThrottleAttempt(identity: string): Promise<number> {
  if (Math.random() < 0.02) {
    await prisma.loginThrottle.deleteMany({ where: { updatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
  }
  const key = throttleKey(identity);
  const [row] = await prisma.$queryRaw<Array<{ failures: number }>>`
    INSERT INTO "LoginThrottle" ("key", "failures", "windowStartedAt", "blockedUntil", "updatedAt")
    VALUES (${key}, 1, NOW(), NULL, NOW())
    ON CONFLICT ("key") DO UPDATE SET
      "failures" = CASE WHEN "LoginThrottle"."windowStartedAt" <= NOW() - (${WINDOW_MINUTES} * INTERVAL '1 minute') THEN 1 ELSE "LoginThrottle"."failures" + 1 END,
      "windowStartedAt" = CASE WHEN "LoginThrottle"."windowStartedAt" <= NOW() - (${WINDOW_MINUTES} * INTERVAL '1 minute') THEN NOW() ELSE "LoginThrottle"."windowStartedAt" END,
      "blockedUntil" = CASE WHEN (CASE WHEN "LoginThrottle"."windowStartedAt" <= NOW() - (${WINDOW_MINUTES} * INTERVAL '1 minute') THEN 1 ELSE "LoginThrottle"."failures" + 1 END) >= ${MAX_FAILURES} THEN NOW() + (${WINDOW_MINUTES} * INTERVAL '1 minute') ELSE NULL END,
      "updatedAt" = NOW()
    RETURNING "failures"
  `;
  return row?.failures ?? 1;
}

export const recordLoginFailure = recordThrottleAttempt;

export async function clearLoginFailures(identity: string): Promise<void> {
  await prisma.loginThrottle.deleteMany({ where: { key: throttleKey(identity) } });
}
