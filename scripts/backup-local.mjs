import { spawn } from "node:child_process";
import { cp, lstat, mkdir, open, readdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";

const backupRoot = path.resolve(process.env.BACKUP_PATH ?? "./backups");
const mediaRoot = path.resolve(process.env.LOCAL_STORAGE_PATH ?? "./storage");
if (backupRoot === mediaRoot || backupRoot.startsWith(`${mediaRoot}${path.sep}`) || mediaRoot.startsWith(`${backupRoot}${path.sep}`)) {
  throw new Error("BACKUP_PATH and LOCAL_STORAGE_PATH must not contain one another.");
}

const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const destination = path.join(backupRoot, `doctor-platform-${stamp}`);
await mkdir(destination, { recursive: true, mode: 0o700 });

const dbFile = path.join(destination, "postgres.dump");
const output = createWriteStream(dbFile, { flags: "wx", mode: 0o600 });
const child = spawn("docker", ["compose", "exec", "-T", "db", "pg_dump", "-U", "doctor", "-d", "doctor_platform", "--format=custom"], { stdio: ["ignore", "pipe", "pipe"] });
let stderr = "";
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => { stderr += chunk; });
const completion = new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`pg_dump failed (${code}): ${stderr}`)));
});
await Promise.all([pipeline(child.stdout, output), completion]);

async function copyTree(source, target) {
  await mkdir(target, { recursive: true, mode: 0o700 });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    const stat = await lstat(from);
    if (stat.isSymbolicLink()) throw new Error(`Refusing to back up a symbolic link: ${from}`);
    if (stat.isDirectory()) await copyTree(from, to);
    else if (stat.isFile()) await cp(from, to, { mode: 0o600, errorOnExist: true });
    else throw new Error(`Unsupported storage entry: ${from}`);
  }
}

await mkdir(mediaRoot, { recursive: true });
await copyTree(mediaRoot, path.join(destination, "media"));
const manifest = {
  createdAt: new Date().toISOString(),
  database: "postgres.dump",
  mediaDirectory: "media",
  application: "doctor-website-platform",
};
const manifestFile = await open(path.join(destination, "manifest.json"), "wx", 0o600);
try { await manifestFile.writeFile(`${JSON.stringify(manifest, null, 2)}\n`); }
finally { await manifestFile.close(); }
console.log(`Local backup created at ${destination}`);
