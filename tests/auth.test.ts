import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { can, resolveTenantAccess, type Principal } from "../src/lib/authorization";
import { hashPassword, hashToken, verifyPassword } from "../src/lib/credentials";
import { scryptSync } from "node:crypto";
import { inspectMedia, safeMediaFilename } from "../src/lib/media-validation";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalStorageProvider } from "../src/lib/storage";
import "./db-tenant-isolation.test";

test("password hashes are salted and verify without exposing the password", async () => {
  const first = await hashPassword("local-test-password-123");
  const second = await hashPassword("local-test-password-123");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("local-test-password-123", first), true);
  assert.equal(await verifyPassword("wrong-password", first), false);
  assert.equal(await verifyPassword("anything", "invalid"), false);
  const legacySalt = Buffer.from("legacy-auth-salt");
  const legacyHash = scryptSync("local-test-password-123", legacySalt, 64).toString("hex");
  assert.equal(await verifyPassword("local-test-password-123", `scrypt:${legacySalt.toString("hex")}:${legacyHash}`), true);
  await assert.rejects(hashPassword("short"));
});

test("session tokens are stored as one-way hashes", () => {
  assert.equal(hashToken("opaque-token").length, 64);
  assert.notEqual(hashToken("opaque-token"), "opaque-token");
});

test("media validation checks file signatures and normalizes filenames", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  assert.equal(inspectMedia(png, "image/png")?.mimeType, "image/png");
  assert.equal(inspectMedia(png, "image/jpeg"), null);
  assert.equal(inspectMedia(new Uint8Array(0), "image/png"), null);
  assert.equal(inspectMedia(new Uint8Array(10 * 1024 * 1024 + 1), "image/png"), null);
  assert.equal(inspectMedia(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0]), "application/pdf")?.type, "DOCUMENT");
  assert.equal(safeMediaFilename("..\\private\u0000name.png"), ".._private_name.png");
});

test("local storage confines keys and round-trips tenant-prefixed files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "doctor-platform-storage-"));
  const storage = new LocalStorageProvider(root);
  try {
    await storage.put({ key: "tenant-a/images/logo.png", data: Buffer.from("image"), contentType: "image/png" });
    assert.equal((await storage.get("tenant-a/images/logo.png")).toString(), "image");
    assert.equal(await storage.url("tenant-a/images/logo.png"), "/media/tenant-a/images/logo.png");
    await assert.rejects(storage.get("../outside"), /Invalid storage key/);
    await storage.delete("tenant-a/images/logo.png");
    await assert.rejects(storage.get("tenant-a/images/logo.png"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tenant roles cannot select another tenant and capabilities follow role", () => {
  const doctor: Principal = { userId: "doctor", role: UserRole.DOCTOR, tenantId: "tenant-a" };
  const receptionist: Principal = { userId: "frontdesk", role: UserRole.RECEPTIONIST, tenantId: "tenant-a" };
  const contentManager: Principal = { userId: "editor", role: UserRole.CONTENT_MANAGER, tenantId: "tenant-a" };
  const superAdmin: Principal = { userId: "root", role: UserRole.SUPER_ADMIN, tenantId: null };
  assert.equal(resolveTenantAccess(doctor, null), "tenant-a");
  assert.equal(resolveTenantAccess(doctor, "tenant-a"), "tenant-a");
  assert.equal(resolveTenantAccess(doctor, "tenant-b"), null);
  assert.equal(can(receptionist, "appointments:manage"), true);
  assert.equal(can(receptionist, "content:manage"), false);
  assert.equal(can(contentManager, "content:manage"), true);
  assert.equal(can(contentManager, "appointments:manage"), false);
  assert.equal(resolveTenantAccess(superAdmin, "tenant-b"), "tenant-b");
  assert.equal(can(superAdmin, "platform:manage"), true);
  assert.equal(resolveTenantAccess(superAdmin, null), null);
  assert.equal(can(doctor, "website:manage"), true);
  assert.equal(can(doctor, "platform:manage"), false);
});
