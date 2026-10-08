import { MediaType } from "@prisma/client";

export type VerifiedMedia = { type: MediaType; mimeType: string; extension: string };

function starts(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

export function inspectMedia(bytes: Uint8Array, claimedType: string): VerifiedMedia | null {
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) return null;
  if (starts(bytes, [0xff, 0xd8, 0xff])) return claimedType === "image/jpeg" ? { type: MediaType.IMAGE, mimeType: "image/jpeg", extension: ".jpg" } : null;
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return claimedType === "image/png" ? { type: MediaType.IMAGE, mimeType: "image/png", extension: ".png" } : null;
  if (starts(bytes, [0x47, 0x49, 0x46, 0x38]) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return claimedType === "image/gif" ? { type: MediaType.IMAGE, mimeType: "image/gif", extension: ".gif" } : null;
  if (starts(bytes, [0x52, 0x49, 0x46, 0x46]) && starts(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return claimedType === "image/webp" ? { type: MediaType.IMAGE, mimeType: "image/webp", extension: ".webp" } : null;
  if (bytes.length >= 12 && starts(bytes, [0x66, 0x74, 0x79, 0x70], 4)) return claimedType === "video/mp4" ? { type: MediaType.VIDEO, mimeType: "video/mp4", extension: ".mp4" } : null;
  if (starts(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return claimedType === "video/webm" ? { type: MediaType.VIDEO, mimeType: "video/webm", extension: ".webm" } : null;
  if (starts(bytes, [0x49, 0x44, 0x33]) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return claimedType === "audio/mpeg" ? { type: MediaType.AUDIO, mimeType: "audio/mpeg", extension: ".mp3" } : null;
  if (starts(bytes, [0x52, 0x49, 0x46, 0x46]) && starts(bytes, [0x57, 0x41, 0x56, 0x45], 8)) return ["audio/wav", "audio/x-wav"].includes(claimedType) ? { type: MediaType.AUDIO, mimeType: "audio/wav", extension: ".wav" } : null;
  if (starts(bytes, [0x4f, 0x67, 0x67, 0x53])) return claimedType === "audio/ogg" ? { type: MediaType.AUDIO, mimeType: "audio/ogg", extension: ".ogg" } : null;
  if (starts(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return claimedType === "application/pdf" ? { type: MediaType.DOCUMENT, mimeType: "application/pdf", extension: ".pdf" } : null;
  return null;
}

export function safeMediaFilename(input: string): string {
  const cleaned = input.normalize("NFKC").replace(/[\\/\0-\x1f\x7f]/g, "_").trim().slice(0, 200);
  return cleaned || "upload";
}
