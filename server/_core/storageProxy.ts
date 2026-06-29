import type { Express } from "express";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ENV } from "./env";

const LOCAL_STORAGE_DIR = path.join(os.tmpdir(), "inkcalc-storage");

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    // If Forge/S3 is configured, proxy through it; otherwise serve from local filesystem
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      const filePath = path.join(LOCAL_STORAGE_DIR, key);
      if (!fs.existsSync(filePath)) {
        console.error(`[StorageProxy] Local file not found: ${filePath}`);
        res.status(404).send("File not found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentTypeMap: Record<string, string> = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".csv": "text/csv",
        ".json": "application/json",
      };
      const contentType = contentTypeMap[ext] || "application/octet-stream";
      res.set("Content-Type", contentType);
      res.set("Cache-Control", "no-store");
      res.set("Content-Disposition", `inline; filename="${path.basename(filePath)}"`);
      res.sendFile(filePath);
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
