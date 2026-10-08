import path from "node:path";

export interface StorageProvider {
  put(input: { key: string; data: Buffer; contentType: string }): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  url(key: string): Promise<string>;
}

function safeKey(key: string) {
  const normalized = key.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (!normalized || normalized.startsWith("/") || parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("Invalid storage key");
  }
  return parts.join(path.sep);
}

export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor(root = process.env.LOCAL_STORAGE_PATH ?? "./storage") {
    this.root = path.resolve(root);
  }

  private filePath(key: string) {
    const resolved = path.resolve(this.root, safeKey(key));
    if (!resolved.startsWith(`${this.root}${path.sep}`)) throw new Error("Invalid storage key");
    return resolved;
  }

  async put({ key, data }: { key: string; data: Buffer; contentType: string }) {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const file = this.filePath(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data, { flag: "wx" });
    return key;
  }

  async get(key: string) {
    const { readFile } = await import("node:fs/promises");
    return readFile(this.filePath(key));
  }

  async delete(key: string) {
    const { unlink } = await import("node:fs/promises");
    await unlink(this.filePath(key));
  }

  async url(key: string) {
    return `/media/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
}

export function getStorage(): StorageProvider {
  return new LocalStorageProvider();
}
