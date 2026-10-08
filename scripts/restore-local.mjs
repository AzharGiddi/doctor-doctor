import { spawn } from "node:child_process";
import { cp, lstat, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const sourceArg = args[args.indexOf("--backup") + 1];
const confirmed = args.includes("--confirm");
if (!sourceArg || !confirmed) throw new Error("Usage: npm run restore:local -- --backup <backup-directory> --confirm");

const backupRoot = path.resolve(process.env.BACKUP_PATH ?? "./backups");
const backupDir = path.resolve(sourceArg);
const mediaRoot = path.resolve(process.env.LOCAL_STORAGE_PATH ?? "./storage");
const projectRoot = path.resolve(".");
if (!backupDir.startsWith(`${backupRoot}${path.sep}`)) throw new Error("Restore source must be inside BACKUP_PATH.");
if (mediaRoot === projectRoot || !mediaRoot.startsWith(`${projectRoot}${path.sep}`)) throw new Error("Restore target must be a subdirectory of the project root.");
const dbFile = path.join(backupDir, "postgres.dump");
const mediaBackup = path.join(backupDir, "media");
const stat = await lstat(dbFile);
if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Backup dump is missing or invalid.");
const manifest = JSON.parse(await readFile(path.join(backupDir, "manifest.json"), "utf8"));
if (manifest.database !== "postgres.dump" || manifest.mediaDirectory !== "media") throw new Error("Backup manifest is invalid.");

async function validateTree(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const sourcePath = path.join(directory, entry.name);
    const childStat = await lstat(sourcePath);
    if (childStat.isSymbolicLink()) throw new Error(`Refusing to restore a symbolic link: ${sourcePath}`);
    if (childStat.isDirectory()) await validateTree(sourcePath);
    else if (!childStat.isFile()) throw new Error(`Unsupported backup entry: ${sourcePath}`);
  }
}
await validateTree(mediaBackup);

console.warn("This will replace the local PostgreSQL database and local media directory.");
const restore = spawn("docker", ["compose", "exec", "-T", "db", "pg_restore", "--clean", "--if-exists", "--no-owner", "--no-privileges", "-U", "doctor", "-d", "doctor_platform"], { stdio: ["pipe", "inherit", "inherit"] });
const source = await import("node:fs");
const dumpStream = source.createReadStream(dbFile);
await new Promise((resolve, reject) => {
  restore.once("error", reject);
  restore.once("close", (code) => code === 0 ? resolve() : reject(new Error(`pg_restore failed (${code}).`)));
  dumpStream.once("error", reject);
  dumpStream.pipe(restore.stdin);
});

async function copyTree(from, to) {
  await mkdir(to, { recursive: true, mode: 0o700 });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const sourcePath = path.join(from, entry.name);
    const targetPath = path.join(to, entry.name);
    const childStat = await lstat(sourcePath);
    if (childStat.isSymbolicLink()) throw new Error(`Refusing to restore a symbolic link: ${sourcePath}`);
    if (childStat.isDirectory()) await copyTree(sourcePath, targetPath);
    else if (childStat.isFile()) await cp(sourcePath, targetPath, { force: true, mode: 0o600 });
    else throw new Error(`Unsupported backup entry: ${sourcePath}`);
  }
}

await rm(mediaRoot, { recursive: true, force: true });
await copyTree(mediaBackup, mediaRoot);
console.log(`Local database and media restored from ${backupDir}`);
