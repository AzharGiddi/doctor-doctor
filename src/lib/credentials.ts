import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 256) throw new Error("Password must be between 12 and 256 characters.");
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [legacyScheme, legacySalt, legacyKey, legacyExtra] = encoded.split(":");
  if (legacyScheme === "scrypt" && legacySalt && legacyKey && legacyExtra === undefined && /^[a-f\d]{32}$/.test(legacySalt) && /^[a-f\d]{128}$/.test(legacyKey)) {
    const expectedLegacy = Buffer.from(legacyKey, "hex");
    const actualLegacy = await scrypt(password, Buffer.from(legacySalt, "hex"), expectedLegacy.length) as Buffer;
    if (timingSafeEqual(actualLegacy, expectedLegacy)) return true;
  }
  const [algorithm, saltHex, keyHex, extra] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltHex || !keyHex || extra !== undefined || !/^[a-f\d]{32}$/.test(saltHex) || !/^[a-f\d]{128}$/.test(keyHex)) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length) as Buffer;
  return timingSafeEqual(actual, expected);
}
