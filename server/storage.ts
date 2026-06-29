// Local filesystem storage for testing (replaces S3/Forge storage)
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const LOCAL_STORAGE_DIR = path.join(os.tmpdir(), "inkcalc-storage");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const filePath = path.join(LOCAL_STORAGE_DIR, key);
  ensureDir(path.dirname(filePath));
  const buffer = typeof data === "string" ? Buffer.from(data) : Buffer.from(data as any);
  fs.writeFileSync(filePath, buffer);
  console.log(`[Storage] Saved file: ${filePath}`);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  return `/manus-storage/${key}`;
}
